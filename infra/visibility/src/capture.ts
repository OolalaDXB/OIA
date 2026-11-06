import { createHash } from "node:crypto";
import { parse } from "yaml";
import { enginePlan } from "./load";
import { normalize, termRegex } from "./scan";
import type { Prompt, SubjectBundle } from "./schema";

/**
 * Manual capture of answers copied from consumer AI apps (free plans), for
 * engines declared `collection: manual` in measurement.yaml. One Markdown file
 * per subject, engine and day. Analysis is deterministic only (alias and
 * domain matching, URL extraction): the same raw metrics Elmo derives from
 * name/alias/domain matching, recorded with collection "manual-app" so they are
 * never mixed with API answers.
 */

export const CAPTURE_FORMAT = 1;
const PLACEHOLDER_ANSWER = "(coller la réponse ici)";
const PLACEHOLDER_SOURCES = "(une URL par ligne, telles qu'affichées par l'app ; laisser vide si aucune)";
const NOT_CAPTURED = /^NON CAPTURÉ\s*:\s*(.{3,})$/i;
const REQUIRED_META = ["app", "loggedIn", "memory", "country", "capturedBy", "capturedAt"] as const;

export function promptsForEngine(b: SubjectBundle, engine: string): Prompt[] {
  const plan = enginePlan(b);
  if (!plan.manualEngines.includes(engine)) {
    const declared = b.measurement.engines.map((e) => `${e.model} (${e.collection})`).join(", ");
    throw new Error(`engine "${engine}" is not a manual engine of ${b.subject.id}: ${declared}`);
  }
  const langs = plan.reportLanguages[engine] ?? b.subject.languages;
  return b.panel.prompts
    .filter((p) => p.status === "active" && langs.includes(p.language))
    .sort((x, y) => x.id.localeCompare(y.id, "en", { numeric: true }));
}

export function renderCaptureTemplate(b: SubjectBundle, engine: string, date: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("date: YYYY-MM-DD expected");
  const prompts = promptsForEngine(b, engine);
  const L = [
    "---",
    `oia-capture: ${CAPTURE_FORMAT}`,
    `subject: ${b.subject.id}`,
    `engine: ${engine}`,
    `date: "${date}"`,
    `panelVersion: ${b.panel.panelVersion}`,
    'app: ""          # application et version, ex. « ChatGPT iOS 1.2026.310 » ou « claude.ai web »',
    "plan: free",
    'loggedIn: ""     # oui / non',
    'memory: ""       # coupée / active (couper la mémoire et l\'historique si possible)',
    'country: ""      # pays d\'où la question est posée (ISO, ex. AE, FR)',
    'capturedBy: ""',
    'capturedAt: ""   # heure de la première question, ISO, ex. 2026-11-10T09:30+04:00',
    "---",
    "",
    "<!--",
    "Mode d'emploi :",
    "- Une nouvelle conversation par question, recherche web activée si l'app la propose.",
    "- Coller la question EXACTEMENT telle qu'écrite (citation sous chaque titre).",
    "- Sous « Réponse », coller la réponse complète, sans la retoucher.",
    "- Sous « Sources », coller les URL affichées par l'app, une par ligne.",
    "- Question non posée ou sans réponse : écrire « NON CAPTURÉ : <raison> » sous « Réponse ».",
    "- Ne pas modifier les titres « ## <id>@v<version> ».",
    "Puis : pnpm --filter @oia/visibility-infra subjects capture-check <ce fichier>",
    "-->",
    "",
  ];
  for (const p of prompts) {
    L.push(`## ${p.id}@v${p.version}`, "", `> ${p.text}`, "", "### Réponse", "", PLACEHOLDER_ANSWER, "", "### Sources", "", PLACEHOLDER_SOURCES, "");
  }
  return `${L.join("\n")}`;
}

export type CaptureEntry = {
  key: string;
  question: string;
  status: "captured" | "not-captured" | "unfilled";
  reason?: string;
  answer: string;
  sources: string[];
};

export type ParsedCapture = { meta: Record<string, unknown>; entries: CaptureEntry[]; problems: string[] };

const URL_RE = /https?:\/\/[^\s<>()\[\]"'`]+/g;
const trimUrl = (u: string) => u.replace(/[.,;:!?»)\]]+$/, "");

export function parseCapture(text: string): ParsedCapture {
  const problems: string[] = [];
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) return { meta: {}, entries: [], problems: ["front matter (--- … ---) missing"] };
  let meta: Record<string, unknown> = {};
  try {
    meta = (parse(fm[1]!) ?? {}) as Record<string, unknown>;
  } catch (e) {
    problems.push(`front matter is not valid YAML: ${String(e)}`);
  }
  const body = text.slice(fm[0].length).replace(/<!--[\s\S]*?-->/g, "");
  const parts = body.split(/^## /m).slice(1);
  const entries: CaptureEntry[] = [];
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const key = (nl < 0 ? part : part.slice(0, nl)).trim();
    const rest = nl < 0 ? "" : part.slice(nl + 1);
    const question = (rest.match(/^>\s?(.*)$/m)?.[1] ?? "").trim();
    const ai = rest.indexOf("### Réponse");
    const si = rest.indexOf("### Sources");
    if (ai < 0 || si < 0 || si < ai) {
      problems.push(`${key}: sections « ### Réponse » and « ### Sources » expected, in that order`);
      continue;
    }
    let answer = rest.slice(ai + "### Réponse".length, si).trim();
    const sourcesText = rest.slice(si + "### Sources".length).replace(PLACEHOLDER_SOURCES, "").trim();
    const sources = [...new Set((sourcesText.match(URL_RE) ?? []).map(trimUrl))];
    const nc = answer.match(NOT_CAPTURED);
    if (answer === "" || answer === PLACEHOLDER_ANSWER) {
      problems.push(`${key}: answer not filled (paste it, or write « NON CAPTURÉ : <raison> »)`);
      entries.push({ key, question, status: "unfilled", answer: "", sources: [] });
      continue;
    }
    entries.push(
      nc
        ? { key, question, status: "not-captured", reason: nc[1]!.trim(), answer: "", sources: [] }
        : { key, question, status: "captured", answer, sources },
    );
  }
  return { meta, entries, problems };
}

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

type Entity = { name: string; names: string[]; domains: string[] };

function subjectEntity(b: SubjectBundle): Entity {
  const s = b.subject;
  const live = s.aliases.filter((a) => a.status !== "rejected");
  return {
    name: s.displayName,
    names: [s.displayName, ...live.filter((a) => a.kind !== "domain").map((a) => a.value)],
    domains: [
      hostOf(s.urls.primary),
      ...s.urls.additional.filter((a) => a.status !== "rejected").map((a) => hostOf(a.url)),
      ...live.filter((a) => a.kind === "domain").map((a) => a.value.toLowerCase()),
    ].filter(Boolean),
  };
}

function competitorEntities(b: SubjectBundle): Entity[] {
  return b.subject.competitors
    .filter((c) => c.status !== "rejected")
    .map((c) => ({ name: c.name, names: [c.name, ...c.aliases], domains: c.domains }));
}

function match(e: Entity, answer: string, urls: string[]) {
  const text = normalize(answer);
  const terms = [...new Set([...e.names, ...e.domains])].filter((t) => termRegex(t).test(text));
  const citedUrls = urls.filter((u) => e.domains.some((d) => onDomain(hostOf(u), d)));
  return { mentioned: terms.length > 0, matchedTerms: terms, cited: citedUrls.length > 0, citedUrls };
}

export const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export type CaptureReport = {
  format: number;
  collection: "manual-app";
  subject: string;
  engine: string;
  date: string;
  panelVersion: number;
  meta: Record<string, unknown>;
  fileSha256: string;
  checkedAt: string;
  problems: string[];
  answers: Array<{
    key: string;
    status: "captured" | "not-captured" | "unfilled";
    reason?: string;
    answerSha256?: string;
    citedUrls: string[];
    brand: ReturnType<typeof match>;
    competitors: Record<string, ReturnType<typeof match>>;
  }>;
  summary: {
    expected: number;
    captured: number;
    notCaptured: number;
    unfilled: number;
    brandMentioned: number;
    brandCited: number;
    competitorsMentioned: Record<string, number>;
    citedDomains: Record<string, number>;
  };
};

/** Validate a filled capture against the subject, then derive raw metrics. No statistics. */
export function checkCapture(b: SubjectBundle, fileText: string, now = new Date()): CaptureReport {
  const parsed = parseCapture(fileText);
  const problems = [...parsed.problems];
  const m = parsed.meta;
  const engine = String(m.engine ?? "");
  const date = String(m.date ?? "");
  if (m["oia-capture"] !== CAPTURE_FORMAT) problems.push(`oia-capture: ${CAPTURE_FORMAT} expected`);
  if (m.subject !== b.subject.id) problems.push(`subject: "${String(m.subject)}" is not "${b.subject.id}"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) problems.push("date: YYYY-MM-DD expected");
  if (m.panelVersion !== b.panel.panelVersion) problems.push(`panelVersion ${String(m.panelVersion)} is not the current v${b.panel.panelVersion}`);
  for (const k of REQUIRED_META) if (!String(m[k] ?? "").trim()) problems.push(`front matter: « ${k} » not filled`);

  let expected: Prompt[] = [];
  try {
    expected = promptsForEngine(b, engine);
  } catch (e) {
    problems.push((e as Error).message);
  }
  const byKey = new Map(parsed.entries.map((e) => [e.key, e]));
  for (const p of expected) {
    const key = `${p.id}@v${p.version}`;
    const e = byKey.get(key);
    if (!e) problems.push(`${key}: missing`);
    else if (e.question !== p.text) problems.push(`${key}: question text was changed (it must stay exactly as written)`);
  }
  const expectedKeys = new Set(expected.map((p) => `${p.id}@v${p.version}`));
  for (const e of parsed.entries) if (!expectedKeys.has(e.key)) problems.push(`${e.key}: not an active question of this engine`);

  const brand = subjectEntity(b);
  const rivals = competitorEntities(b);
  const answers = parsed.entries
    .filter((e) => expectedKeys.has(e.key))
    .map((e) => {
      const urls = [...new Set([...e.sources, ...(e.answer.match(URL_RE) ?? []).map(trimUrl)])];
      return {
        key: e.key,
        status: e.status,
        ...(e.reason ? { reason: e.reason } : {}),
        ...(e.status === "captured" ? { answerSha256: sha256(e.answer) } : {}),
        citedUrls: urls,
        brand: match(brand, e.answer, urls),
        competitors: Object.fromEntries(rivals.map((r) => [r.name, match(r, e.answer, urls)])),
      };
    });

  const captured = answers.filter((a) => a.status === "captured");
  const competitorsMentioned: Record<string, number> = {};
  for (const r of rivals) competitorsMentioned[r.name] = captured.filter((a) => a.competitors[r.name]!.mentioned).length;
  const citedDomains: Record<string, number> = {};
  for (const a of captured) for (const h of new Set(a.citedUrls.map(hostOf).filter(Boolean))) citedDomains[h] = (citedDomains[h] ?? 0) + 1;

  return {
    format: CAPTURE_FORMAT,
    collection: "manual-app",
    subject: b.subject.id,
    engine,
    date,
    panelVersion: b.panel.panelVersion,
    meta: m,
    fileSha256: sha256(fileText),
    checkedAt: now.toISOString(),
    problems,
    answers,
    summary: {
      expected: expected.length,
      captured: captured.length,
      notCaptured: answers.filter((a) => a.status === "not-captured").length,
      unfilled: answers.filter((a) => a.status === "unfilled").length,
      brandMentioned: captured.filter((a) => a.brand.mentioned).length,
      brandCited: captured.filter((a) => a.brand.cited).length,
      competitorsMentioned,
      citedDomains,
    },
  };
}
