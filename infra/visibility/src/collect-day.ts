/**
 * Collecte d'un jour d'une fenêtre par le collecteur OIA direct (mandat v14, bloc C).
 *
 * Un appel par question active du panel, par moteur, pour le jour UTC en cours :
 *  - le moteur se choisit PAR QUESTION : une question n'est envoyée qu'aux moteurs qui la
 *    mesurent (`languages` du moteur dans measurement.yaml ; sans `languages`, toutes) ;
 *  - cibles et heure : `targets` et `runTimeUtc` de la fenêtre ;
 *  - reprises bornées sur 429 et 5xx dans src/collector-oia/http.ts (3 essais au plus) ;
 *    un échec définitif est consigné dans `<data>/<sujet>/evidence/<fenêtre>.failures.jsonl`
 *    et n'est JAMAIS comblé : une relance du même jour saute la case, aucun jour passé
 *    n'est rattrapé ;
 *  - garde-fou : avant chaque appel, coût du mois + majorant de l'appel ≤ plafond
 *    (OIA_VIS_MONTHLY_CAP_USD, obligatoire) ; arrêt dès qu'un coût est illisible ;
 *  - preuves en ajout seul dans `<data>/<sujet>/evidence/<fenêtre>.jsonl` (src/evidence-store.ts),
 *    collectorName `oia-direct`.
 *
 * Coût du mois (mois UTC) = preuves `oia-direct` du mois de tous les sujets + échecs du
 * mois au majorant + dernier relevé du mois du journal de cost-guard.sh (`retained_usd`,
 * coût d'Elmo), car les comptes des fournisseurs sont partagés. Un journal ou une table
 * illisible arrête tout.
 *
 * Juge des mentions (src/judge.ts) : chaque réponse est jugée avant d'être écrite (une seule
 * ligne de preuve, ajout seul) ; juge par défaut `jev` (TYPESAFE_API_KEY obligatoire avec
 * `--go`), ou `--juge aucun`. Son coût entre dans le majorant de chaque appel et dans le coût du
 * mois. Mistral : suite des conversations arrêtées après la recherche seulement avec
 * OIA_VIS_MISTRAL_CONTINUATION=1 (désactivée par défaut, comparabilité avec J0).
 *
 * Sans `--go`, rien n'est appelé : le plan du jour et son coût au majorant sont affichés.
 * Les clés sont lues dans l'environnement du processus seulement, jamais affichées.
 *
 * CLI : tsx src/collect-day.ts <sujet> <fenêtre> [--juge jev|mistral|aucun] [--go]
 */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import type { Collector } from "./collector.js";
import { ProviderError, type FetchLike } from "./collector-oia/http.js";
import { MissingKeyError, OIA_DIRECT_COLLECTOR, PROVIDERS, createOiaDirectCollector, mistralContinuationEnabled, parseTarget, targetWorstCaseUsd, type Target } from "./collector-oia-direct.js";
import { createJudge, JUDGE_NAMES, judgeWorstCaseUsd, mentionConfigFrom, type JudgeName, type MentionJudge } from "./judge.js";
import type { MentionConfig } from "./judge-jev.js";
import type { EvidenceRow } from "./elmo-import.js";
import { appendEvidence, readEvidence, sha256Hex } from "./evidence-store.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { isRedirectLink, readCache, resolveRedirects, safeResolver, type Resolver } from "./redirects.js";
import type { SubjectBundle } from "./schema.js";

export interface PlannedCall {
  evidenceId: string;
  promptId: string;
  promptVersion: number;
  promptLanguage: string;
  promptText: string;
  engine: string;
  target: Target;
}

export interface FailureRow {
  id: string;
  subjectId: string;
  windowId: string;
  day: string;
  engine: string;
  target: string;
  promptId: string;
  promptVersion: number;
  at: string;
  error: string;
  status: number | null;
  attempts: number | null;
  /** Compté au majorant : un appel en échec a pu être facturé en partie. */
  worstCaseUsd: number;
  collectorName: string;
}

export const evidencePath = (dataDir: string, subjectId: string, windowId: string) => join(dataDir, subjectId, "evidence", `${windowId}.jsonl`);
export const failuresPath = (dataDir: string, subjectId: string, windowId: string) => join(dataDir, subjectId, "evidence", `${windowId}.failures.jsonl`);

export function evidenceIdFor(subjectId: string, windowId: string, day: string, promptId: string, version: number, engine: string): string {
  return `${OIA_DIRECT_COLLECTOR}:${subjectId}:${windowId}:${day}:${promptId}@v${version}:${engine}`;
}

function windowOf(b: SubjectBundle, windowId: string) {
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w) throw new Error(`fenêtre "${windowId}" absente de measurement.yaml`);
  return w;
}

/** Les appels du jour : questions actives × moteurs qui les mesurent. */
export function planDay(b: SubjectBundle, windowId: string, day: string): { calls: PlannedCall[]; excluded: { promptId: string; engine: string; reason: string }[] } {
  const w = windowOf(b, windowId);
  if (b.panel.panelVersion !== w.panelVersion) throw new Error(`panel en version ${b.panel.panelVersion}, la fenêtre ${windowId} attend la version ${w.panelVersion}`);
  if (!w.targets?.length) throw new Error(`fenêtre ${windowId} : aucune cible (targets)`);
  const targets = w.targets.map(parseTarget);
  const engines = new Map(b.measurement.engines.map((e) => [e.model, e]));
  for (const t of targets) {
    const e = engines.get(t.engine);
    if (!e) throw new Error(`cible ${t.raw} : moteur "${t.engine}" absent de engines`);
    if (e.collection !== "api") throw new Error(`cible ${t.raw} : moteur "${t.engine}" relevé à la main, pas par API`);
  }
  const calls: PlannedCall[] = [];
  const excluded: { promptId: string; engine: string; reason: string }[] = [];
  for (const p of b.panel.prompts.filter((x) => x.status === "active")) {
    for (const t of targets) {
      const langs = engines.get(t.engine)!.languages;
      if (langs && !langs.includes(p.language)) {
        excluded.push({ promptId: `${p.id}@v${p.version}`, engine: t.engine, reason: `langue ${p.language} non mesurée sur ${t.engine} (${langs.join(", ")})` });
        continue;
      }
      calls.push({
        evidenceId: evidenceIdFor(b.subject.id, windowId, day, p.id, p.version, t.engine),
        promptId: p.id,
        promptVersion: p.version,
        promptLanguage: p.language,
        promptText: p.text,
        engine: t.engine,
        target: t,
      });
    }
  }
  return { calls, excluded };
}

/** Jour de la fenêtre : la fenêtre doit être en cours, et le jour dans ses dates. */
export function checkDay(b: SubjectBundle, windowId: string, day: string): void {
  const w = windowOf(b, windowId);
  if (w.status !== "running") throw new Error(`fenêtre ${windowId} au statut "${w.status}" : la collecte n'a lieu que pour une fenêtre "running"`);
  if (!w.start) throw new Error(`fenêtre ${windowId} : début (start) non fixé`);
  const offset = (Date.parse(`${day}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / 86_400_000;
  if (offset < 0 || offset >= w.days) throw new Error(`le ${day} est hors de la fenêtre ${windowId} (${w.start}, ${w.days} jours)`);
}

export class CostUnreadableError extends Error {}

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

/** Dernier coût retenu du mois dans le journal de cost-guard.sh (0 si aucun relevé ce mois-ci). */
export function journalMonthUsd(file: string, month: string): number {
  if (!existsSync(file)) return 0;
  const lines = readFileSync(file, "utf8").split("\n").filter((l) => l.trim());
  const header = (lines.shift() ?? "").split(",");
  const iMonth = header.indexOf("month_utc");
  const iRetained = header.indexOf("retained_usd");
  if (iMonth < 0 || iRetained < 0) throw new CostUnreadableError(`${file} : colonnes month_utc ou retained_usd absentes`);
  let last: number | null = null;
  for (const l of lines) {
    const cols = l.split(",");
    if (cols[iMonth] !== month) continue;
    const v = Number(cols[iRetained]);
    if (!Number.isFinite(v) || v < 0) throw new CostUnreadableError(`${file} : coût retenu illisible (« ${cols[iRetained]} »)`);
    last = v;
  }
  return last ?? 0;
}

/** Coût du mois UTC déjà engagé par le collecteur OIA direct, tous sujets confondus. */
export function monthSpendUsd(
  dataDir: string,
  month: string,
  journalFile: string,
): { usd: number; collectorUsd: number; judgeUsd: number; failuresUsd: number; journalUsd: number } {
  let collectorUsd = 0;
  let judgeUsd = 0;
  let failuresUsd = 0;
  const subjects = existsSync(dataDir) ? readdirSync(dataDir, { withFileTypes: true }).filter((d) => d.isDirectory()) : [];
  for (const s of subjects) {
    const dir = join(dataDir, s.name, "evidence");
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
      if (f.endsWith(".failures.jsonl")) {
        for (const r of readJsonl<FailureRow>(join(dir, f))) {
          if (r.collectorName !== OIA_DIRECT_COLLECTOR || !r.at?.startsWith(month)) continue;
          if (!Number.isFinite(r.worstCaseUsd)) throw new CostUnreadableError(`${f} : échec ${r.id} sans coût`);
          failuresUsd += r.worstCaseUsd;
        }
        continue;
      }
      for (const r of readJsonl<EvidenceRow>(join(dir, f))) {
        if (r.collectorName !== OIA_DIRECT_COLLECTOR || !r.receivedAt?.startsWith(month)) continue;
        const cost = (r.structured as { cost?: { readable?: unknown } }).cost;
        if (!Number.isFinite(r.costUsd) || cost?.readable === false) throw new CostUnreadableError(`preuve ${r.id} : coût illisible (modèle absent de la grille src/cost-grid.ts ?)`);
        collectorUsd += r.costUsd;
        // Coût du juge, rangé à part (costUsd reste celui de la réponse, comme à J0).
        const judgeCost = (r.structured as { mentions?: { judge?: { cost?: { usd?: unknown } } | null } }).mentions?.judge?.cost?.usd;
        if (judgeCost !== undefined) {
          if (typeof judgeCost !== "number" || !Number.isFinite(judgeCost)) throw new CostUnreadableError(`preuve ${r.id} : coût du juge illisible`);
          judgeUsd += judgeCost;
        }
      }
    }
  }
  const journalUsd = journalMonthUsd(journalFile, month);
  return { usd: collectorUsd + judgeUsd + failuresUsd + journalUsd, collectorUsd, judgeUsd, failuresUsd, journalUsd };
}

export function readCap(env: Record<string, string | undefined>): number | null {
  const raw = env.OIA_VIS_MONTHLY_CAP_USD;
  if (raw === undefined || raw.trim() === "") return null;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : null;
}

export interface RunDayOptions {
  bundle: SubjectBundle;
  windowId: string;
  dataDir: string;
  collector: Collector;
  env: Record<string, string | undefined>;
  now?: () => Date;
  journalFile?: string;
  /** Résolution des liens de redirection de Gemini ; absente = non résolus. */
  resolver?: Resolver;
  /** Juge des mentions (src/judge.ts) : `createJudge("jev" | "aucun", …)`. */
  judge: MentionJudge;
  /** Marque et concurrents suivis ; par défaut, ceux du sujet. */
  mentionConfig?: MentionConfig;
  log?: (line: string) => void;
}

export interface DaySummary {
  day: string;
  planned: number;
  collected: number;
  alreadyDone: number;
  failedBefore: number;
  failed: number;
  notRun: number;
  stopped: null | "plafond" | "cout-illisible";
  monthUsdBefore: number;
  monthUsdAfter: number;
  capUsd: number;
}

export async function runDay(o: RunDayOptions): Promise<DaySummary> {
  const now = o.now ?? (() => new Date());
  const log = o.log ?? (() => {});
  const b = o.bundle;
  const day = now().toISOString().slice(0, 10);
  const month = day.slice(0, 7);
  checkDay(b, o.windowId, day);
  const cap = readCap(o.env);
  if (cap === null) throw new Error("plafond mensuel non posé ou illisible (OIA_VIS_MONTHLY_CAP_USD) : collecte refusée");

  const evFile = evidencePath(o.dataDir, b.subject.id, o.windowId);
  const failFile = failuresPath(o.dataDir, b.subject.id, o.windowId);
  const done = new Set(readEvidence(evFile).map((e) => e.id));
  const failedIds = new Set(readJsonl<FailureRow>(failFile).map((f) => f.id));
  const { calls } = planDay(b, o.windowId, day);
  const todo = calls.filter((c) => !done.has(c.evidenceId) && !failedIds.has(c.evidenceId));

  // Toutes les clés nécessaires avant le premier appel : pas de jour à moitié collecté pour une clé oubliée.
  const missing = [...new Set(todo.map((c) => PROVIDERS[c.target.provider].keyEnv))].filter((k) => !o.env[k]);
  if (missing.length) throw new MissingKeyError(`clé(s) absente(s) de l'environnement : ${missing.join(", ")}`);
  const continuation = { mistralContinuation: mistralContinuationEnabled(o.env) };
  const mentionConfig = o.mentionConfig ?? mentionConfigFrom(b);
  for (const c of todo) if (targetWorstCaseUsd(c.target, continuation) === undefined) throw new CostUnreadableError(`cible ${c.target.raw} : aucun prix dans la grille`);

  const before = monthSpendUsd(o.dataDir, month, o.journalFile ?? join(o.dataDir, "cost-journal.csv"));
  let spent = before.usd;
  const clientId = b.subject.ownership === "internal" ? "oia-internal" : b.subject.id;
  const summary: DaySummary = {
    day,
    planned: calls.length,
    collected: 0,
    alreadyDone: calls.filter((c) => done.has(c.evidenceId)).length,
    failedBefore: calls.filter((c) => failedIds.has(c.evidenceId)).length,
    failed: 0,
    notRun: 0,
    stopped: null,
    monthUsdBefore: before.usd,
    monthUsdAfter: before.usd,
    capUsd: cap,
  };
  const citedRedirects: string[] = [];

  for (let i = 0; i < todo.length; i++) {
    const c = todo[i]!;
    // Majorant de la case : la réponse, plus le juge.
    const worst = targetWorstCaseUsd(c.target, continuation)! + o.judge.worstCaseUsdPerAnswer;
    if (spent + worst > cap) {
      summary.stopped = "plafond";
      summary.notRun = todo.length - i;
      log(`arrêt au plafond : ${spent.toFixed(4)} $ engagés + ${worst.toFixed(4)} $ au majorant > ${cap} $ ; ${summary.notRun} appel(s) non faits`);
      break;
    }
    try {
      const r = await o.collector.collect({
        clientId,
        siteId: b.subject.id,
        subjectId: b.subject.id,
        windowId: o.windowId,
        promptId: c.promptId,
        promptVersion: c.promptVersion,
        promptLanguage: c.promptLanguage,
        promptText: c.promptText,
        engine: c.engine,
        engineOptions: { target: c.target.raw },
      });
      const judged = await o.judge.judge({ text: r.rawText, question: c.promptText, config: mentionConfig });
      const row: EvidenceRow = {
        id: c.evidenceId,
        clientId,
        siteId: b.subject.id,
        subjectId: b.subject.id,
        windowId: o.windowId,
        promptId: c.promptId,
        promptVersion: c.promptVersion,
        promptLanguage: c.promptLanguage,
        engine: c.engine,
        engineVersion: r.engineVersion,
        collectorName: r.collectorName,
        collectorRunId: r.collectorRunId,
        receivedAt: r.receivedAt,
        rawText: r.rawText,
        rawSha256Hex: sha256Hex(r.rawText),
        structured: {
          ...r.structured,
          day,
          brandMentioned: judged.brandMentioned,
          competitorsMentioned: judged.competitorsMentioned,
          mentions: { judgeName: o.judge.name, ...judged.mentions },
        },
        citations: r.citations,
        costUsd: r.costUsd,
      };
      appendEvidence(evFile, [row]);
      summary.collected++;
      spent += r.costUsd + judged.costUsd;
      citedRedirects.push(...r.citations.map((x) => x.url).filter(isRedirectLink));
      log(`${c.engine} ${c.promptId}@v${c.promptVersion} : ${r.rawText.length} caractères, ${r.citations.length} citation(s), ${r.costUsd.toFixed(4)} $ + juge ${judged.costUsd.toFixed(4)} $`);
      if ((r.structured as { cost?: { readable?: boolean } }).cost?.readable === false) {
        summary.stopped = "cout-illisible";
        summary.notRun = todo.length - i - 1;
        log(`arrêt : coût illisible pour ${c.target.raw} (version servie ${r.engineVersion} absente de src/cost-grid.ts) ; ${summary.notRun} appel(s) non faits`);
        break;
      }
    } catch (err) {
      if (err instanceof MissingKeyError) throw err;
      const pe = err instanceof ProviderError ? err : null;
      const failure: FailureRow = {
        id: c.evidenceId,
        subjectId: b.subject.id,
        windowId: o.windowId,
        day,
        engine: c.engine,
        target: c.target.raw,
        promptId: c.promptId,
        promptVersion: c.promptVersion,
        at: now().toISOString(),
        error: err instanceof Error ? err.message : String(err),
        status: pe?.status ?? null,
        attempts: pe?.attempts ?? null,
        worstCaseUsd: worst,
        collectorName: OIA_DIRECT_COLLECTOR,
      };
      mkdirSync(dirname(failFile), { recursive: true });
      appendFileSync(failFile, `${JSON.stringify(failure)}\n`);
      summary.failed++;
      spent += worst;
      log(`${c.engine} ${c.promptId}@v${c.promptVersion} : ÉCHEC consigné (${failure.error})`);
    }
  }
  summary.monthUsdAfter = spent;

  if (o.resolver && citedRedirects.length) {
    const cacheFile = join(o.dataDir, b.subject.id, "redirects-cache.json");
    const r = await resolveRedirects(citedRedirects, readCache(cacheFile), o.resolver);
    mkdirSync(dirname(cacheFile), { recursive: true });
    writeFileSync(cacheFile, `${JSON.stringify(r.cache, null, 2)}\n`);
    log(`liens de redirection : ${r.resolved} résolus, ${r.cached} déjà en cache, ${r.failed} en échec`);
  }
  return summary;
}

/** Plan du jour et coût au majorant, sans aucun appel. */
export function estimateDay(
  b: SubjectBundle,
  windowId: string,
  day: string,
  opts: { mistralContinuation?: boolean; judgeWorstCaseUsdPerAnswer?: number } = {},
): { lines: string[]; worstCaseUsd: number } {
  const { calls, excluded } = planDay(b, windowId, day);
  const byEngine = new Map<string, { n: number; usd: number; target: string }>();
  for (const c of calls) {
    const e = byEngine.get(c.engine) ?? { n: 0, usd: 0, target: c.target.raw };
    e.n++;
    e.usd += (targetWorstCaseUsd(c.target, opts) ?? Number.NaN) + (opts.judgeWorstCaseUsdPerAnswer ?? 0);
    byEngine.set(c.engine, e);
  }
  const lines = [...byEngine.entries()].map(([engine, e]) => `${engine} (${e.target}) : ${e.n} appel(s), au plus ${e.usd.toFixed(4)} $`);
  for (const x of excluded) lines.push(`exclu : ${x.promptId} × ${x.engine} (${x.reason})`);
  return { lines, worstCaseUsd: [...byEngine.values()].reduce((s, e) => s + e.usd, 0) };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const go = args.includes("--go");
  const judgeAt = args.indexOf("--juge");
  const judgeName = judgeAt >= 0 ? args[judgeAt + 1] ?? "" : "jev";
  const [subjectId, windowId] = args.filter((a, i) => !a.startsWith("--") && !(judgeAt >= 0 && i === judgeAt + 1));
  (async () => {
    if (!subjectId || !windowId) throw new Error("usage: tsx src/collect-day.ts <sujet> <fenêtre> [--juge jev|mistral|aucun] [--go]");
    if (!JUDGE_NAMES.includes(judgeName as never)) throw new Error(`juge inconnu "${judgeName}" : ${JUDGE_NAMES.join(", ")}`);
    // Juge non retenu : refusé dès l'estimation.
    if (judgeName === "mistral") createJudge(judgeName, { fetch: async () => Promise.reject(new Error("aucun appel")), env: {} });
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const dataDir = resolve(process.env.OIA_VIS_DATA ?? join(homedir(), "oia-visibility-data"));
    const day = new Date().toISOString().slice(0, 10);
    const mistralContinuation = mistralContinuationEnabled(process.env);
    const judgeWorst = judgeWorstCaseUsd(judgeName as JudgeName);
    const est = estimateDay(b, windowId, day, { mistralContinuation, judgeWorstCaseUsdPerAnswer: judgeWorst });
    process.stdout.write(`${subjectId} / ${windowId}, jour ${day} :\n${est.lines.map((l) => `  ${l}`).join("\n")}\n  total au majorant (réponses + juge ${judgeName}) : ${est.worstCaseUsd.toFixed(4)} $\n`);
    process.stdout.write(`  suite des conversations Mistral : ${mistralContinuation ? "activée" : "désactivée"}\n`);
    const cap = readCap(process.env);
    process.stdout.write(`  plafond mensuel : ${cap === null ? "NON POSÉ (OIA_VIS_MONTHLY_CAP_USD)" : `${cap} $`}\n`);
    if (!go) {
      process.stdout.write("Aucun appel (estimation seule). Ajouter --go pour collecter.\n");
      return;
    }
    const realFetch = globalThis.fetch as unknown as FetchLike;
    // Juge avant tout appel : jev sans TYPESAFE_API_KEY est refusé ici.
    const judge = createJudge(judgeName, { fetch: realFetch, env: process.env });
    const summary = await runDay({
      bundle: b,
      windowId,
      dataDir,
      collector: createOiaDirectCollector({ fetch: realFetch, env: process.env }),
      env: process.env,
      judge,
      journalFile: process.env.OIA_VIS_COST_JOURNAL,
      resolver: safeResolver,
      log: (l) => process.stdout.write(`${l}\n`),
    });
    process.stdout.write(`${JSON.stringify(summary)}\n`);
    if (summary.stopped) process.exit(3);
  })().catch((err) => {
    process.stderr.write(`collect-day : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(err instanceof CostUnreadableError ? 3 : 1);
  });
}
