import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { SOURCE_REGISTRY, type SourceEntry } from "@oia/registry";
import { createMistralProvider, type MistralProvider } from "@oia/providers";
import {
  ScoutResultSchema,
  SCOUT_SYSTEM,
  anchorViolations,
  chooseListingLink,
  scoutPrompt,
  CONSENT_LABELS,
  type ScoutPage,
  type ScoutedCall,
} from "@oia/intelligence";
import type { MaterialFact } from "@oia/ingestion";
import { normalizeKind } from "@oia/ingestion/opportunity-kinds";
import { scoutedToConsole } from "./scout-to-console";
import { fromRoot } from "./paths";

/**
 * The aid scout — browse the sources nobody wrote a connector for.
 *
 * Seventeen of the eighteen registry sources have no machine access. They were
 * `DECLARED`, which honestly means "a human is supposed to look at this", and
 * no human ever did. Brittany's regional aid, aides-territoires, BPI,
 * France 2030, CIR/CII/JEI, Hub71, ADIO — all of it sat in a YAML file doing
 * nothing.
 *
 * This renders each of those pages in a real browser (most are JavaScript-heavy
 * and return an empty shell to a plain fetch), hands the visible text and the
 * page's own links to Mistral, and turns what comes back into ordinary
 * candidate records.
 *
 * Three rules keep it from becoming a rumour mill:
 *
 *   1. ANCHORED OR DROPPED. Every call must cite a link that is actually on the
 *      page, and any quote must actually appear in its text. Enforced in
 *      `anchorViolations`, deterministically, not by asking the model nicely.
 *   2. PROVENANCE SAYS A MODEL READ IT. Every fact carries
 *      extractionMethod "llm" and the model id, so nothing a model produced can
 *      ever be mistaken for something a rule read.
 *   3. IT LANDS AT MANUAL_REVIEW_REQUIRED. Exactly like a TED notice. The gate
 *      still refuses PURSUE and a human still verifies. An agent that could
 *      certify its own output would remove the only real property this product
 *      has.
 *
 *   pnpm --filter @oia/workers scout:aid
 *   pnpm --filter @oia/workers scout:aid -- --source region-bretagne --dry-run
 */

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.slice(hit.indexOf("=") + 1);
  const next = process.argv[process.argv.indexOf(hit) + 1];
  return next && !next.startsWith("--") ? next : "";
}

/**
 * Which sources the scout may visit.
 *
 * BLOCKED is excluded and that is not a technical limit: Upwork, Malt, Comet
 * and Acquire forbid automated collection in their terms. Having a browser that
 * could does not make it allowed, and the account at risk would be the owner's.
 */
export function scoutableSources(sources: readonly SourceEntry[], only?: string): SourceEntry[] {
  const wanted = only?.split(",").map((s) => s.trim()).filter(Boolean);
  return sources.filter((s) => {
    if (s.status === "BLOCKED") return false;
    if (!s.url) return false;
    if (wanted && wanted.length > 0) return wanted.includes(s.id);
    // LIVE sources already have a connector doing a better job than a browser.
    return s.status === "DECLARED" || s.status === "FIXTURE_ONLY";
  });
}

/**
 * Accept the cookie banner, as a person would.
 *
 * Three of the French portals returned their consent dialog as the entire page
 * text: the model was handed a GDPR notice and correctly reported no funding
 * calls in it. Clicking the button a visitor clicks is not circumventing
 * anything — it is the only way to see the page that is being offered.
 */
async function dismissConsent(page: Page): Promise<string | null> {
  for (const label of CONSENT_LABELS) {
    const button = page.getByRole("button", { name: new RegExp(`^\\s*${label}\\s*$`, "i") }).first();
    try {
      if (await button.isVisible({ timeout: 700 })) {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(800);
        return label;
      }
    } catch {
      // Not this one; the next label, or none at all.
    }
  }
  return null;
}

/** Text and links as they stand right now. */
async function harvest(page: Page, url: string): Promise<ScoutPage & { linkTexts: { url: string; text: string }[] }> {
  const text = (await page.evaluate("document.body ? document.body.innerText : ''")) as string;
  const pairs = (await page.evaluate(
    "Array.from(document.querySelectorAll('a[href]')).map(function(a){ return { url: String(a.href || ''), text: (a.innerText || a.textContent || '').trim().slice(0,120) }; }).filter(function(p){ return p.url.slice(0,4) === 'http'; })",
  )) as { url: string; text: string }[];
  const seen = new Map<string, { url: string; text: string }>();
  for (const p of pairs) if (!seen.has(p.url)) seen.set(p.url, p);
  const linkTexts = [...seen.values()];
  return { url, text, links: linkTexts.map((l) => l.url), linkTexts };
}

/** Render a page and take its text plus every absolute link on it. */
async function readPage(browser: Browser, url: string): Promise<ScoutPage & { trail: string[] }> {
  const context = await browser.newContext({
    userAgent: "OIA-Funding/0.0 (internal research; contact ops)",
    locale: "fr-FR",
  });
  const page = await context.newPage();
  const trail: string[] = [];
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    // Aid portals are overwhelmingly client-rendered: aides-territoires is a
    // React app, and several regional sites paint their list after an XHR. Wait
    // for the network to settle rather than guessing at a delay, but never let
    // one slow site hold the run.
    await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1500);

    const consented = await dismissConsent(page);
    if (consented) trail.push(`accepted the cookie banner ("${consented}")`);

    let harvested = await harvest(page, url);

    // An entry page is usually the site's front door, not its list of calls.
    // Follow ONE link, chosen from what this page itself offers, and only when
    // it scores clearly — a wrong page found is worse than nothing found.
    const listing = chooseListingLink(url, harvested.linkTexts);
    if (listing) {
      try {
        await page.goto(listing.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
        await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => {});
        await page.waitForTimeout(1200);
        await dismissConsent(page);
        const deeper = await harvest(page, listing.url);
        // Only keep the move if it actually gained something to read.
        if (deeper.text.length > harvested.text.length) {
          trail.push(`followed "${listing.url}" (${listing.why})`);
          harvested = deeper;
        } else {
          trail.push(`tried "${listing.url}" but it had less text — stayed on the entry page`);
        }
      } catch (err) {
        trail.push(`could not follow "${listing.url}": ${err instanceof Error ? err.message.slice(0, 120) : ""}`);
      }
    }

    return { url: harvested.url, text: harvested.text, links: harvested.links, trail };
  } finally {
    await context.close();
  }
}

function factsFor(call: ScoutedCall, artifactId: string, model: string): MaterialFact[] {
  const base = {
    // The page IS the official source; a model did the reading. Both halves of
    // that sentence are carried: the classification says where it came from,
    // the extractionMethod below says who read it.
    classification: "EXTRACTED_FROM_OFFICIAL_SOURCE" as const,
    sourceArtifactId: artifactId,
    locator: { type: "DOCUMENT_SECTION" as const, value: call.sourceUrl },
    extractionMethod: "llm",
    extractingProvider: "mistral",
    extractingModel: model,
    // A model reading a page is a good lead and a weak fact. The number says so
    // rather than the prose saying so, because the gate reads the number.
    extractionConfidence: 0.5,
    validationResult: "unchecked" as const,
  };
  const out: MaterialFact[] = [];
  const add = (field: string, value: string) => {
    if (value.trim()) {
      out.push({ ...base, field, normalizedValue: value.trim(), originalSourceText: call.quote || value.trim() });
    }
  };
  add("scope", call.summary);
  add("eligibility", call.eligibility);
  add("estimated_value", call.amountText);
  add("deadline_text", call.deadlineText);
  return out;
}

async function main() {
  const apiKey = process.env["MISTRAL_API_KEY"] ?? "";
  const dryRun = arg("dry-run") !== undefined;
  const outDir = fromRoot("outputs/scout");
  mkdirSync(outDir, { recursive: true });

  const sources = scoutableSources(SOURCE_REGISTRY.sources, arg("source"));
  if (sources.length === 0) {
    console.error("scout: no scoutable source matched — nothing to do");
    return;
  }

  if (!apiKey) {
    // Honest degradation: say precisely what did not happen and why, and do not
    // fail the run that contains it.
    console.warn(
      `scout: MISTRAL_API_KEY is not set — ${sources.length} source(s) were NOT read. ` +
        "Add it as a GitHub Actions secret to turn the scout on. Nothing else in this run is affected.",
    );
    writeFileSync(
      join(outDir, "report.md"),
      `# Aid scout\n\n> Not run: no MISTRAL_API_KEY. ${sources.length} source(s) waiting: ${sources
        .map((s) => s.id)
        .join(", ")}.\n`,
      "utf8",
    );
    return;
  }

  // A budget, not a suggestion. One call per source plus headroom for the
  // single JSON repair retry the provider allows.
  const maxCalls = Number(process.env["SCOUT_MAX_CALLS"] ?? String(sources.length * 2));
  const model = process.env["LLM_MODEL"] ?? "mistral-large-latest";
  // Keep every raw model response. The last run produced 36,823 output tokens
  // and reported zero findings, and nothing on disk could say which of the two
  // was lying.
  const rawDir = join(outDir, "raw");
  mkdirSync(rawDir, { recursive: true });
  const mistral: MistralProvider = createMistralProvider({
    apiKey,
    model,
    maxCalls,
    onRawResponse: ({ purpose, text }) => {
      const name = purpose.replace(/[^a-z0-9._-]+/gi, "_");
      writeFileSync(join(rawDir, `${name}.json`), text, "utf8");
    },
  });

  console.log(`scout: ${sources.length} source(s), budget ${maxCalls} model call(s), model ${model}`);

  const browser = await chromium.launch({
    executablePath: process.env["PLAYWRIGHT_CHROMIUM"] || undefined,
    args: ["--no-sandbox"],
  });

  const found: Array<ScoutedCall & { sourceId: string; contentHash: string; facts: MaterialFact[] }> = [];
  const perSource: Array<{ id: string; status: string; kept: number; dropped: number; note: string; chars?: number; links?: number }> = [];

  try {
    for (const source of sources) {
      try {
        const page = await readPage(browser, source.url);
        const contentHash = createHash("sha256").update(page.text, "utf8").digest("hex");
        // Keep exactly what the model was shown. When a source returns nothing,
        // the question is always "was the page empty, or did the model decline?"
        // — and that is answerable only by looking at what it saw.
        mkdirSync(join(outDir, "pages"), { recursive: true });
        writeFileSync(join(outDir, "pages", `${source.id}.txt`), `${page.url}\n\n${page.text}`, "utf8");
        writeFileSync(join(outDir, "pages", `${source.id}.links.txt`), page.links.join("\n"), "utf8");
        console.log(`[${source.id}] ${page.text.length} chars, ${page.links.length} link(s)` + (page.trail.length ? ` · ${page.trail.join(" · ")}` : ""));

        if (page.text.trim().length < 200) {
          perSource.push({ id: source.id, status: "EMPTY_PAGE", kept: 0, dropped: 0, note: "the page rendered almost no text", chars: page.text.length, links: page.links.length });
          console.warn(`[${source.id}] rendered ${page.text.length} chars — skipping rather than guessing`);
          continue;
        }

        const { data } = await mistral.extract({
          schema: ScoutResultSchema,
          schemaName: "ScoutResult",
          system: SCOUT_SYSTEM,
          input: scoutPrompt(page),
          purpose: `scout:${source.id}`,
        });

        const { kept, dropped } = anchorViolations(page, data.calls);
        for (const d of dropped) {
          console.warn(`[${source.id}] dropped "${d.title}": ${d.reason}`);
        }
        for (const call of kept) {
          found.push({
            ...call,
            kind: normalizeKind(call.kind),
            issuer: call.issuer || source.operator || source.name,
            sourceId: source.id,
            contentHash,
            facts: factsFor(call, `scout-${source.id}-${contentHash.slice(0, 12)}`, model),
          });
        }
        perSource.push({ id: source.id, status: "OK", kept: kept.length, dropped: dropped.length, note: [data.note, ...page.trail].filter(Boolean).join(" · "), chars: page.text.length, links: page.links.length });
        console.log(`[${source.id}] ${kept.length} call(s) kept, ${dropped.length} dropped`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        perSource.push({ id: source.id, status: "ERROR", kept: 0, dropped: 0, note: message.slice(0, 300) });
        console.error(`[${source.id}] ${message}`);
        if (message.includes("call budget")) break;
      }
    }
  } finally {
    await browser.close();
  }

  const spent = mistral.usage();
  const report = [
    "# Aid scout",
    "",
    `- sources read: ${perSource.filter((p) => p.status === "OK").length} of ${sources.length}`,
    `- calls kept: ${found.length}`,
    `- calls dropped as unanchored: ${perSource.reduce((n, p) => n + p.dropped, 0)}`,
    `- model calls: ${spent.calls} · tokens in/out: ${spent.inputTokens}/${spent.outputTokens}`,
    "",
    "## Per source",
    ...perSource.map(
      (p) =>
        `- **${p.id}** — ${p.status} · ${p.kept} kept, ${p.dropped} dropped` +
        (p.chars !== undefined ? ` · page: ${p.chars} chars, ${p.links} link(s)` : "") +
        (p.note ? ` — ${p.note}` : ""),
    ),
    "",
    "## Calls",
    ...found.map(
      (c) =>
        `- **${c.title}** (${c.kind}) — ${c.issuer}\n  - ${c.sourceUrl}\n  - amount: ${c.amountText || "—"} · deadline: ${c.deadlineText || "—"}`,
    ),
    "",
    "> Every call above was read by a model and is UNVERIFIED. Each is anchored to a link that",
    "> really appears on the page it was read from — that is a check, not a promise — but a human",
    "> still has to open it. Nothing here can reach PURSUE on its own.",
    "",
  ].join("\n");
  writeFileSync(join(outDir, "report.md"), report, "utf8");
  writeFileSync(join(outDir, "calls.json"), JSON.stringify({ generatedAt: new Date().toISOString(), found, perSource }, null, 2), "utf8");

  // The console dataset is the deliverable. A report nobody opens is the same
  // as not running: the aid pages get read, the console looks unchanged, and
  // the product is back to "nothing runs" one layer deeper.
  const sourcePages: Record<string, string> = {};
  const forProjects: Record<string, readonly string[]> = {};
  for (const source of sources) {
    sourcePages[source.id] = source.url;
    forProjects[source.id] = source.forProjects;
  }
  const consoleData = scoutedToConsole(found, sourcePages, forProjects, model);
  writeFileSync(join(outDir, "console.json"), JSON.stringify(consoleData, null, 2), "utf8");
  console.log(`scout: wrote ${consoleData.records.length} console record(s) to outputs/scout/console.json`);

  console.log(`scout: ${found.length} call(s) kept across ${sources.length} source(s); ${spent.calls} model call(s)`);
  if (dryRun) console.log("scout: --dry-run, nothing published");
}

if (process.argv[1] && process.argv[1].endsWith("scout-aid.ts")) {
  main().catch((err) => {
    console.error("scout failed:", err);
    process.exitCode = 1;
  });
}
