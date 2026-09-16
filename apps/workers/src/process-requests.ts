import { appendFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "yaml";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadEnv } from "@oia/config";
import { createPolicy } from "@oia/audit";
import { PROJECT_REGISTRY, ProjectEntrySchema, findProject } from "@oia/registry";
import {
  safeFetch,
  ingestOfficialArtifact,
  extractTenderFacts,
  normalizeKind,
  type ArtifactManifestEntry,
  type LiveFetchAttempt,
} from "@oia/ingestion";
import { createWatchClient, watchConfigFromEnv } from "@oia/watch/supabase";
import { fromRoot } from "./paths";

/**
 * Do what the console asked for.
 *
 * The console is a static export with no backend and no egress: it can ask, not
 * act. This is the other half — it runs where there is a network, drains the
 * queue, and writes back what happened.
 *
 * Two request kinds matter most:
 *
 *   INGEST_URL   the universal intake. A call found anywhere — a regional
 *                portal, a mailing list, a site nobody has an API for — becomes
 *                a first-class record: fetched, hashed, verified against its
 *                own domain, read for its scope and eligibility, and gated
 *                exactly like anything TED produced. This is what makes
 *                "confidential sites" tractable without a connector each.
 *
 *   DISCOVERY    a request to run the queries for named projects. Executed by
 *                the discovery workflow, which owns that job — so it is claimed
 *                here (`--plan`), run there, and closed here (`--settle`)
 *                against what actually happened. A request that is merely
 *                marked done without a run is the lie this split exists to
 *                avoid: the console would show "searched" for a search that
 *                never happened.
 *
 *   pnpm --filter @oia/workers requests            # drain INGEST_URL + drafts
 *   pnpm --filter @oia/workers requests -- --plan  # claim DISCOVERY, print the slugs
 *   pnpm --filter @oia/workers requests -- --settle=success
 */

interface RequestRow {
  id: string;
  kind: "DISCOVERY" | "INGEST_URL" | "LINK_CHECK";
  payload: Record<string, unknown>;
  requested_by: string;
}

/** Project drafts created in the console, written into the registry as YAML. */
export async function applyProjectDrafts(client: SupabaseClient): Promise<string[]> {
  const { data, error } = await client.from("project_drafts").select("slug, entry").eq("status", "PENDING");
  if (error) throw new Error(`project_drafts: ${error.message}`);

  const applied: string[] = [];
  for (const row of (data ?? []) as { slug: string; entry: unknown }[]) {
    // The same Zod schema the YAML files are held to. A draft that would not be
    // a valid registry entry is rejected here rather than written and broken.
    const parsed = ProjectEntrySchema.safeParse(row.entry);
    if (!parsed.success) {
      await client
        .from("project_drafts")
        .update({ status: "REJECTED", error: parsed.error.message.slice(0, 2000) })
        .eq("slug", row.slug);
      console.error(`draft ${row.slug} rejected: ${parsed.error.message}`);
      continue;
    }

    const file = join(fromRoot("registry/projects"), `${parsed.data.slug}.yaml`);
    const header =
      "# OIA project registry entry. One file per project — this is the source of truth.\n" +
      "# Created from the console and materialised here by the worker, so the YAML\n" +
      "# stays authoritative rather than the console becoming a second truth.\n\n";
    writeFileSync(file, header + stringify(parsed.data), "utf8");
    await client
      .from("project_drafts")
      .update({ status: "APPLIED", applied_at: new Date().toISOString() })
      .eq("slug", row.slug);
    applied.push(parsed.data.slug);
    console.log(`applied draft → registry/projects/${parsed.data.slug}.yaml`);
  }
  return applied;
}

/**
 * Ingest one URL as a first-class opportunity.
 *
 * Deliberately NOT a shortcut past the pipeline: the page is fetched with the
 * same SSRF-guarded fetcher, hashed, checked against its own domain, read for
 * scope and eligibility, and left at MANUAL_REVIEW_REQUIRED. Pasting a URL
 * cannot produce a verified record — only a human can.
 */
async function ingestUrl(payload: Record<string, unknown>, userAgent: string, timeoutMs: number) {
  const url = String(payload["url"] ?? "").trim();
  if (!url) throw new Error("no url in the request payload");
  const projectSlug = payload["projectSlug"] ? String(payload["projectSlug"]) : undefined;
  const kindHint = normalizeKind(payload["kindHint"] ? String(payload["kindHint"]) : undefined);

  const host = new URL(url).host;
  // The allowlist is the URL's own host: a human chose this page deliberately,
  // and the fetcher's SSRF guards still apply underneath.
  const { attempt, body } = await safeFetch(url, {
    policy: { allowlist: [host] },
    userAgent,
    timeoutMs,
  });
  if (!body || attempt.fetchStatus !== "OK") {
    return {
      url,
      ok: false,
      fetchStatus: attempt.fetchStatus,
      note: "the page could not be retrieved — nothing was recorded as fact",
    };
  }

  const entry: ArtifactManifestEntry = {
    originalUrl: url,
    issuingOrganization: String(payload["issuer"] ?? host),
    officialDomain: host,
    retrievalDate: new Date().toISOString().slice(0, 10),
    localFilename: `${host.replace(/[^a-z0-9]+/gi, "-")}.html`,
    contentType: "text/html",
    sourceFormat: "STATIC_HTML",
    // Required by the manifest: when the operator gave no title, the page's own
    // host stands in — and the consistency check then simply cannot corroborate
    // a title, which is recorded as evidence rather than passed over.
    expectedDocumentTitle: String(payload["title"] ?? host),
  };
  const liveFetch = (a: LiveFetchAttempt) => async () => a;
  const ing = await ingestOfficialArtifact(entry, body, { liveFetch: liveFetch(attempt) });
  const tenderFacts = extractTenderFacts(body.toString("utf8"), { artifactId: ing.artifact.id });

  return {
    url,
    ok: true,
    projectSlug,
    kind: kindHint,
    contentHash: ing.artifact.contentHash,
    verificationStatus: ing.verification.verificationStatus,
    verificationEvidence: ing.verification.verificationEvidence,
    facts: [...tenderFacts, ...ing.facts].length,
    scope: tenderFacts.find((f) => f.field === "scope")?.normalizedValue.slice(0, 400) ?? null,
    note: "ingested and left at MANUAL_REVIEW_REQUIRED — pasting a URL cannot verify it, only a human can",
  };
}

/**
 * Claim the queued discovery requests and say which projects they name.
 *
 * Claiming (QUEUED → RUNNING) before the search runs is what stops a second
 * workflow run from covering the same request twice, and what lets `--settle`
 * report the truth afterwards.
 *
 * A slug nobody recognises fails its own request and is dropped from the plan
 * rather than sinking the run: `discover:ted` throws on an unknown project, so
 * one typo in the console would otherwise cost every other queued search.
 */
export async function planDiscovery(client: SupabaseClient): Promise<{ projects: string[]; claimed: number }> {
  const { data, error } = await client
    .from("requests")
    .select("id, kind, payload, requested_by")
    .eq("status", "QUEUED")
    .eq("kind", "DISCOVERY")
    .order("requested_at", { ascending: true })
    .limit(50);
  if (error) throw new Error(`requests: ${error.message}`);

  const rows = (data ?? []) as RequestRow[];
  const projects = new Set<string>();
  let claimed = 0;

  for (const row of rows) {
    const asked = Array.isArray(row.payload["projects"]) ? (row.payload["projects"] as unknown[]).map(String) : [];
    const known = asked.filter((slug) => findProject(PROJECT_REGISTRY, slug) !== undefined);
    const unknown = asked.filter((slug) => !known.includes(slug));

    if (known.length === 0) {
      await client
        .from("requests")
        .update({
          status: "FAILED",
          finished_at: new Date().toISOString(),
          error:
            asked.length === 0
              ? "the request named no project"
              : `no such project in the registry: ${unknown.join(", ")}`,
        })
        .eq("id", row.id);
      console.error(`  DISCOVERY ${row.id} → FAILED: ${unknown.join(", ") || "no project named"}`);
      continue;
    }

    for (const slug of known) projects.add(slug);
    await client
      .from("requests")
      .update({ status: "RUNNING", started_at: new Date().toISOString() })
      .eq("id", row.id);
    claimed += 1;
    if (unknown.length > 0) console.warn(`  DISCOVERY ${row.id}: ignoring unknown project(s) ${unknown.join(", ")}`);
  }

  return { projects: [...projects].sort(), claimed };
}

/**
 * Close the claimed discovery requests against the outcome of the run.
 *
 * Called with `if: always()`, so a failed search is recorded as failed rather
 * than left RUNNING forever — a request stuck in RUNNING is indistinguishable
 * from one still in flight, and the console would keep saying "searching".
 */
export async function settleDiscovery(client: SupabaseClient, outcome: "success" | "failure"): Promise<number> {
  const { data, error } = await client.from("requests").select("id").eq("status", "RUNNING").eq("kind", "DISCOVERY");
  if (error) throw new Error(`requests: ${error.message}`);
  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) return 0;

  const patch =
    outcome === "success"
      ? {
          status: "DONE",
          finished_at: new Date().toISOString(),
          result: { note: "the discovery run covering this request completed — see the run's console dataset" },
        }
      : {
          status: "FAILED",
          finished_at: new Date().toISOString(),
          error: "the discovery run covering this request did not complete",
        };
  const { error: patchError } = await client
    .from("requests")
    .update(patch)
    .in("id", rows.map((r) => r.id));
  if (patchError) throw new Error(`requests: ${patchError.message}`);
  return rows.length;
}

async function main() {
  const env = loadEnv({
    ...process.env,
    SUPABASE_URL: process.env["SUPABASE_URL"] ?? "https://placeholder.supabase.co",
    SUPABASE_ANON_KEY: process.env["SUPABASE_ANON_KEY"] ?? "placeholder",
  });
  const config = watchConfigFromEnv(process.env);
  if (!config) {
    console.error("requests: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set — nothing was processed.");
    process.exit(1);
    return;
  }
  const client = createWatchClient(config);

  // --plan / --settle are the two halves of the discovery handshake. They talk
  // to the queue only: no drafts are applied and nothing is fetched, because
  // they run either side of a job that does the actual work.
  const planOnly = process.argv.includes("--plan");
  const settle = process.argv.find((a) => a.startsWith("--settle"));
  if (planOnly) {
    const { projects, claimed } = await planDiscovery(client);
    console.log(`requests: claimed ${claimed} discovery request(s) covering ${projects.length} project(s)`);
    // The workflow reads this line to decide which projects the run covers.
    const line = `projects=${projects.join(",")}`;
    console.log(line);
    const out = process.env["GITHUB_OUTPUT"];
    if (out) appendFileSync(out, `${line}\n`, "utf8");
    return;
  }
  if (settle) {
    const value = settle.includes("=") ? settle.slice(settle.indexOf("=") + 1) : process.argv[process.argv.indexOf(settle) + 1];
    const outcome = value === "success" ? "success" : "failure";
    const closed = await settleDiscovery(client, outcome);
    console.log(`requests: closed ${closed} discovery request(s) as ${outcome}`);
    return;
  }

  const drafts = await applyProjectDrafts(client);
  if (drafts.length > 0) console.log(`applied ${drafts.length} project draft(s): ${drafts.join(", ")}`);

  const { data, error } = await client
    .from("requests")
    .select("id, kind, payload, requested_by")
    .eq("status", "QUEUED")
    // DISCOVERY rows are left where they are: they are claimed by --plan and
    // closed by --settle, around a run this process does not perform.
    .neq("kind", "DISCOVERY")
    .order("requested_at", { ascending: true })
    .limit(25);
  if (error) throw new Error(`requests: ${error.message}`);

  const queue = (data ?? []) as RequestRow[];
  console.log(`requests: ${queue.length} queued`);
  // Keep the policy object alive so the audit hooks stay wired for the fetches.
  createPolicy({ fetchAllowlist: [], autoRecommendActions: ["CONSIDER", "MONITOR", "DISCARD"] });

  for (const request of queue) {
    await client.from("requests").update({ status: "RUNNING", started_at: new Date().toISOString() }).eq("id", request.id);
    try {
      let result: unknown;
      if (request.kind === "INGEST_URL") {
        result = await ingestUrl(request.payload, env.FETCH_USER_AGENT, env.FETCH_TIMEOUT_MS);
      } else {
        result = { note: "link checks run in their own job (check:links)" };
      }
      await client
        .from("requests")
        .update({ status: "DONE", finished_at: new Date().toISOString(), result })
        .eq("id", request.id);
      console.log(`  ${request.kind} ${request.id} → done`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await client
        .from("requests")
        .update({ status: "FAILED", finished_at: new Date().toISOString(), error: message.slice(0, 2000) })
        .eq("id", request.id);
      console.error(`  ${request.kind} ${request.id} → FAILED: ${message}`);
    }
  }
}

if (process.argv[1] && process.argv[1].endsWith("process-requests.ts")) {
  main().catch((err) => {
    console.error("process-requests failed:", err);
    process.exitCode = 1;
  });
}
