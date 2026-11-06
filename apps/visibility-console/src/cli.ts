#!/usr/bin/env tsx
/**
 * Console locale d'OIA Visibility · H2.
 *
 * Six vues, textuelles. Alimentée par les fichiers des sujets, les
 * recommandations générées en E4, et la mémoire locale de SEO Command (E5).
 *
 * Tourne en LOCAL UNIQUEMENT. Jamais déployée (voir H1 + README).
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { createActionLog } from "@oia/visibility-infra/src/seo-command/action-log";
import { createMultiBudgetGuard } from "@oia/visibility-infra/src/seo-command/budget-multi";
import { createFakeExecutor } from "@oia/visibility-infra/src/seo-command/executor";
import { MissionSchema, type Mission } from "@oia/visibility-infra/src/seo-command/mission";
import { createQueue } from "@oia/visibility-infra/src/seo-command/queue";
import { createScheduler } from "@oia/visibility-infra/src/seo-command/scheduler";
import { tick } from "@oia/visibility-infra/src/seo-command/orchestrator";
import { loadSubjects } from "@oia/visibility-infra/src/load";
import type { Recommendation } from "@oia/visibility-infra/src/recommendation";
import { RecommendationSchema } from "@oia/visibility-infra/src/recommendation";

const SUBJECTS_DIR = process.env.OIA_VIS_SUBJECTS_DIR ?? "infra/visibility/subjects";

function loadRecommendations(): Recommendation[] {
  const out: Recommendation[] = [];
  let subs: string[];
  try {
    subs = readdirSync(SUBJECTS_DIR);
  } catch {
    return out;
  }
  for (const s of subs) {
    const auditRoot = join(SUBJECTS_DIR, s, "audits");
    let dates: string[];
    try {
      dates = readdirSync(auditRoot);
    } catch {
      continue;
    }
    for (const d of dates) {
      const recDir = join(auditRoot, d, "recommendations");
      let files: string[];
      try {
        files = readdirSync(recDir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith(".json")) continue;
        try {
          const raw = JSON.parse(readFileSync(join(recDir, f), "utf8"));
          out.push(RecommendationSchema.parse(raw));
        } catch {
          // Skip invalid files silently; show nothing fake.
        }
      }
    }
  }
  return out;
}

async function viewPortfolio(): Promise<void> {
  const subjects = loadSubjects(SUBJECTS_DIR);
  console.log("## Portefeuille · OIA Visibility (console locale)\n");
  console.log(`${subjects.length} sujet(s) chargé(s) depuis ${SUBJECTS_DIR}\n`);
  console.log("| Sujet | Status | Langues | Marchés | URL principale |");
  console.log("|---|---|---|---|---|");
  for (const b of subjects) {
    const s = b.subject;
    console.log(`| ${s.id} | ${s.status} | ${s.languages.join(",")} | ${s.markets.map((m) => m.country).join(",")} | ${s.urls.primary} |`);
  }
}

async function viewActions(): Promise<void> {
  const recs = loadRecommendations();
  const pending = recs.filter((r) => r.decision.status === "pending");
  console.log(`## Actions à valider · ${pending.length} recommandation(s) en attente\n`);
  for (const r of pending) {
    console.log(`- \`${r.id}\` [${r.type} · impact ${r.impact.level} · risque ${r.risk} · confiance ${r.confidence}] ${r.title}`);
    console.log(`    sujet=${r.subjectId}  par=${r.createdBy}  le ${r.createdAt}`);
  }
}

async function viewHistory(): Promise<void> {
  const recs = loadRecommendations();
  const decided = recs.filter((r) => r.decision.status !== "pending");
  console.log(`## Historique des décisions · ${decided.length} décision(s) consignée(s)\n`);
  for (const r of decided) {
    console.log(`- ${r.decision.status.toUpperCase()}  ${r.id}  ${r.title}  (par ${r.decision.by ?? "?"} le ${r.decision.at ?? "?"})`);
  }
}

async function viewCosts(): Promise<void> {
  const g = createMultiBudgetGuard({ globalUsd: 30, perClientUsd: {}, perSiteUsd: {} });
  const snap = g.snapshot();
  console.log(`## Coûts · plafond global ${snap.caps.globalUsd} $\n`);
  console.log("Cette nuit : 0 $ dépensé (aucun appel LLM, aucune collecte réelle).");
  console.log("Au branchement réel : cost-guard.sh maintient le plafond ; voir docs/visibility/brancher-un-llm.md.");
}

async function viewSeoCommand(): Promise<void> {
  const q = createQueue();
  const log = createActionLog();
  const scheduler = createScheduler({});
  console.log(`## SEO Command\n`);
  console.log(`Scheduler globalEnabled : ${scheduler.globalEnabled ? "OUI" : "NON (interrupteur OFF, règle 16)"}\n`);
  console.log("Missions (mémoire locale) :");
  const missions = q.list();
  if (missions.length === 0) console.log("  aucune mission en mémoire — lancez `visibility site init` ou une mission manuelle.");
  for (const m of missions) console.log(`- ${m.id} [${m.state}] ${m.type} sujet=${m.subjectId}`);

  // Exécuter une mission fictive à titre de démonstration : montre comment la
  // vue reflète la file après un tick.
  if (process.argv.includes("--demo")) {
    const mission = MissionSchema.parse({
      id: "msn-demo-h2",
      type: "audit-technique",
      clientId: "fictive-client",
      subjectId: "fictive-subject",
      trigger: "manual",
      agents: ["fake"],
      reservedBudgetUsd: 0,
      actualCostUsd: 0,
      state: "planned",
      createdAt: new Date().toISOString().slice(0, 10),
      updatedAt: new Date().toISOString().slice(0, 10),
      results: { recommendationIds: [], evidenceIds: [] },
    } satisfies Mission);
    q.enqueue(mission);
    const executors = { fake: createFakeExecutor({ output: { hasWriteProposal: false, costUsd: 0 } }) };
    const g = createMultiBudgetGuard({ globalUsd: 30 });
    const budget = {
      reservedUsd: () => 0,
      spentUsd: () => 0,
      capUsd: () => 30,
      reserve: (_r: { missionId: string; amountUsd: number }) => {
        const r = g.reserve({ ..._r, clientId: "fictive-client" });
        return r.ok ? ("ok" as const) : ("refused-cap" as const);
      },
      settle: (_r: { missionId: string; costUsd: number }) => g.settle({ ..._r, clientId: "fictive-client" }),
      cancel: (_r: { missionId: string }) => g.cancel(_r),
    };
    const after = await tick({ queue: q, budget, log, executors }, "console-demo");
    console.log(`\nDémo (--demo) : mission exécutée → ${after?.state}`);
  }

  console.log("\nJournal des actions (mémoire locale) :");
  const entries = log.all();
  if (entries.length === 0) console.log("  aucune action récente.");
  for (const e of entries) console.log(`- ${e.at}  ${e.who}  ${e.what}  client=${e.clientId}  mission=${e.missionId ?? "-"}`);
}

async function viewSite(subjectId: string): Promise<void> {
  const recs = loadRecommendations().filter((r) => r.subjectId === subjectId);
  console.log(`## Site ${subjectId}\n`);
  console.log(`Recommandations : ${recs.length}`);
  for (const r of recs) console.log(`- ${r.decision.status}  ${r.id}  [${r.type}]  ${r.title}`);
}

async function main(): Promise<void> {
  const [, , cmd, arg] = process.argv;
  switch (cmd) {
    case "portfolio":
      await viewPortfolio();
      break;
    case "actions":
      await viewActions();
      break;
    case "history":
      await viewHistory();
      break;
    case "costs":
      await viewCosts();
      break;
    case "seo-command":
      await viewSeoCommand();
      break;
    case "site":
      if (!arg) throw new Error("usage: console site <subjectId>");
      await viewSite(arg);
      break;
    default:
      console.error("usage: console portfolio | actions | history | costs | seo-command [--demo] | site <subjectId>");
      process.exit(2);
  }
}

main().catch((e) => {
  console.error(`console error: ${(e as Error).message}`);
  process.exit(1);
});

// avoid unused-imports when built in some environments
void statSync;
void basename;
