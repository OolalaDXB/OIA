/**
 * Ordonnanceur quotidien (mandat v15, bloc C) : un seul processus fait avancer toutes les
 * fenêtres `running` de tous les sujets du dossier privé (OIA_VIS_SUBJECTS_DIR, défaut
 * `~/oia-visibility-data/sujets/`).
 *
 * Pour chaque fenêtre `running` :
 *  1. jours passés jamais consignés : consignés d'après les preuves (complet, partiel,
 *     manquant), jamais rattrapés ;
 *  2. jour du jour, à partir de `runTimeUtc` : collecte par collect-day (idempotent : une
 *     question déjà collectée ou en échec ce jour n'est pas refaite), puis jour consigné
 *     (marqueur et fiche `<fenêtre>/jours/jour-N.md` dans le dossier des données) ;
 *  3. fin de la fenêtre : clôture SANS Elmo (fenêtre passée en done, figures et rapport,
 *     coût réel, comparaison si la fenêtre a une référence, page client, recommandations
 *     générées puis fusionnées dans recommendations.yaml en « pending »). Une fenêtre lancée
 *     avec Elmo (`started-at.txt` dans son dossier d'état) n'est jamais close ici : sa clôture
 *     reste `pnpm vis close` (Mickaël) ; l'ordonnanceur n'y fait que la collecte OIA.
 * Chaque étape de clôture laisse un marqueur (`<fenêtre>/close/<étape>.done`) : une relance
 * reprend à l'étape interrompue.
 *
 * Plafonds, avant et pendant chaque collecte :
 *  - global : OIA_VIS_MONTHLY_CAP_USD (collect-day, coût d'Elmo compris) ;
 *  - par client : `budget.monthlyCapUsd` de measurement.yaml (dépense du mois des preuves
 *    `oia-direct` du sujet et de ses échecs au majorant). Le plafond passé à collect-day est
 *    le plus bas des deux : un dépassement arrête ce sujet, jamais les autres. Sans budget
 *    déclaré, aucune collecte pour ce sujet. Un coût illisible arrête le sujet (ou tous les
 *    sujets si c'est le coût global).
 *
 * Remesure : pour une fenêtre de suivi prévue, J1 est PROPOSÉ 21 jours après la dernière
 * exécution déclarée (src/recommendation-status.ts), jamais démarré : la proposition est
 * écrite dans `<data>/<sujet>/remesure.json` et signalée une fois.
 *
 * Sans `--go` : plan et coût seulement, aucun appel, aucune écriture.
 * Idempotent : relancé le même jour, il ne refait rien (marqueurs par jour, alertes envoyées
 * une seule fois). Un verrou (`<data>/ordonnanceur.lock`) empêche deux passages simultanés.
 *
 * CLI : tsx src/scheduler.ts [--go] [--date AAAA-MM-JJ] [--juge jev|aucun]
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync, closeSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { type Alert, type AlertSink, journalSink } from "./alerts.js";
import { CostUnreadableError, estimateDay, evidencePath, failuresPath, monthSpendUsd, planDay, readCap, runDay, type DaySummary, type FailureRow } from "./collect-day.js";
import type { Collector } from "./collector.js";
import type { FetchLike } from "./collector-oia/http.js";
import { createOiaDirectCollector, mistralContinuationEnabled, OIA_DIRECT_COLLECTOR } from "./collector-oia-direct.js";
import { clientLanguage, renderClientPage, writeClientPage, type Comparison as PageComparison } from "./client-page.js";
import { estimateWindow, renderEstimate, subjectMonthSpend, windowRealCost } from "./cost-estimate.js";
import type { EvidenceRow } from "./elmo-import.js";
import { readEvidence } from "./evidence-store.js";
import { computeFigures, markdownToHtml, renderReportMarkdown, type FactKeywords, type ReportFigures } from "./j0-report.js";
import { createJudge, judgeWorstCaseUsd, JUDGE_NAMES, type JudgeName, type MentionJudge } from "./judge.js";
import { listSubjectDirs, loadSubject } from "./load.js";
import { loadRecommendations, type Recommendation } from "./recommendation.js";
import { MIN_DAYS_AFTER_EXECUTION, recommendationStatus } from "./recommendation-status.js";
import { mergeRecommendationsFile } from "./reco-merge.js";
import { readCache, safeResolver, type RedirectCache, type Resolver } from "./redirects.js";
import type { Measurement, SubjectBundle } from "./schema.js";
import { compareWindows, writeComparison, type WindowSpan } from "./window-compare.js";
import { markWindowDone } from "./window-gate.js";

type MeasurementWindow = Measurement["windows"][number];

/** Générateurs du bloc D (src/reco-generators.ts), injectés : l'ordonnanceur ne bloque pas s'ils manquent. */
export type GenerateRecommendations = (
  b: SubjectBundle,
  figures: ReportFigures,
  evidence: EvidenceRow[],
  opts: { clientId: string; siteId?: string; today: string; figuresRef?: string; redirects?: RedirectCache; factKeywords?: FactKeywords },
) => Recommendation[];

export interface SchedulerOptions {
  subjectsDir: string;
  dataDir: string;
  env: Record<string, string | undefined>;
  go: boolean;
  now?: () => Date;
  /** Jour traité (AAAA-MM-JJ) ; avec `go`, seulement le jour UTC en cours (aucun rattrapage). */
  date?: string;
  /** Collecteur, créé à la première collecte (avec `go`). */
  collector?: () => Collector;
  /** Juge des mentions, créé à la première collecte (avec `go`). */
  judge?: () => MentionJudge;
  /** Juge retenu, pour les estimations sans appel. */
  judgeName?: JudgeName;
  resolver?: Resolver;
  journalFile?: string;
  alerts?: AlertSink;
  generateRecommendations?: GenerateRecommendations;
  /** Racine du dépôt : aucune clôture n'écrit un sujet ni des données sous le dépôt. */
  repoRoot?: string;
  log?: (line: string) => void;
}

export type DayState = "complet" | "partiel" | "manquant";

export interface DayRecord {
  day: string;
  n: number;
  state: DayState;
  planned: number;
  collected: number;
  failed: number;
  /** Consigné après coup : l'ordonnanceur n'a pas collecté ce jour-là. */
  settledLate: boolean;
  costUsd: number;
  at: string;
}

export interface WindowOutcome {
  windowId: string;
  /** Ce qui a été fait (ou serait fait sans --go), une ligne par action. */
  actions: string[];
  days: DayRecord[];
  collected: DaySummary | null;
  closed: boolean;
}

export interface SubjectOutcome {
  subjectId: string;
  stopped: null | "plafond" | "cout-illisible" | "budget-absent" | "echec";
  monthUsd: number | null;
  capUsd: number | null;
  windows: WindowOutcome[];
  remeasure: RemeasureProposal[];
  errors: string[];
}

export interface RemeasureProposal {
  windowId: string | null;
  comparesWith: string | null;
  earliestStart: string;
  lastExecution: string;
  due: boolean;
}

export interface SchedulerResult {
  day: string;
  go: boolean;
  globalStop: null | "plafond-non-pose" | "cout-illisible";
  subjects: SubjectOutcome[];
  lines: string[];
}

const DAY_MS = 86_400_000;
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
const offsetDays = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Dossier d'état d'une fenêtre, comme `window_dir` de scripts/lib.sh. */
export function windowDir(dataDir: string, subjectId: string, windowId: string, env: Record<string, string | undefined> = {}): string {
  if (env.OIA_VIS_STATE_DIR) return env.OIA_VIS_STATE_DIR;
  const legacy = join(dataDir, windowId);
  const own = join(dataDir, subjectId, windowId);
  if (!existsSync(own) && existsSync(join(legacy, "subject.txt")) && readFileSync(join(legacy, "subject.txt"), "utf8").trim() === subjectId) return legacy;
  return own;
}

export const dayMarkerPath = (wdir: string, day: string) => join(wdir, "jours", `${day}.json`);
export const dayCardPath = (wdir: string, n: number) => join(wdir, "jours", `jour-${n}.md`);

/** Fenêtre lancée avec Elmo : son lancement a écrit `started-at.txt`. */
export const usesElmo = (wdir: string) => existsSync(join(wdir, "started-at.txt"));

function inside(child: string, parent: string): boolean {
  const r = relative(resolve(parent), resolve(child));
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

/** Racine du dépôt git qui contient l'outil. */
export function defaultRepoRoot(): string {
  let d = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  while (!existsSync(join(d, ".git")) && dirname(d) !== d) d = dirname(d);
  return d;
}

/** État d'un jour d'après les preuves `oia-direct` et les échecs consignés. */
export function dayRecord(b: SubjectBundle, windowId: string, day: string, dataDir: string, now: Date, settledLate: boolean): DayRecord {
  const w = b.measurement.windows.find((x) => x.id === windowId)!;
  const { calls } = planDay(b, windowId, day);
  const rows = readEvidence(evidencePath(dataDir, b.subject.id, windowId)).filter((r) => r.collectorName === OIA_DIRECT_COLLECTOR);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const failures = existsSync(failuresPath(dataDir, b.subject.id, windowId))
    ? readFileSync(failuresPath(dataDir, b.subject.id, windowId), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as FailureRow)
    : [];
  const failedIds = new Set(failures.map((f) => f.id));
  const got = calls.filter((c) => byId.has(c.evidenceId));
  const costUsd = got.reduce((s, c) => {
    const r = byId.get(c.evidenceId)!;
    const judge = (r.structured as { mentions?: { judge?: { cost?: { usd?: number } } | null } }).mentions?.judge?.cost?.usd ?? 0;
    return s + r.costUsd + judge;
  }, 0) + failures.filter((f) => f.day === day).reduce((s, f) => s + f.worstCaseUsd, 0);
  return {
    day,
    n: offsetDays(w.start!, day) + 1,
    state: got.length === calls.length && calls.length > 0 ? "complet" : got.length === 0 ? "manquant" : "partiel",
    planned: calls.length,
    collected: got.length,
    failed: calls.filter((c) => failedIds.has(c.evidenceId)).length,
    settledLate,
    costUsd: Math.round(costUsd * 1e4) / 1e4,
    at: now.toISOString(),
  };
}

/** Fiche du jour, dans le dossier des données (jamais dans le dépôt). */
export function renderDayCard(b: SubjectBundle, w: MeasurementWindow, rec: DayRecord, dataDir: string): string {
  const { calls } = planDay(b, w.id, rec.day);
  const ids = new Set(readEvidence(evidencePath(dataDir, b.subject.id, w.id)).filter((r) => r.collectorName === OIA_DIRECT_COLLECTOR).map((r) => r.id));
  const failFile = failuresPath(dataDir, b.subject.id, w.id);
  const failed = new Set(existsSync(failFile) ? readFileSync(failFile, "utf8").split("\n").filter((l) => l.trim()).map((l) => (JSON.parse(l) as FailureRow).id) : []);
  const engines = [...new Set(calls.map((c) => c.engine))];
  const L = [
    `# ${b.subject.id} · ${w.id} · jour ${rec.n}/${w.days}`,
    "",
    `Jour UTC : ${rec.day} · état : **${rec.state}**${rec.settledLate ? " (consigné après coup : aucune collecte de l'ordonnanceur ce jour-là, jamais rattrapé)" : ""} · relevé : ${rec.at.slice(0, 16).replace("T", " ")} UTC`,
    "",
    "| Moteur | Prévus | Collectés | En échec | Manquants |",
    "|---|---|---|---|---|",
    ...engines.map((e) => {
      const cs = calls.filter((c) => c.engine === e);
      const ok = cs.filter((c) => ids.has(c.evidenceId)).length;
      const ko = cs.filter((c) => failed.has(c.evidenceId)).length;
      return `| ${e} | ${cs.length} | ${ok} | ${ko} | ${cs.length - ok - ko} |`;
    }),
    "",
    `Coût du jour (réponses, juge, échecs au majorant) : ${rec.costUsd.toFixed(4)} $.`,
    "",
  ];
  return L.join("\n");
}

class Once {
  constructor(
    private dir: string,
    private sink: AlertSink,
  ) {}
  /** Envoie l'alerte une seule fois par clé. */
  send(key: string, alert: Alert): boolean {
    const f = join(this.dir, `${key.replace(/[^a-zA-Z0-9._-]+/g, "_")}.sent`);
    if (existsSync(f)) return false;
    this.sink.send(alert);
    mkdirSync(dirname(f), { recursive: true });
    writeFileSync(f, `${alert.at}\n`);
    return true;
  }
}

function acquireLock(file: string): () => void {
  mkdirSync(dirname(file), { recursive: true });
  const take = () => {
    const fd = openSync(file, "wx");
    writeFileSync(fd, `${process.pid}\n`);
    closeSync(fd);
  };
  try {
    take();
  } catch {
    const pid = Number(readFileSync(file, "utf8").trim());
    let alive = false;
    try {
      if (Number.isInteger(pid) && pid > 0) {
        process.kill(pid, 0);
        alive = true;
      }
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`ordonnanceur déjà en cours (verrou ${file}, processus ${pid})`);
    rmSync(file, { force: true });
    take();
  }
  return () => rmSync(file, { force: true });
}

interface Ctx {
  o: SchedulerOptions;
  day: string;
  now: Date;
  log: (l: string) => void;
  lines: string[];
  once: (subjectId: string | null) => Once;
  alert: (kind: Alert["kind"], subjectId: string | null, windowId: string | null, message: string) => Alert;
  collector: () => Collector;
  judge: () => MentionJudge;
  globalStop: SchedulerResult["globalStop"];
}

export async function runScheduler(o: SchedulerOptions): Promise<SchedulerResult> {
  const nowFn = o.now ?? (() => new Date());
  const now = nowFn();
  const today = now.toISOString().slice(0, 10);
  const day = o.date ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error(`date invalide : ${day}`);
  if (o.go && day !== today) throw new Error(`--go avec --date ${day} refusé : seul le jour UTC en cours (${today}) se collecte, aucun jour n'est rattrapé`);
  const repoRoot = o.repoRoot ?? defaultRepoRoot();
  if (o.go && inside(o.dataDir, repoRoot)) throw new Error(`dossier des données ${o.dataDir} sous le dépôt : refusé`);
  const lines: string[] = [];
  const log = (l: string) => {
    lines.push(l);
    o.log?.(l);
  };
  const sink = o.alerts ?? journalSink(o.dataDir);
  const release = o.go ? acquireLock(join(o.dataDir, "ordonnanceur.lock")) : () => {};
  let collector: Collector | null = null;
  let judge: MentionJudge | null = null;
  const ctx: Ctx = {
    o,
    day,
    now,
    log,
    lines,
    once: (subjectId) => new Once(subjectId ? join(o.dataDir, subjectId, "ordonnanceur", "alertes") : join(o.dataDir, "ordonnanceur", "alertes"), sink),
    alert: (kind, subjectId, windowId, message) => ({ kind, subjectId, windowId, day, message, at: now.toISOString() }),
    collector: () => {
      if (!o.collector) throw new Error("aucun collecteur fourni");
      return (collector ??= o.collector());
    },
    judge: () => {
      if (!o.judge) throw new Error("aucun juge fourni");
      return (judge ??= o.judge());
    },
    globalStop: null,
  };
  try {
    const result: SchedulerResult = { day, go: o.go, globalStop: null, subjects: [], lines };
    log(`Ordonnanceur · jour ${day} · ${o.go ? "GO (collecte réelle)" : "plan seul, aucun appel ni écriture"}`);
    // Plafond global et coût global lisibles, ou aucune collecte (les clôtures, gratuites, continuent).
    const globalCap = readCap(o.env);
    if (globalCap === null) {
      ctx.globalStop = "plafond-non-pose";
      log("plafond mensuel global non posé ou illisible (OIA_VIS_MONTHLY_CAP_USD) : aucune collecte");
      if (o.go) ctx.once(null).send(`${day}-plafond-global`, ctx.alert("plafond", null, null, "plafond global OIA_VIS_MONTHLY_CAP_USD non posé ou illisible : aucune collecte"));
    } else {
      try {
        const g = monthSpendUsd(o.dataDir, day.slice(0, 7), o.journalFile ?? join(o.dataDir, "cost-journal.csv"));
        log(`dépense globale du mois : ${g.usd.toFixed(2)} $ / plafond ${globalCap} $`);
      } catch (err) {
        if (!(err instanceof CostUnreadableError)) throw err;
        ctx.globalStop = "cout-illisible";
        log(`coût global illisible : aucune collecte (${err.message})`);
        if (o.go) ctx.once(null).send(`${day}-cout-global`, ctx.alert("cout-illisible", null, null, `coût global illisible : aucune collecte (${err.message})`));
      }
    }
    result.globalStop = ctx.globalStop;
    for (const dir of listSubjectDirs(o.subjectsDir)) {
      result.subjects.push(await advanceSubject(ctx, dir, globalCap, repoRoot));
    }
    return result;
  } finally {
    release();
  }
}

async function advanceSubject(ctx: Ctx, dir: string, globalCap: number | null, repoRoot: string): Promise<SubjectOutcome> {
  const { o, day, log } = ctx;
  const subjectId = dir.split(/[\\/]/).pop()!;
  const out: SubjectOutcome = { subjectId, stopped: null, monthUsd: null, capUsd: null, windows: [], remeasure: [], errors: [] };
  const once = ctx.once(subjectId);
  const fail = (key: string, windowId: string | null, message: string) => {
    out.errors.push(message);
    log(`  ÉCHEC : ${message}`);
    if (o.go) once.send(key, ctx.alert("echec", subjectId, windowId, message));
  };
  let b: SubjectBundle;
  try {
    b = loadSubject(dir);
  } catch (err) {
    out.stopped = "echec";
    log(`${subjectId} :`);
    fail(`${day}-chargement`, null, `sujet illisible : ${msg(err).split("\n")[0]}`);
    return out;
  }
  log(`${subjectId} :`);

  // Budget du client : lu une fois, contrôlé avant chaque collecte.
  const budget = b.measurement.budget;
  const month = day.slice(0, 7);
  const clientSpend = (): number | null => {
    try {
      return subjectMonthSpend(o.dataDir, subjectId, month).usd;
    } catch (err) {
      if (!(err instanceof CostUnreadableError)) throw err;
      out.stopped = "cout-illisible";
      log(`  coût du sujet illisible : collecte arrêtée pour ce sujet (${err.message})`);
      if (o.go) once.send(`${day}-cout-illisible`, ctx.alert("cout-illisible", subjectId, null, `coût du sujet illisible : collecte arrêtée (${err.message})`));
      return null;
    }
  };
  out.capUsd = budget?.monthlyCapUsd ?? null;
  out.monthUsd = clientSpend();
  if (out.monthUsd !== null) log(`  dépense du mois : ${out.monthUsd.toFixed(2)} $ / budget ${budget ? `${budget.monthlyCapUsd} $` : "NON DÉCLARÉ (measurement.yaml : budget)"}`);

  for (const w of b.measurement.windows) {
    const wdir = windowDir(o.dataDir, subjectId, w.id, o.env);
    const closing = w.status === "done" && existsSync(join(wdir, "close", "ordonnanceur.txt")) && !existsSync(join(wdir, "close", "rapport-pret.done"));
    if (w.status !== "running" && !closing) continue;
    const wo: WindowOutcome = { windowId: w.id, actions: [], days: [], collected: null, closed: false };
    out.windows.push(wo);
    try {
      b = await advanceWindow(ctx, b, w.id, wdir, out, wo, once, { budget, globalCap, clientSpend, repoRoot });
    } catch (err) {
      fail(`${day}-${w.id}-echec`, w.id, `${w.id} : ${msg(err)}`);
    }
  }

  // Remesure proposée, jamais démarrée.
  try {
    out.remeasure = remeasureProposals(b, loadRecommendations(b.dir), day);
    for (const p of out.remeasure) {
      const what = p.windowId ? `fenêtre ${p.windowId}` : `nouvelle fenêtre de suivi de ${p.comparesWith}`;
      log(`  remesure proposée : ${what} au plus tôt le ${p.earliestStart} (${MIN_DAYS_AFTER_EXECUTION} jours après l'exécution du ${p.lastExecution}) ; démarrage sur validation de Mickaël seulement`);
      if (!o.go) continue;
      const file = join(o.dataDir, subjectId, "remesure.json");
      const body = `${JSON.stringify({ ...p, status: "proposée, à valider par Mickaël", at: ctx.now.toISOString() }, null, 2)}\n`;
      mkdirSync(dirname(file), { recursive: true });
      const prev = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as RemeasureProposal) : null;
      if (!prev || prev.windowId !== p.windowId || prev.earliestStart !== p.earliestStart || prev.due !== p.due) writeFileSync(file, body);
      once.send(`remesure-${p.windowId ?? p.comparesWith}-${p.earliestStart}${p.due ? "-due" : ""}`, ctx.alert("remesure-proposee", subjectId, p.windowId, `${what} proposée au plus tôt le ${p.earliestStart}${p.due ? " (date atteinte)" : ""} ; à valider par Mickaël`));
    }
  } catch (err) {
    fail(`${day}-remesure`, null, `remesure : ${msg(err)}`);
  }
  return out;
}

/** J1 proposé : fenêtre de suivi prévue, 21 jours après la dernière exécution qu'elle mesurera. */
export function remeasureProposals(b: SubjectBundle, recs: Recommendation[], day: string): RemeasureProposal[] {
  const out: RemeasureProposal[] = [];
  const planned = b.measurement.windows.filter((w) => w.status === "planned" && w.kind === "follow-up" && w.comparesWith);
  for (const w of planned) {
    const ref = b.measurement.windows.find((x) => x.id === w.comparesWith);
    if (ref?.status !== "done") continue;
    const s = recommendationStatus(b, w.id, recs);
    if (!s.earliestStart || !s.executed.length) continue;
    out.push({ windowId: w.id, comparesWith: ref.id, earliestStart: s.earliestStart, lastExecution: s.executed[s.executed.length - 1]!.executedAt, due: day >= s.earliestStart });
  }
  if (planned.length === 0) {
    // Aucune fenêtre de suivi prévue : proposée depuis la dernière fenêtre close.
    const last = b.measurement.windows.filter((w) => w.status === "done" && w.end).sort((a, z) => a.end!.localeCompare(z.end!)).pop();
    const execs = recs
      .filter((r) => r.decision.status !== "rejected" && r.decision.status !== "obsolete" && r.execution && last && r.execution.executedAt >= last.end!)
      .map((r) => r.execution!.executedAt)
      .sort();
    const lastExec = execs.pop();
    if (last && lastExec) {
      const earliestStart = plusDays(lastExec, MIN_DAYS_AFTER_EXECUTION);
      out.push({ windowId: null, comparesWith: last.id, earliestStart, lastExecution: lastExec, due: day >= earliestStart });
    }
  }
  return out;
}

interface BudgetCtx {
  budget: Measurement["budget"];
  globalCap: number | null;
  clientSpend: () => number | null;
  repoRoot: string;
}

async function advanceWindow(ctx: Ctx, b: SubjectBundle, windowId: string, wdir: string, out: SubjectOutcome, wo: WindowOutcome, once: Once, bc: BudgetCtx): Promise<SubjectBundle> {
  const { o, day, log, now } = ctx;
  const w = b.measurement.windows.find((x) => x.id === windowId)!;
  const say = (l: string) => {
    wo.actions.push(l);
    log(`  ${w.id} : ${l}`);
  };
  if (!w.start) throw new Error(`fenêtre ${w.id} sans début (start)`);
  const lastDay = plusDays(w.start, w.days - 1);
  const elmo = usesElmo(wdir);

  if (w.status === "running") {
    if (day < w.start) {
      say(`pas commencée (début ${w.start})`);
      return b;
    }
    // 1. Jours passés jamais consignés : d'après les preuves, sans rattrapage.
    for (let d = w.start; d < day && d <= lastDay; d = plusDays(d, 1)) {
      if (existsSync(dayMarkerPath(wdir, d))) continue;
      const rec = dayRecord(b, w.id, d, o.dataDir, now, true);
      say(`jour ${rec.n} (${d}) ${rec.state}, ${rec.collected}/${rec.planned} : consigné après coup, jamais rattrapé`);
      if (o.go) {
        writeDay(b, w, wdir, rec, o.dataDir);
        wo.days.push(rec);
        if (rec.state !== "complet") once.send(`${d}-${w.id}-jour`, ctx.alert("jour-manquant", out.subjectId, w.id, `jour ${rec.n} (${d}) ${rec.state} : ${rec.collected}/${rec.planned} réponses`));
      }
    }
    // 2. Jour du jour.
    if (day <= lastDay && collectToday(ctx, b, w, wdir, out, once, bc, say)) await collectTodayRun(ctx, b, w, wdir, out, wo, once, bc, say);
  }

  // 3. Fin de la fenêtre : clôture sans Elmo.
  const ended = day > lastDay || (day === lastDay && existsSync(dayMarkerPath(wdir, day)));
  if (w.status === "done" || ended) {
    if (elmo) {
      say("fenêtre lancée avec Elmo : clôture par pnpm vis close (Mickaël), pas par l'ordonnanceur");
      if (o.go && day > lastDay) once.send(`${w.id}-cloture-elmo`, ctx.alert("echec", out.subjectId, w.id, `fenêtre ${w.id} terminée : clôture Elmo à lancer par Mickaël (pnpm vis close)`));
      return b;
    }
    if (inside(b.dir, bc.repoRoot)) {
      say("sujet sous le dépôt : clôture automatique refusée (aucun sujet réel écrit dans le dépôt)");
      if (o.go) once.send(`${w.id}-cloture-depot`, ctx.alert("echec", out.subjectId, w.id, `fenêtre ${w.id} terminée, sujet sous le dépôt : clôture à faire à la main`));
      return b;
    }
    if (!o.go) {
      say("terminée : clôture, rapport, page client et recommandations au prochain passage avec --go");
      return b;
    }
    b = await closeWindow(ctx, b, w.id, wdir, out, wo, once, say);
  }
  return b;
}

/** Contrôles avant la collecte du jour ; vrai s'il faut collecter. */
function collectToday(ctx: Ctx, b: SubjectBundle, w: MeasurementWindow, wdir: string, out: SubjectOutcome, once: Once, bc: BudgetCtx, say: (l: string) => void): boolean {
  const { o, day, now } = ctx;
  const n = offsetDays(w.start!, day) + 1;
  if (existsSync(dayMarkerPath(wdir, day))) {
    say(`jour ${n} (${day}) déjà consigné : rien à refaire`);
    return false;
  }
  if (w.runTimeUtc && now.toISOString().slice(0, 10) === day && now.toISOString().slice(11, 16) < w.runTimeUtc) {
    say(`jour ${n} : collecte à ${w.runTimeUtc} UTC, pas encore l'heure`);
    return false;
  }
  const est = estimateDay(b, w.id, day, { mistralContinuation: mistralContinuationEnabled(o.env), judgeWorstCaseUsdPerAnswer: judgeWorstCaseUsd(o.judgeName ?? "jev") });
  say(`jour ${n}/${w.days} (${day}) : au plus ${est.worstCaseUsd.toFixed(4)} $ (${est.lines.filter((l) => !l.startsWith("exclu")).join(" ; ")})`);
  if (!o.go) {
    try {
      const remaining = Math.max(0, offsetDays(day, plusDays(w.start!, w.days - 1)) + 1);
      for (const l of renderEstimate(estimateWindow(b, w, { judge: o.judgeName ?? "jev", days: remaining }))) say(`reste de la fenêtre : ${l.trim()}`);
    } catch (err) {
      say(`reste de la fenêtre : coût inestimable (${msg(err)})`);
    }
  }
  if (ctx.globalStop) {
    say(`aucune collecte : ${ctx.globalStop === "cout-illisible" ? "coût global illisible" : "plafond global non posé"}`);
    return false;
  }
  if (out.stopped) {
    say(`aucune collecte : sujet arrêté (${out.stopped})`);
    return false;
  }
  if (!bc.budget) {
    out.stopped = "budget-absent";
    say("aucune collecte : budget du client non déclaré (measurement.yaml : budget.monthlyCapUsd)");
    if (o.go) once.send(`${day}-budget-absent`, ctx.alert("plafond", out.subjectId, w.id, "budget du client non déclaré (measurement.yaml : budget) : aucune collecte"));
    return false;
  }
  const spent = bc.clientSpend();
  if (spent === null) return false;
  if (spent >= bc.budget.monthlyCapUsd) {
    out.stopped = "plafond";
    say(`aucune collecte : budget du client atteint (${spent.toFixed(2)} $ / ${bc.budget.monthlyCapUsd} $)`);
    if (o.go) once.send(`${day.slice(0, 7)}-plafond-client`, ctx.alert("plafond", out.subjectId, w.id, `budget du mois atteint : ${spent.toFixed(2)} $ / ${bc.budget.monthlyCapUsd} $ ; collecte arrêtée pour ce client`));
    return false;
  }
  return o.go;
}

async function collectTodayRun(ctx: Ctx, b: SubjectBundle, w: MeasurementWindow, wdir: string, out: SubjectOutcome, wo: WindowOutcome, once: Once, bc: BudgetCtx, say: (l: string) => void): Promise<boolean> {
  const { o, day, now } = ctx;
  const budget = bc.budget!;
  const spent = bc.clientSpend()!;
  const globalSpent = monthSpendUsd(o.dataDir, day.slice(0, 7), o.journalFile ?? join(o.dataDir, "cost-journal.csv")).usd;
  // Plafond passé à collect-day : le plus bas du global et du reste du budget du client.
  const clientBound = globalSpent + (budget.monthlyCapUsd - spent);
  const cap = Math.min(bc.globalCap!, clientBound);
  let summary: DaySummary;
  try {
    summary = await runDay({
      bundle: b,
      windowId: w.id,
      dataDir: o.dataDir,
      collector: ctx.collector(),
      env: { ...o.env, OIA_VIS_MONTHLY_CAP_USD: String(cap) },
      now: o.now,
      journalFile: o.journalFile,
      resolver: o.resolver,
      judge: ctx.judge(),
      log: (l) => ctx.log(`    ${l}`),
    });
  } catch (err) {
    if (err instanceof CostUnreadableError) {
      out.stopped = "cout-illisible";
      say(`collecte arrêtée : coût illisible (${err.message})`);
      once.send(`${day}-${w.id}-cout-illisible`, ctx.alert("cout-illisible", out.subjectId, w.id, `coût illisible : collecte arrêtée pour ce client (${err.message})`));
      return false;
    }
    throw err;
  }
  wo.collected = summary;
  say(`collecte : ${summary.collected} collectée(s), ${summary.alreadyDone} déjà faite(s), ${summary.failed} en échec, ${summary.notRun} non faite(s)`);
  if (summary.failed) once.send(`${day}-${w.id}-echecs`, ctx.alert("echec", out.subjectId, w.id, `${summary.failed} appel(s) en échec consignés (jamais comblés)`));
  if (summary.stopped === "cout-illisible") {
    out.stopped = "cout-illisible";
    once.send(`${day}-${w.id}-cout-illisible`, ctx.alert("cout-illisible", out.subjectId, w.id, "coût illisible d'une réponse (modèle absent de la grille) : collecte arrêtée pour ce client"));
    return false;
  }
  if (summary.stopped === "plafond") {
    out.stopped = "plafond";
    const which = clientBound < bc.globalCap! ? `budget du client (${budget.monthlyCapUsd} $)` : `plafond global (${bc.globalCap} $)`;
    say(`arrêt au ${which} ; jour consigné au prochain passage`);
    once.send(clientBound < bc.globalCap! ? `${day.slice(0, 7)}-plafond-client` : `${day}-plafond-global`, ctx.alert("plafond", clientBound < bc.globalCap! ? out.subjectId : null, w.id, `arrêt au ${which} : ${summary.notRun} appel(s) non faits`));
    return false;
  }
  const after = bc.clientSpend();
  if (after !== null) {
    out.monthUsd = after;
    if (budget.alertUsd !== undefined && after >= budget.alertUsd) once.send(`${day.slice(0, 7)}-seuil-client`, ctx.alert("plafond", out.subjectId, w.id, `seuil d'alerte du client franchi : ${after.toFixed(2)} $ ≥ ${budget.alertUsd} $ (budget ${budget.monthlyCapUsd} $)`));
  }
  // Toutes les cases du jour tentées : jour consigné.
  const rec = dayRecord(b, w.id, day, o.dataDir, now, false);
  writeDay(b, w, wdir, rec, o.dataDir);
  wo.days.push(rec);
  say(`jour ${rec.n} consigné : ${rec.state} (${rec.collected}/${rec.planned})`);
  if (rec.state !== "complet") once.send(`${day}-${w.id}-jour`, ctx.alert("jour-manquant", out.subjectId, w.id, `jour ${rec.n} (${day}) ${rec.state} : ${rec.collected}/${rec.planned} réponses`));
  return true;
}

function writeDay(b: SubjectBundle, w: MeasurementWindow, wdir: string, rec: DayRecord, dataDir: string): void {
  mkdirSync(join(wdir, "jours"), { recursive: true });
  writeFileSync(dayCardPath(wdir, rec.n), renderDayCard(b, w, rec, dataDir));
  // Le marqueur en dernier : une fiche sans marqueur se réécrit à la relance.
  writeFileSync(dayMarkerPath(wdir, rec.day), `${JSON.stringify(rec, null, 2)}\n`);
}

/** Bornes de la fenêtre pour les rapports : jour UTC de collect-day, compté depuis minuit. */
const spanOf = (w: MeasurementWindow): WindowSpan => ({ startedAt: `${w.start}T00:00:00Z`, days: w.days });

async function closeWindow(ctx: Ctx, b: SubjectBundle, windowId: string, wdir: string, out: SubjectOutcome, wo: WindowOutcome, once: Once, say: (l: string) => void): Promise<SubjectBundle> {
  const { o, day } = ctx;
  const state = join(wdir, "close");
  mkdirSync(state, { recursive: true });
  if (!existsSync(join(state, "ordonnanceur.txt"))) writeFileSync(join(state, "ordonnanceur.txt"), `clôture par l'ordonnanceur, commencée le ${ctx.now.toISOString()}\n`);
  const reports = join(b.dir, "reports", windowId);
  const evFile = evidencePath(o.dataDir, b.subject.id, windowId);
  const failedFile = join(state, "failed.json");
  const redirectsFile = join(state, "redirects.json");
  const keywordsFile = join(b.dir, "fact-keywords.yaml");
  const wOf = () => b.measurement.windows.find((x) => x.id === windowId)!;
  let figures: ReportFigures | null = existsSync(join(reports, "figures.json")) ? (JSON.parse(readFileSync(join(reports, "figures.json"), "utf8")) as ReportFigures) : null;
  let comparison: PageComparison | undefined;

  const steps: [string, () => void | Promise<void>][] = [
    [
      "fenetre",
      () => {
        const failures = existsSync(failuresPath(o.dataDir, b.subject.id, windowId))
          ? readFileSync(failuresPath(o.dataDir, b.subject.id, windowId), "utf8").split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as FailureRow)
          : [];
        writeFileSync(failedFile, `${JSON.stringify({ ...spanOf(wOf()), failed: failures.map((f) => ({ model: f.engine, createdAt: f.at })) }, null, 2)}\n`);
      },
    ],
    [
      "redirects",
      () => {
        const cache = join(o.dataDir, b.subject.id, "redirects-cache.json");
        if (existsSync(cache)) copyFileSync(cache, redirectsFile);
        else writeFileSync(redirectsFile, "{}\n");
      },
    ],
    [
      "mark-done",
      () => {
        if (wOf().status !== "running") return;
        const file = join(b.dir, "measurement.yaml");
        writeFileSync(file, markWindowDone(readFileSync(file, "utf8"), windowId, plusDays(wOf().start!, wOf().days)));
        b = loadSubject(b.dir);
      },
    ],
    [
      "report",
      () => {
        const evidence = readEvidence(evFile);
        if (!evidence.length) throw new Error(`aucune preuve dans ${evFile}`);
        const failed = JSON.parse(readFileSync(failedFile, "utf8")) as WindowSpan & { failed: { model: string; createdAt: string }[] };
        const keywords = existsSync(keywordsFile) ? (parse(readFileSync(keywordsFile, "utf8")) as FactKeywords) : { facts: [] };
        figures = computeFigures(b, windowId, evidence, failed, failed.failed, keywords, readCache(redirectsFile));
        mkdirSync(reports, { recursive: true });
        const md = renderReportMarkdown(b, figures);
        writeFileSync(join(reports, "figures.json"), `${JSON.stringify(figures, null, 2)}\n`);
        writeFileSync(join(reports, `rapport-${windowId}.md`), md);
        writeFileSync(join(reports, `rapport-${windowId}.html`), markdownToHtml(md, `Rapport ${windowId} · ${b.subject.displayName}`));
        // Coût réel de la fenêtre, à côté du rapport (figures.json reste vérifiable par vis verify).
        const real = windowRealCost(o.dataDir, b.subject.id, windowId);
        writeFileSync(join(reports, `cout-reel-${windowId}.json`), `${JSON.stringify({ windowId, ...real, note: "preuves oia-direct (réponse + juge) et échecs au majorant ; coût d'Elmo hors de ce total" }, null, 2)}\n`);
        say(`rapport écrit, coût réel de la fenêtre ${real.usd.toFixed(2)} $`);
      },
    ],
    [
      "compare",
      () => {
        const w = wOf();
        if (!w.comparesWith) return;
        const ref = b.measurement.windows.find((x) => x.id === w.comparesWith);
        if (ref?.status !== "done") throw new Error(`référence ${w.comparesWith} non close`);
        const rdir = windowDir(o.dataDir, b.subject.id, ref.id, o.env);
        const refFailed = join(rdir, "close", "failed.json");
        if (!existsSync(refFailed)) throw new Error(`bornes de la référence absentes (${refFailed})`);
        const span = JSON.parse(readFileSync(refFailed, "utf8")) as WindowSpan;
        const c = compareWindows(
          b,
          windowId,
          { reference: readEvidence(evidencePath(o.dataDir, b.subject.id, ref.id)), current: readEvidence(evFile) },
          { reference: { startedAt: span.startedAt, days: span.days }, current: spanOf(w) },
          { redirects: readCache(redirectsFile), recommendations: loadRecommendations(b.dir) },
        );
        writeComparison(reports, b, c);
        comparison = c as unknown as PageComparison;
      },
    ],
    [
      "page",
      () => {
        if (!figures) throw new Error("figures.json absent");
        clientLanguage(b);
        const cmp = comparison ?? (wOf().comparesWith && existsSync(join(reports, `comparaison-${windowId}-${wOf().comparesWith}.json`)) ? (JSON.parse(readFileSync(join(reports, `comparaison-${windowId}-${wOf().comparesWith}.json`), "utf8")) as PageComparison) : undefined);
        writeClientPage(reports, renderClientPage(b, figures, { recommendations: loadRecommendations(b.dir), nextWindow: b.measurement.windows.find((x) => x.comparesWith === windowId), comparison: cmp }));
      },
    ],
    [
      "recos",
      () => {
        if (!o.generateRecommendations) {
          say("générateurs de recommandations absents (src/reco-generators.ts) : étape sautée, sans bloquer");
          return;
        }
        if (!figures) throw new Error("figures.json absent");
        const keywords = existsSync(keywordsFile) ? (parse(readFileSync(keywordsFile, "utf8")) as FactKeywords) : undefined;
        const clientId = b.subject.ownership === "internal" ? "oia-internal" : b.subject.id;
        const generated = o.generateRecommendations(b, figures, readEvidence(evFile), { clientId, siteId: b.subject.id, today: day, figuresRef: `reports/${windowId}/figures.json`, redirects: readCache(redirectsFile), factKeywords: keywords });
        const r = mergeRecommendationsFile(join(b.dir, "recommendations.yaml"), generated);
        say(`recommandations : ${r.added.length} ajoutée(s) en « pending », ${r.kept.length} déjà présente(s)`);
      },
    ],
    [
      "rapport-pret",
      () => {
        once.send(`${windowId}-rapport-pret`, ctx.alert("rapport-pret", out.subjectId, windowId, `rapport ${windowId} prêt, à valider par Mickaël (${join("reports", windowId)})`));
      },
    ],
  ];
  for (const [name, run] of steps) {
    const marker = join(state, `${name}.done`);
    if (existsSync(marker)) continue;
    // Recommandations absentes : l'étape n'est pas marquée, la clôture continue.
    if (name === "recos" && !o.generateRecommendations) {
      await run();
      continue;
    }
    try {
      await run();
    } catch (err) {
      throw new Error(`clôture, étape ${name} : ${msg(err)} (reprise au prochain passage)`);
    }
    writeFileSync(marker, `${ctx.now.toISOString()}\n`);
  }
  wo.closed = true;
  say("fenêtre close : done, rapport, page client" + (o.generateRecommendations ? ", recommandations" : ""));
  return b;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const opt = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
  const go = args.includes("--go");
  const judgeName = (opt("--juge") ?? "jev") as JudgeName;
  (async () => {
    if (!JUDGE_NAMES.includes(judgeName)) throw new Error(`juge inconnu « ${judgeName} » : ${JUDGE_NAMES.join(", ")}`);
    const dataDir = resolve(process.env.OIA_VIS_DATA ?? join(homedir(), "oia-visibility-data"));
    const subjectsDir = resolve(process.env.OIA_VIS_SUBJECTS_DIR ?? join(homedir(), "oia-visibility-data", "sujets"));
    const realFetch = globalThis.fetch as unknown as FetchLike;
    // Générateurs du bloc D chargés s'ils existent ; sinon l'ordonnanceur continue sans eux.
    const recoModule = "./reco-generators.js";
    const generateRecommendations = await import(recoModule).then((m: { generateRecommendations?: GenerateRecommendations }) => m.generateRecommendations).catch(() => undefined);
    const r = await runScheduler({
      subjectsDir,
      dataDir,
      env: process.env,
      go,
      date: opt("--date"),
      collector: () => createOiaDirectCollector({ fetch: realFetch, env: process.env }),
      judge: () => createJudge(judgeName, { fetch: realFetch, env: process.env }),
      judgeName,
      resolver: safeResolver,
      journalFile: process.env.OIA_VIS_COST_JOURNAL,
      generateRecommendations,
      log: (l) => process.stdout.write(`${l}\n`),
    });
    if (!go) process.stdout.write("Aucun appel (plan seul). Ajouter --go pour collecter et clore.\n");
    process.exit(r.globalStop || r.subjects.some((s) => s.stopped || s.errors.length) ? 3 : 0);
  })().catch((err) => {
    process.stderr.write(`ordonnanceur : ${msg(err)}\n`);
    process.exit(1);
  });
}
