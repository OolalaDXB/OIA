/**
 * Coût d'une étude (mandat v15, bloc G) : estimation avant tout lancement, coût réel après.
 *
 * Estimation d'une fenêtre = Σ moteurs (coût moyen d'un appel du moteur) × questions × jours,
 * plus le juge (majorant Jev de src/judge.ts, par réponse). Le coût moyen d'un appel vient :
 *  1. des coûts réels d'une fenêtre de référence (figures.json : `perEngine.estimatedCostUsd`
 *     / `responses`), si la version servie à la référence a la même entrée de grille que la
 *     cible ; Mistral n'est pas repris d'une référence dont le panel n'a pas de français
 *     (réponses sans texte et recherches en nombre, non représentatives) ;
 *  2. sinon, de la grille (src/cost-grid.ts) : majorant d'un appel de la cible.
 * Une cible sans prix dans la grille rend l'estimation illisible (CostUnreadableError).
 *
 * Questions : par moteur, les questions actives du panel dans les langues qu'il mesure
 * (même règle que collect-day). `estimateStudy` fait le même calcul pour une étude qui
 * n'a pas encore de panel : il se multiplie par langues, questions, moteurs et jours.
 *
 * Coût réel : somme des coûts consignés par le collecteur OIA direct (preuves `oia-direct` :
 * réponse + juge) et des échecs au majorant. Les preuves d'Elmo n'y entrent pas (coût
 * d'Elmo : journal de cost-guard.sh). Un coût illisible lève CostUnreadableError.
 *
 * CLI : tsx src/cost-estimate.ts <sujet> <fenêtre> [--reference figures.json] [--juge jev|aucun]
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CostUnreadableError, evidencePath, failuresPath, type FailureRow } from "./collect-day.js";
import { OIA_DIRECT_COLLECTOR, parseTarget, targetWorstCaseUsd } from "./collector-oia-direct.js";
import { findPrice } from "./cost-grid.js";
import type { EvidenceRow } from "./elmo-import.js";
import type { ReportFigures } from "./j0-report.js";
import { judgeWorstCaseUsd, JUDGE_NAMES, type JudgeName } from "./judge.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { Measurement, SubjectBundle } from "./schema.js";

type MeasurementWindow = Measurement["windows"][number];

/** Moteurs qu'une référence ne donne pas, sauf si son panel comprend la langue indiquée. */
export const REFERENCE_EXCLUSIONS: { engine: string; unlessLanguage: string; reason: string }[] = [
  { engine: "mistral", unlessLanguage: "fr", reason: "référence sans question en français : coût de Mistral non représentatif" },
];

export interface ReferenceCost {
  engine: string;
  usdPerCall: number;
  responses: number;
  versions: string[];
}

/** Figures réduites à ce que lit l'estimation. */
export type ReferenceFigures = Pick<ReportFigures, "windowId"> & {
  perEngine: Pick<ReportFigures["perEngine"][number], "engine" | "versions" | "responses" | "estimatedCostUsd">[];
};

/**
 * Coût moyen d'un appel par moteur dans une fenêtre de référence. `languages` : langues du
 * panel de la référence ; null (inconnues) = traitées comme sans français.
 */
export function referenceCosts(fig: ReferenceFigures, languages: string[] | null): { costs: ReferenceCost[]; excluded: { engine: string; reason: string }[] } {
  const costs: ReferenceCost[] = [];
  const excluded: { engine: string; reason: string }[] = [];
  for (const e of fig.perEngine) {
    const rule = REFERENCE_EXCLUSIONS.find((x) => x.engine === e.engine && !(languages ?? []).includes(x.unlessLanguage));
    if (rule) {
      excluded.push({ engine: e.engine, reason: rule.reason });
      continue;
    }
    if (!(e.responses > 0) || !Number.isFinite(e.estimatedCostUsd) || e.estimatedCostUsd < 0) {
      excluded.push({ engine: e.engine, reason: "aucune réponse ou coût illisible dans la référence" });
      continue;
    }
    costs.push({ engine: e.engine, usdPerCall: e.estimatedCostUsd / e.responses, responses: e.responses, versions: e.versions });
  }
  return { costs, excluded };
}

export interface EngineEstimate {
  engine: string;
  target: string;
  usdPerCall: number;
  source: "référence" | "grille";
  /** Questions actives que ce moteur mesure, par jour. */
  questions: number;
  calls: number;
  usd: number;
}

export interface WindowEstimate {
  subjectId: string;
  windowId: string;
  days: number;
  referenceId: string | null;
  perEngine: EngineEstimate[];
  excluded: { engine: string; reason: string }[];
  answers: number;
  judge: { name: JudgeName; perAnswerUsd: number; usd: number };
  /** Réponses seules, puis réponses + juge. */
  answersUsd: number;
  totalUsd: number;
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;

/** Langues des questions d'une fenêtre de référence, lues dans le panel du sujet. */
export function referenceLanguages(b: SubjectBundle, fig: Pick<ReportFigures, "scope">): string[] {
  const langs = fig.scope.prompts.map((p) => b.panel.prompts.find((x) => x.id === p.id && x.version === p.version)?.language).filter((l): l is string => !!l);
  return [...new Set(langs)];
}

/** figures.json de la référence d'une fenêtre : `comparesWith`, sinon la dernière fenêtre close du sujet qui en a un. */
export function findReference(b: SubjectBundle, windowId: string): { windowId: string; file: string } | null {
  const w = b.measurement.windows.find((x) => x.id === windowId);
  const file = (id: string) => join(b.dir, "reports", id, "figures.json");
  if (w?.comparesWith && existsSync(file(w.comparesWith))) return { windowId: w.comparesWith, file: file(w.comparesWith) };
  const done = b.measurement.windows.filter((x) => x.status === "done" && x.id !== windowId && existsSync(file(x.id))).sort((a, z) => (a.end ?? "").localeCompare(z.end ?? ""));
  const last = done.pop();
  return last ? { windowId: last.id, file: file(last.id) } : null;
}

/** Coût d'une étude sans panel : moteurs × questions × langues × jours, plus le juge par réponse. */
export function estimateStudy(o: { usdPerCall: Record<string, number>; questionsPerLanguage: number; languages: number; days: number; judgePerAnswerUsd: number }): { answers: number; answersUsd: number; judgeUsd: number; totalUsd: number } {
  const perAnswerDay = Object.values(o.usdPerCall).reduce((s, x) => s + x, 0);
  const qd = o.questionsPerLanguage * o.languages * o.days;
  const answers = Object.keys(o.usdPerCall).length * qd;
  const answersUsd = perAnswerDay * qd;
  const judgeUsd = answers * o.judgePerAnswerUsd;
  return { answers, answersUsd: r4(answersUsd), judgeUsd: r4(judgeUsd), totalUsd: r4(answersUsd + judgeUsd) };
}

/**
 * Estimation d'une fenêtre du sujet. `reference` : figures d'une fenêtre de référence et les
 * langues de son panel (par défaut, `findReference` sur le sujet) ; `null` = grille seule.
 */
export function estimateWindow(
  b: SubjectBundle,
  window: MeasurementWindow | string,
  opts: { reference?: { figures: ReferenceFigures; languages: string[] | null } | null; judge?: JudgeName; days?: number; mistralContinuation?: boolean } = {},
): WindowEstimate {
  const w = typeof window === "string" ? b.measurement.windows.find((x) => x.id === window) : window;
  if (!w) throw new Error(`fenêtre « ${String(window)} » absente de measurement.yaml`);
  if (!w.targets?.length) throw new CostUnreadableError(`fenêtre ${w.id} : aucune cible (targets), coût inestimable`);
  let reference = opts.reference;
  if (reference === undefined) {
    const ref = findReference(b, w.id);
    if (ref) {
      const figures = JSON.parse(readFileSync(ref.file, "utf8")) as ReportFigures;
      reference = { figures, languages: referenceLanguages(b, figures) };
    } else reference = null;
  }
  const ref = reference ? referenceCosts(reference.figures, reference.languages) : { costs: [], excluded: [] };
  const engines = new Map(b.measurement.engines.map((e) => [e.model, e]));
  const active = b.panel.prompts.filter((p) => p.status === "active");
  const days = opts.days ?? w.days;
  const perEngine: EngineEstimate[] = w.targets.map((raw) => {
    const t = parseTarget(raw);
    const langs = engines.get(t.engine)?.languages;
    const questions = active.filter((p) => !langs || langs.includes(p.language)).length;
    const entry = findPrice(t.provider, t.model);
    const fromRef = ref.costs.find((c) => c.engine === t.engine && entry && c.versions.length > 0 && c.versions.every((v) => entry.versions.test(v)));
    const grid = targetWorstCaseUsd(t, { mistralContinuation: opts.mistralContinuation });
    const usdPerCall = fromRef?.usdPerCall ?? grid;
    if (usdPerCall === undefined) throw new CostUnreadableError(`cible ${raw} : aucun prix dans la grille (src/cost-grid.ts) ni dans la référence`);
    const calls = questions * days;
    return { engine: t.engine, target: raw, usdPerCall, source: fromRef ? "référence" : "grille", questions, calls, usd: usdPerCall * calls };
  });
  const judgeName = opts.judge ?? "jev";
  const perAnswerUsd = judgeWorstCaseUsd(judgeName);
  const answers = perEngine.reduce((s, e) => s + e.calls, 0);
  const answersUsd = perEngine.reduce((s, e) => s + e.usd, 0);
  return {
    subjectId: b.subject.id,
    windowId: w.id,
    days,
    referenceId: reference?.figures.windowId ?? null,
    perEngine: perEngine.map((e) => ({ ...e, usdPerCall: Math.round(e.usdPerCall * 1e6) / 1e6, usd: r4(e.usd) })),
    excluded: ref.excluded,
    answers,
    judge: { name: judgeName, perAnswerUsd, usd: r4(answers * perAnswerUsd) },
    answersUsd: r4(answersUsd),
    totalUsd: r4(answersUsd + answers * perAnswerUsd),
  };
}

export function renderEstimate(e: WindowEstimate): string[] {
  const L = [`${e.subjectId} / ${e.windowId} : coût estimé ${e.totalUsd.toFixed(2)} $ (${e.days} jours, ${e.answers} réponses${e.referenceId ? `, référence ${e.referenceId}` : ", grille seule"})`];
  for (const x of e.perEngine) L.push(`  ${x.engine} : ${x.questions} question(s) × ${e.days} j × ${x.usdPerCall.toFixed(4)} $ (${x.source}) = ${x.usd.toFixed(2)} $`);
  L.push(`  juge ${e.judge.name} : ${e.answers} × ${e.judge.perAnswerUsd.toFixed(4)} $ au majorant = ${e.judge.usd.toFixed(2)} $`);
  for (const x of e.excluded) L.push(`  référence non reprise pour ${x.engine} : ${x.reason}`);
  return L;
}

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l, i) => {
      try {
        return JSON.parse(l) as T;
      } catch {
        throw new CostUnreadableError(`${file}, ligne ${i + 1} : JSON illisible`);
      }
    });
}

export interface RealCost {
  usd: number;
  answersUsd: number;
  judgeUsd: number;
  failuresUsd: number;
  answers: number;
  failures: number;
  /** Preuves d'un autre collecteur (Elmo), hors de ce coût. */
  otherCollectorRows: number;
}

const emptyCost = (): RealCost => ({ usd: 0, answersUsd: 0, judgeUsd: 0, failuresUsd: 0, answers: 0, failures: 0, otherCollectorRows: 0 });

/** Ajoute à `acc` les coûts d'un fichier de preuves et de son fichier d'échecs, filtrés par `keep` (horodatage). */
function addCosts(acc: RealCost, evidenceFile: string, failureFile: string, keep: (iso: string) => boolean): void {
  for (const r of readJsonl<EvidenceRow>(evidenceFile)) {
    if (r.collectorName !== OIA_DIRECT_COLLECTOR) {
      acc.otherCollectorRows++;
      continue;
    }
    if (!keep(r.receivedAt ?? "")) continue;
    const cost = (r.structured as { cost?: { readable?: unknown } } | undefined)?.cost;
    if (!Number.isFinite(r.costUsd) || cost?.readable === false) throw new CostUnreadableError(`preuve ${r.id} : coût illisible`);
    acc.answersUsd += r.costUsd;
    acc.answers++;
    const judgeCost = (r.structured as { mentions?: { judge?: { cost?: { usd?: unknown } } | null } }).mentions?.judge?.cost?.usd;
    if (judgeCost !== undefined) {
      if (typeof judgeCost !== "number" || !Number.isFinite(judgeCost)) throw new CostUnreadableError(`preuve ${r.id} : coût du juge illisible`);
      acc.judgeUsd += judgeCost;
    }
  }
  for (const f of readJsonl<FailureRow>(failureFile)) {
    if (f.collectorName !== OIA_DIRECT_COLLECTOR || !keep(f.at ?? "")) continue;
    if (!Number.isFinite(f.worstCaseUsd)) throw new CostUnreadableError(`échec ${f.id} sans coût`);
    acc.failuresUsd += f.worstCaseUsd;
    acc.failures++;
  }
  acc.usd = acc.answersUsd + acc.judgeUsd + acc.failuresUsd;
}

const rounded = (c: RealCost): RealCost => ({ ...c, usd: r4(c.usd), answersUsd: r4(c.answersUsd), judgeUsd: r4(c.judgeUsd), failuresUsd: r4(c.failuresUsd) });

/** Coût réel d'une fenêtre : preuves `oia-direct` (réponse + juge) et échecs au majorant. */
export function windowRealCost(dataDir: string, subjectId: string, windowId: string): RealCost {
  const acc = emptyCost();
  addCosts(acc, evidencePath(dataDir, subjectId, windowId), failuresPath(dataDir, subjectId, windowId), () => true);
  return rounded(acc);
}

/** Dépense du mois UTC (AAAA-MM) d'un sujet par le collecteur OIA direct, toutes fenêtres. */
export function subjectMonthSpend(dataDir: string, subjectId: string, month: string): RealCost {
  const acc = emptyCost();
  const dir = join(dataDir, subjectId, "evidence");
  if (!existsSync(dir)) return acc;
  const windows = readdirSync(dir)
    .filter((f) => f.endsWith(".jsonl") && !f.endsWith(".failures.jsonl"))
    .map((f) => f.slice(0, -".jsonl".length));
  const orphans = readdirSync(dir).filter((f) => f.endsWith(".failures.jsonl")).map((f) => f.slice(0, -".failures.jsonl".length)).filter((w) => !windows.includes(w));
  for (const w of [...windows, ...orphans]) addCosts(acc, evidencePath(dataDir, subjectId, w), failuresPath(dataDir, subjectId, w), (iso) => iso.startsWith(month));
  return rounded(acc);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const [subjectId, windowId] = args.filter((a, i) => !a.startsWith("--") && !["--reference", "--juge"].includes(args[i - 1] ?? ""));
  try {
    if (!subjectId || !windowId) throw new Error("usage: tsx src/cost-estimate.ts <sujet> <fenêtre> [--reference figures.json] [--juge jev|aucun]");
    const judge = (opt("--juge") ?? "jev") as JudgeName;
    if (!JUDGE_NAMES.includes(judge)) throw new Error(`juge inconnu « ${judge} »`);
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet « ${subjectId} »`);
    const b = loadSubject(dir);
    const refFile = opt("--reference");
    // Référence d'un autre sujet : langues de son panel inconnues, Mistral au prix de la grille.
    const reference = refFile ? { figures: JSON.parse(readFileSync(refFile, "utf8")) as ReportFigures, languages: null } : undefined;
    process.stdout.write(`${renderEstimate(estimateWindow(b, windowId, { reference, judge })).join("\n")}\n`);
  } catch (err) {
    process.stderr.write(`cost-estimate : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(err instanceof CostUnreadableError ? 3 : 1);
  }
}
