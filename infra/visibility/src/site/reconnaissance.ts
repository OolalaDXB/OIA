/**
 * Journée de reconnaissance d'un nouveau site (mandat v15, bloc A, étape 7a) : à bas coût,
 * pour trouver les concurrents que les IA citent vraiment.
 *
 *  - questions NON MARQUÉES du panel proposé seulement, un passage par moteur ;
 *  - moteurs choisis par langue (`languages` des moteurs de measurement.yaml : Mistral pour le
 *    français seulement, par exemple) ;
 *  - une fenêtre d'un jour, `reconnaissance-<AAAA-MM-JJ>`, qui n'existe qu'en mémoire : elle
 *    n'entre jamais dans measurement.yaml et ne compte pas comme une mesure ;
 *  - coût au majorant affiché avant ; collecte par collect-day (`runDay` : plafond mensuel,
 *    clés, preuves en ajout seul) seulement avec `--go`. Juge : aucun (correspondance seule).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { estimateDay, planDay, runDay, type DaySummary } from "../collect-day.js";
import type { Collector } from "../collector.js";
import { readEvidence } from "../evidence-store.js";
import { noJudge } from "../judge.js";
import type { Measurement, Panel, Subject, SubjectBundle } from "../schema.js";
import type { AnswerRow } from "./text.js";

export const RECONNAISSANCE_PREFIX = "reconnaissance-";
export const reconnaissanceWindowId = (day: string) => `${RECONNAISSANCE_PREFIX}${day}`;

/** Sujet en mémoire pour collect-day : questions non marquées actives, fenêtre d'un jour en cours. */
export function reconnaissanceBundle(dir: string, subject: Subject, measurement: Measurement, proposedPanel: Panel, day: string): SubjectBundle {
  const j0 = measurement.windows.find((w) => w.id === "j0") ?? measurement.windows[0]!;
  const prompts = proposedPanel.prompts.filter((p) => p.family === "unbranded" && p.status !== "retired").map((p) => ({ ...p, status: "active" as const }));
  if (!prompts.length) throw new Error("aucune question non marquée dans le panel proposé : reconnaissance impossible");
  return {
    dir,
    subject,
    panel: { ...proposedPanel, prompts },
    facts: { schemaVersion: 1, facts: [] },
    measurement: {
      ...measurement,
      windows: [{ id: reconnaissanceWindowId(day), kind: "baseline", days: 1, panelVersion: proposedPanel.panelVersion, status: "running", start: day, targets: j0.targets, missingDays: [], note: "journée de reconnaissance (en mémoire)" }],
      freezes: [],
    },
  };
}

export interface ReconnaissancePlan {
  format: 1;
  fenetre: string;
  jour: string;
  questions: string[];
  moteurs: string[];
  appels: number;
  coutMajorantUsd: number;
  lignes: string[];
  statut: "planifiee" | "collectee" | "partielle";
  resume?: DaySummary;
}

export function planReconnaissance(b: SubjectBundle, day: string): ReconnaissancePlan {
  const windowId = reconnaissanceWindowId(day);
  const { calls } = planDay(b, windowId, day);
  const est = estimateDay(b, windowId, day, { mistralContinuation: false, judgeWorstCaseUsdPerAnswer: 0 });
  return {
    format: 1,
    fenetre: windowId,
    jour: day,
    questions: [...new Set(calls.map((c) => `${c.promptId}@v${c.promptVersion}`))],
    moteurs: [...new Set(calls.map((c) => c.engine))],
    appels: calls.length,
    coutMajorantUsd: Math.round(est.worstCaseUsd * 1e6) / 1e6,
    lignes: est.lines,
    statut: "planifiee",
  };
}

export interface RunReconnaissanceOptions {
  bundle: SubjectBundle;
  dataDir: string;
  collector: Collector;
  env: Record<string, string | undefined>;
  now: () => Date;
  journalFile?: string;
  log?: (line: string) => void;
}

/** Collecte (payante) : appelée seulement sur GO. */
export async function runReconnaissance(o: RunReconnaissanceOptions): Promise<DaySummary> {
  const day = o.now().toISOString().slice(0, 10);
  const windowId = reconnaissanceWindowId(day);
  if (!o.bundle.measurement.windows.some((w) => w.id === windowId)) throw new Error(`sujet de reconnaissance préparé pour un autre jour que le ${day}`);
  // Seulement des questions non marquées : vérifié encore ici, la règle ne dépend pas de l'appelant.
  if (o.bundle.panel.prompts.some((p) => p.status === "active" && p.family !== "unbranded")) throw new Error("reconnaissance refusée : une question marquée est active");
  return runDay({ bundle: o.bundle, windowId, dataDir: o.dataDir, collector: o.collector, env: o.env, now: o.now, judge: noJudge(), journalFile: o.journalFile, log: o.log });
}

/** Réponses de toutes les journées de reconnaissance déjà collectées pour ce sujet. */
export function readReconnaissanceAnswers(dataDir: string, subjectId: string): AnswerRow[] {
  const dir = join(dataDir, subjectId, "evidence");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.startsWith(RECONNAISSANCE_PREFIX) && f.endsWith(".jsonl") && !f.endsWith(".failures.jsonl"))
    .sort()
    .flatMap((f) => readEvidence(join(dir, f)))
    .filter((e) => e.rawText.length > 0)
    .map((e) => ({ id: e.id, engine: e.engine, promptId: e.promptId, rawText: e.rawText, citations: e.citations }));
}
