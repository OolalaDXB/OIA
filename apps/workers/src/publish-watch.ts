import { readFileSync } from "node:fs";
import type { ConsoleData } from "@oia/ingestion/console";
import { PROJECT_REGISTRY, discoverableProjects } from "@oia/registry";
import { evaluateAlerts, newAlertsOnly, reconcile } from "@oia/watch";
import {
  createWatchClient,
  createWatchRepository,
  watchConfigFromEnv,
} from "@oia/watch/supabase";
import { fromRoot } from "./paths";

/**
 * Fold a discovery run into the permanent ledger, then raise alerts.
 *
 * This is the step that turns a run into a watch. Before it existed, each run
 * replaced a snapshot and the system could not tell a new call from one it had
 * already seen ten times — which is why there were no alerts to raise.
 *
 *   pnpm --filter @oia/workers publish:watch
 *   pnpm --filter @oia/workers publish:watch -- --project sillon,bawaba
 *   pnpm --filter @oia/workers publish:watch -- --dry-run
 *
 * Scope matters and is not cosmetic: the run declares which projects it queried,
 * and only rows whose every discovery project was covered can be marked as
 * having disappeared. Ask a narrower question, get a narrower conclusion.
 */

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  if (hit.includes("=")) return hit.slice(hit.indexOf("=") + 1);
  const i = process.argv.indexOf(hit);
  const next = process.argv[i + 1];
  return next && !next.startsWith("--") ? next : "";
}

async function main() {
  const dryRun = arg("dry-run") !== undefined;
  const dataPath = arg("data") || fromRoot("apps/web/src/data/console.json");
  const data = JSON.parse(readFileSync(dataPath, "utf8")) as ConsoleData;

  const explicit = arg("project");
  const projects = explicit
    ? explicit.split(",").map((s) => s.trim()).filter(Boolean)
    : discoverableProjects(PROJECT_REGISTRY).map((p) => p.slug);

  const config = watchConfigFromEnv(process.env);
  if (!config) {
    // Honest degradation: say exactly what is missing and exit non-zero, rather
    // than "succeeding" while writing nothing.
    console.error(
      "watch: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not set — nothing was published.\n" +
        "Set them as repository secrets (see docs/access-and-data.md) or export them locally.",
    );
    process.exit(1);
    return;
  }

  const repo = createWatchRepository(createWatchClient(config));
  const now = new Date().toISOString();

  const existing = await repo.loadLedger();
  const result = reconcile({ existing, observed: data.records, scope: { projects }, now });

  console.log(
    `watch: ${data.records.length} observed · ${result.summary.new} new · ${result.summary.updated} updated · ` +
      `${result.summary.unchanged} unchanged · ${result.summary.disappeared} disappeared ` +
      `(ledger held ${existing.length} rows, scope: ${projects.join(", ") || "none"})`,
  );

  if (dryRun) {
    for (const e of result.events) console.log(`  ${e.type}  ${e.watchKey}  ${JSON.stringify(e.detail)}`);
    console.log("watch: --dry-run, nothing written.");
    return;
  }

  const runId = await repo.startRun("ted+m0", projects);
  const written = [...result.inserts, ...result.updates, ...result.touched, ...result.disappeared];
  const ids = await repo.upsertRows(written);
  await repo.appendEvents(result.events, ids, runId);

  // Alerts are evaluated against the ledger AFTER the fold, and against the
  // human layer: what you already triaged changes what is worth telling you.
  const [reviews, tags] = await Promise.all([repo.reviewsByRecord(), repo.tagsByRecord()]);
  const ledgerAfter = [...result.inserts, ...result.updates, ...result.touched, ...result.disappeared];
  const candidates = evaluateAlerts({
    rows: ledgerAfter,
    events: result.events,
    reviewOf: (recordId) => reviews.get(recordId) ?? "PENDING",
    tagOf: (recordId) => tags.get(recordId),
    now,
  });
  const known = await repo.knownAlertHashes();
  const fresh = newAlertsOnly(candidates, known);
  const raised = await repo.raiseAlerts(fresh, ids);

  await repo.finishRun(
    runId,
    {
      records: data.records.length,
      new: result.summary.new,
      updated: result.summary.updated,
      disappeared: result.summary.disappeared,
    },
    { projects, alertsEvaluated: candidates.length, alertsRaised: raised, note: data.note },
  );

  console.log(
    `watch: ${result.events.length} event(s) recorded · ${raised} new alert(s) raised ` +
      `(${candidates.length} evaluated, ${candidates.length - fresh.length} already known)`,
  );
}

if (process.argv[1] && process.argv[1].endsWith("publish-watch.ts")) {
  main().catch((err) => {
    console.error("publish-watch failed:", err);
    process.exitCode = 1;
  });
}
