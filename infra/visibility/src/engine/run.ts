/**
 * Un passage du moteur (mandat v16, bloc B) : le moteur lit la file de demandes de la base,
 * traite chaque demande, écrit ses résultats en base, et signe sa présence.
 *
 *  1. signe de vie : `vis_moteur_signe(hôte, commit, prochain passage)` ;
 *  2. demandes une à une (`vis_moteur_prendre` ; une demande RUNNING abandonnée depuis plus de
 *     30 minutes y repasse en file, en base) ; chacune se termine par `vis_moteur_terminer`,
 *     avec son résultat ou une erreur lisible ;
 *  3. avec `--quotidien` : le passage du jour (src/scheduler.ts) sur toutes les fenêtres en
 *     cours, puis jours, preuves, pages, recommandations et statuts écrits en base.
 *
 * Types de demande :
 *  - SITE_ADD : lecture du site, audit, faits, panel, par src/site-add.ts SANS appel payant
 *    (le contrat ne prévoit aucun GO pour SITE_ADD : faits déterministes seulement, Mistral
 *    non appelé) ; propositions en base et estimation de la reconnaissance ;
 *  - RECON : refusée sans GO en base ; sinon une journée de questions non marquées, acteurs et
 *    homonymes proposés, estimation du J0 ;
 *  - WINDOW_RUN : refusée sans GO en base ; sinon la fenêtre est inscrite dans le cache, et le
 *    passage quotidien la fait avancer (collecte, jours, clôture, rapport, page, recommandations) ;
 *  - REPORT : rapport et page client d'une fenêtre close, réécrits en base depuis le cache ;
 *  - REMEASURE_PROPOSE : remesure chiffrée, 21 jours après la dernière exécution déclarée.
 *
 * La base fait foi. Le dossier du moteur (OIA_VIS_ENGINE_DIR, défaut
 * `~/oia-visibility-data/moteur`, hors de tout dépôt) n'est qu'un cache local, reconstruit
 * depuis la base à chaque demande : panel, concurrents, fenêtres et plafond viennent d'elle.
 *
 * Plafonds : avant tout appel payant, GO, coût estimé et plafond du client sont relus en base
 * (`vis_moteur_go`) ; le plafond global passé à collect-day est celui de la base. Coût
 * illisible : arrêt et alerte COUT_ILLISIBLE.
 *
 * CLI : tsx src/engine/run.ts [--quotidien] [--max <n>]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { type Alert, type AlertSink, journalSink } from "../alerts.js";
import { CostUnreadableError, evidencePath, monthSpendUsd } from "../collect-day.js";
import type { Collector } from "../collector.js";
import type { FetchLike } from "../collector-oia/http.js";
import { createOiaDirectCollector, OIA_DIRECT_COLLECTOR } from "../collector-oia-direct.js";
import { clientLanguage } from "../client-page.js";
import { estimateWindow, type ReferenceFigures, type WindowEstimate } from "../cost-estimate.js";
import type { EvidenceRow } from "../elmo-import.js";
import { readEvidence } from "../evidence-store.js";
import type { ReportFigures } from "../j0-report.js";
import { createJudge, type JudgeName, type MentionJudge } from "../judge.js";
import { loadSubject } from "../load.js";
import { ConcurrentsSchema, FaitsSchema, HomonymesSchema, AuditSchema } from "../proposition.js";
import { loadRecommendations } from "../recommendation.js";
import { MIN_DAYS_AFTER_EXECUTION } from "../recommendation-status.js";
import { runScheduler, windowDir, type DayRecord, type GenerateRecommendations } from "../scheduler.js";
import { CompetitorSchema, MeasurementSchema, PanelSchema, SubjectSchema, type Measurement, type Panel, type Prompt, type Subject } from "../schema.js";
import { siteAdd } from "../site-add.js";
import { extractActors } from "../site/actors.js";
import { DEFAULT_CRAWLIE_COMMAND, type CrawlieCommand } from "../site/audit.js";
import { concurrentsFile, homonymesFile } from "../site/formats.js";
import { findHomonyms } from "../site/homonyms.js";
import { safePageFetcher, type PageFetcher } from "../site/pages.js";
import { assertOutsideRepo, ensurePrivateDir } from "../site/paths.js";
import { readReconnaissanceAnswers, reconnaissanceBundle, reconnaissanceWindowId, runReconnaissance } from "../site/reconnaissance.js";
import { subjectTerms } from "../site/terms.js";
import { PsqlEngineDb, type AlerteMoteur, type Demande, type EngineDb, type GoEnBase, type NatureProposition, type PreuveBase, type SujetEnBase } from "./db.js";

export interface EngineOptions {
  db: EngineDb;
  /** Dossier du moteur (cache local), hors de tout dépôt. */
  dir: string;
  hote: string;
  version: string;
  env: Record<string, string | undefined>;
  now?: () => Date;
  /** Délai jusqu'au prochain passage prévu (signe de vie). */
  everyMinutes?: number;
  /** Nombre maximal de demandes traitées par passage. */
  max?: number;
  quotidien?: boolean;
  fetch: PageFetcher;
  crawlie: CrawlieCommand;
  /** Accès payants, créés seulement après le contrôle du GO en base. */
  collector: () => Collector;
  judge: () => MentionJudge;
  judgeName?: JudgeName;
  generateRecommendations?: GenerateRecommendations;
  allowedLocal?: string[];
  log?: (line: string) => void;
}

export interface Traitement {
  id: string;
  type: Demande["type"];
  statut: "DONE" | "FAILED";
  resultat: Record<string, unknown> | null;
  erreur: string | null;
}

export interface PassageResult {
  traitees: Traitement[];
  quotidien: { lignes: string[]; sujets: string[] } | null;
}

/** Refus lisible, avec l'alerte qu'il déclenche. */
export class EngineRefusal extends Error {
  constructor(
    message: string,
    readonly alerte: AlerteMoteur["type"] = "ECHEC_DEMANDE",
  ) {
    super(message);
  }
}

const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const msg = (err: unknown) => (err instanceof Error ? err.message : String(err));
const today = (now: Date) => now.toISOString().slice(0, 10);
const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Fenêtres : identifiant en base `<sujet>-<fenêtre>` (comme src/vis-sync.ts), local `<fenêtre>`. */
export const dbWindowId = (subjectId: string, local: string) => `${subjectId}-${local}`;
export const localWindowId = (subjectId: string, dbId: string) => (dbId.startsWith(`${subjectId}-`) ? dbId.slice(subjectId.length + 1) : dbId);
export const RECON_LOCAL = "reconnaissance";

/** Identifiant stable d'une proposition, unique dans la base. */
export const propositionId = (subjectId: string, nature: NatureProposition, local: string) => `${subjectId}:${nature}:${local}`;
const localOf = (id: string) => id.split(":").slice(2).join(":");

/** UUID stable dérivé de l'identifiant d'une preuve locale (vis.evidence.id est un uuid). */
export function evidenceUuid(localId: string): string {
  const h = createHash("sha256").update(`oia-visibility:evidence:${localId}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16]!, 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function toPreuve(e: EvidenceRow, clientId: string, dbWindow: string): PreuveBase {
  if (!e.subjectId) throw new Error(`preuve ${e.id} sans sujet`);
  return {
    id: evidenceUuid(e.id),
    client_id: clientId,
    site_id: e.siteId ?? e.subjectId,
    subject_id: e.subjectId,
    window_id: dbWindow,
    prompt_id: e.promptId,
    prompt_version: e.promptVersion,
    prompt_language: e.promptLanguage,
    engine: e.engine,
    engine_version: e.engineVersion ?? null,
    collector_name: e.collectorName,
    collector_run_id: e.collectorRunId,
    received_at: e.receivedAt,
    raw_text: e.rawText,
    structured: { ...e.structured, oiaEvidenceId: e.id },
    citations: e.citations,
    cost_usd: e.costUsd,
  };
}

interface Ctx {
  o: EngineOptions;
  now: Date;
  log: (l: string) => void;
  subjectsDir: string;
  dataDir: string;
}

/** Un passage : signe, demandes, puis (avec `quotidien`) les fenêtres en cours. */
export async function runEngine(o: EngineOptions): Promise<PassageResult> {
  const now = (o.now ?? (() => new Date()))();
  const dir = ensurePrivateDir(o.dir);
  const ctx: Ctx = { o, now, log: o.log ?? (() => {}), subjectsDir: ensurePrivateDir(join(dir, "sujets")), dataDir: ensurePrivateDir(join(dir, "donnees")) };
  await o.db.signe(o.hote, o.version, new Date(now.getTime() + (o.everyMinutes ?? 5) * 60_000));
  const traitees: Traitement[] = [];
  for (let i = 0; i < (o.max ?? 20); i++) {
    const d = await o.db.prendre(o.hote);
    if (!d) break;
    traitees.push(await handle(ctx, d));
  }
  const quotidien = o.quotidien ? await runDaily(ctx) : null;
  return { traitees, quotidien };
}

async function handle(ctx: Ctx, d: Demande): Promise<Traitement> {
  ctx.log(`demande ${d.id} : ${d.type}${d.subject_id ? ` (${d.subject_id})` : ""}`);
  try {
    const run = { SITE_ADD: siteAddDemande, RECON: reconDemande, WINDOW_RUN: windowRunDemande, REPORT: reportDemande, REMEASURE_PROPOSE: remeasureDemande }[d.type];
    if (!run) throw new EngineRefusal(`type de demande inconnu « ${String(d.type)} »`);
    const resultat = await run(ctx, d);
    await ctx.o.db.terminer(d.id, resultat, null);
    ctx.log(`  terminée : ${JSON.stringify(resultat)}`);
    return { id: d.id, type: d.type, statut: "DONE", resultat, erreur: null };
  } catch (err) {
    const erreur = msg(err).split("\n")[0]!.slice(0, 500);
    const type = err instanceof EngineRefusal ? err.alerte : err instanceof CostUnreadableError ? "COUT_ILLISIBLE" : "ECHEC_DEMANDE";
    await ctx.o.db.terminer(d.id, null, erreur);
    await ctx.o.db.alerter({ client_id: d.client_id, subject_id: d.subject_id, gravite: "bloquant", type, message: `${d.type} : ${erreur}` });
    ctx.log(`  ÉCHEC : ${erreur}`);
    return { id: d.id, type: d.type, statut: "FAILED", resultat: null, erreur };
  }
}

const str = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new EngineRefusal(`charge de la demande : ${what} absent`);
  return v.trim();
};
const strs = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v) || !v.length || !v.every((x) => typeof x === "string")) throw new EngineRefusal(`charge de la demande : ${what} absent`);
  return v as string[];
};
const subjectOf = (d: Demande) => {
  if (!d.subject_id) throw new EngineRefusal("demande sans sujet");
  return d.subject_id;
};

// ---------------------------------------------------------------- SITE_ADD

interface SiteInput {
  subjectId: string;
  clientId: string;
  clientName?: string;
  url: string;
  name?: string;
  languages: string[];
  countries: string[];
}

/** Lecture du site et propositions, sans aucun appel payant ; reconstruit aussi le cache. */
async function addSite(ctx: Ctx, s: SiteInput) {
  const r = await siteAdd({
    url: s.url,
    clientId: s.clientId,
    clientName: s.clientName,
    name: s.name,
    languages: s.languages,
    countries: s.countries,
    // Aucun GO de SITE_ADD dans le contrat : ni Mistral, ni moteurs.
    go: { faits: false, reconnaissance: false },
    subjectsDir: ctx.subjectsDir,
    dataDir: ctx.dataDir,
    fetch: ctx.o.fetch,
    crawlie: ctx.o.crawlie,
    env: {},
    now: () => ctx.now,
    allowedLocal: ctx.o.allowedLocal,
  });
  if (r.subjectId !== s.subjectId) throw new EngineRefusal(`sujet en base « ${s.subjectId} » ≠ sujet dérivé de l'adresse « ${r.subjectId} »`);
  return r;
}

async function siteAddDemande(ctx: Ctx, d: Demande): Promise<Record<string, unknown>> {
  const subjectId = subjectOf(d);
  const c = d.charge;
  const input: SiteInput = { subjectId, clientId: d.client_id, clientName: typeof c.client_nom === "string" ? c.client_nom : undefined, url: str(c.url, "url"), name: typeof c.nom === "string" && c.nom.trim() ? c.nom : undefined, languages: strs(c.langues, "langues"), countries: strs(c.marches, "marches") };
  const r = await addSite(ctx, input);
  const prop = join(r.dir, "proposition");
  const db = ctx.o.db;
  const counts: Record<string, number> = { fait: 0, question: 0, audit: 0 };
  const put = async (nature: NatureProposition, local: string, contenu: Record<string, unknown>, source: string | null) => {
    await db.proposer({ subject_id: subjectId, id: propositionId(subjectId, nature, local), nature, contenu, source });
    counts[nature] = (counts[nature] ?? 0) + 1;
  };
  for (const f of FaitsSchema.parse(parse(readFileSync(join(prop, "faits.yaml"), "utf8"))).faits) {
    await put("fait", f.id, { enonce: f.statement, categorie: f.category, langue: f.language }, f.sourceUrl);
  }
  const b = loadSubject(r.dir);
  const panel = PanelSchema.parse(parse(readFileSync(join(prop, "panel.yaml"), "utf8")));
  for (const p of panel.prompts.filter((x) => x.status !== "retired")) {
    await put("question", p.id, { texte: p.text, langue: p.language, marquee: p.family === "branded", famille: p.intent ?? p.family, moteurs: enginesFor(b.measurement, p.language) }, null);
  }
  const NIVEAU = { ok: "conforme", attention: "alerte", bloquant: "bloquant" } as const;
  for (const k of AuditSchema.parse(JSON.parse(readFileSync(join(prop, "audit.json"), "utf8"))).constats) {
    await put("audit", k.code, { controle: k.code, etat: NIVEAU[k.niveau], detail: k.texte }, k.preuve ?? null);
  }
  // Estimation de la reconnaissance, sur le panel proposé (la reconnaissance n'a lieu qu'après validation).
  const reco = reconnaissanceBundle(r.dir, b.subject, b.measurement, panel, today(ctx.now));
  const est = estimateWindow(reco, reco.measurement.windows[0]!, { reference: globalReference(ctx), judge: "aucun" });
  await db.estimer(estimation(subjectId, RECON_LOCAL, "reconnaissance", "Reconnaissance", null, est));
  return {
    propositions: counts,
    reconnaissance: { cout_estime_usd: est.totalUsd, appels: est.answers },
    faits_mistral: "non lancés : le contrat ne prévoit aucun GO pour SITE_ADD (faits déterministes seulement)",
    cout_faits_mistral_usd: r4(r.costs.faitsMistral.usd),
  };
}

const enginesFor = (m: Measurement, language: string) => m.engines.filter((e) => e.collection === "api" && (!e.languages || e.languages.includes(language))).map((e) => e.model);

function estimation(subjectId: string, local: string, nature: "reconnaissance" | "reference" | "remesure", libelle: string, compareAvec: string | null, e: WindowEstimate, heureUtc: string | null = null) {
  return {
    subject_id: subjectId,
    window_id: dbWindowId(subjectId, local),
    nature,
    libelle,
    compare_avec: compareAvec ? dbWindowId(subjectId, compareAvec) : null,
    jours_prevus: e.days,
    questions: Math.max(0, ...e.perEngine.map((x) => x.questions)),
    moteurs: e.perEngine.map((x) => x.engine),
    cout_estime_usd: e.totalUsd,
    detail_estimation: { appels: e.answers, par_moteur: Object.fromEntries(e.perEngine.map((x) => [x.engine, x.usd])), juge: { nom: e.judge.name, usd: e.judge.usd } },
    heure_utc: heureUtc,
  };
}

/** Heure UTC de la collecte quotidienne (celle du passage quotidien de launchd). */
const runTimeUtc = (ctx: Ctx) => {
  const t = ctx.o.env.OIA_VIS_RUN_TIME_UTC ?? "07:00";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(t)) throw new EngineRefusal(`OIA_VIS_RUN_TIME_UTC invalide : ${t}`);
  return t;
};

/** Référence de coût : le figures.json le plus récent du cache (coûts réels par moteur), sinon la grille. */
function globalReference(ctx: Ctx): { figures: ReferenceFigures; languages: null } | null {
  let best: { at: string; figures: ReportFigures } | null = null;
  for (const s of existsSync(ctx.subjectsDir) ? readdirSync(ctx.subjectsDir) : []) {
    const reports = join(ctx.subjectsDir, s, "reports");
    if (!existsSync(reports)) continue;
    for (const w of readdirSync(reports)) {
      const f = join(reports, w, "figures.json");
      if (!existsSync(f)) continue;
      const figures = JSON.parse(readFileSync(f, "utf8")) as ReportFigures;
      if (!best || figures.window.startedAt > best.at) best = { at: figures.window.startedAt, figures };
    }
  }
  // Langues de la référence inconnues ici : Mistral n'est pas repris (src/cost-estimate.ts).
  return best ? { figures: best.figures, languages: null } : null;
}

// ---------------------------------------------------------------- cache reconstruit depuis la base

async function sujetOrThrow(ctx: Ctx, subjectId: string): Promise<SujetEnBase> {
  const s = await ctx.o.db.sujet(subjectId);
  if (!s) throw new EngineRefusal(`sujet ${subjectId} introuvable en base`);
  return s;
}

/** Dossier du sujet dans le cache ; relu sur le site (gratuit) s'il manque. */
async function ensureCache(ctx: Ctx, s: SujetEnBase): Promise<string> {
  const dir = join(ctx.subjectsDir, s.subject_id);
  if (!existsSync(join(dir, "subject.yaml"))) {
    ctx.log(`  cache absent : sujet relu depuis le site`);
    await addSite(ctx, { subjectId: s.subject_id, clientId: s.client_id, clientName: s.client_nom, url: s.site_url, name: s.nom, languages: s.langues, countries: s.marches });
  }
  return dir;
}

const yaml = (v: unknown) => stringify(v, { lineWidth: 0 });
const valides = (s: SujetEnBase, nature: NatureProposition) => s.propositions.filter((p) => p.nature === nature && p.etat === "valide");

/** Panel validé en base, au format de PanelSchema. */
export function panelFromDb(s: SujetEnBase, subject: Subject): Panel {
  const qs = valides(s, "question");
  if (!qs.length || s.panel_version === null) throw new EngineRefusal("panel non validé en base");
  const at = (iso: string | null) => (iso ?? "").slice(0, 10);
  const last = qs.map((q) => q.decide_le ?? "").sort().pop() ?? "";
  const prompts: Prompt[] = qs.map((q) => {
    const c = q.contenu as { texte: string; langue: string; marquee: boolean; famille?: string };
    const markets = subject.markets.filter((m) => m.languages.includes(c.langue)).map((m) => m.country);
    const intent = ["decouverte", "prix_offre", "comparaison", "niche_local", "marquee"].includes(c.famille ?? "") ? (c.famille as Prompt["intent"]) : undefined;
    return { id: localOf(q.id), version: 1, family: c.marquee ? "branded" : "unbranded", ...(intent ? { intent } : {}), language: c.langue, markets: markets.length ? markets : [subject.markets[0]!.country], text: c.texte, origin: q.propose_par === "moteur" ? "generator" : "owner", status: "active", createdAt: at(q.decide_le) };
  });
  return PanelSchema.parse({ schemaVersion: 1, panelVersion: s.panel_version, status: "validated", validatedBy: qs[0]!.decide_par ?? "mickael", validatedAt: at(last), limits: { maxPerLanguage: 20, minBrandedPerLanguage: 0 }, prompts });
}

/**
 * Réécrit le cache du sujet depuis la base : concurrents validés, panel validé, fenêtres avec
 * un GO (inscrites `running`, début de la base), fenêtres annulées (`aborted`), plafond.
 * Une fenêtre déjà close dans le cache garde son état.
 */
export function materialize(dir: string, s: SujetEnBase, day: string, opts: { panel: boolean }): void {
  const subject = SubjectSchema.parse(parse(readFileSync(join(dir, "subject.yaml"), "utf8")));
  const measurement = MeasurementSchema.parse(parse(readFileSync(join(dir, "measurement.yaml"), "utf8")));
  const competitors = valides(s, "concurrent").map((p) => {
    const c = p.contenu as { nom: string; type?: string; domaines?: string[] };
    return CompetitorSchema.parse({ name: c.nom, domains: (c.domaines ?? []).filter((x) => /^(?!https?:)[a-z0-9.-]+\.[a-z]{2,}$/.test(x)), aliases: [], category: c.type ?? "concurrent", markets: [], status: "confirmed", rationale: `Validé dans le cockpit${p.decide_par ? ` par ${p.decide_par}` : ""}` });
  });
  const running = s.fenetres.some((f) => f.nature !== "reconnaissance" && (f.statut === "go_donne" || f.statut === "en_cours"));
  writeFileSync(join(dir, "subject.yaml"), yaml({ ...subject, competitors, status: running ? "active" : subject.status }), { mode: 0o600 });
  let panelVersion = measurement.windows[0]?.panelVersion ?? 1;
  if (opts.panel) {
    const panel = panelFromDb(s, subject);
    panelVersion = panel.panelVersion;
    writeFileSync(join(dir, "panel.yaml"), yaml(panel), { mode: 0o600 });
  }
  const targets = measurement.windows.find((w) => w.targets?.length)?.targets;
  const windows = [...measurement.windows];
  for (const f of s.fenetres.filter((x) => x.nature !== "reconnaissance")) {
    const id = localWindowId(s.subject_id, f.window_id);
    const at = windows.findIndex((w) => w.id === id);
    const cur = at >= 0 ? windows[at]! : undefined;
    if (cur && (cur.status === "done" || cur.status === "aborted")) continue;
    if (f.statut === "annulee") {
      if (cur?.status === "running") windows[at] = { ...cur, status: "aborted", end: day, note: "annulée dans le cockpit" };
      continue;
    }
    if (f.statut !== "go_donne" && f.statut !== "en_cours") continue;
    if (cur?.status === "running") continue;
    if (!f.debut) throw new EngineRefusal(`fenêtre ${f.window_id} sans date de début en base`);
    const compares = f.compare_avec ? localWindowId(s.subject_id, f.compare_avec) : undefined;
    const w: Measurement["windows"][number] = { id, kind: compares ? "follow-up" : "baseline", days: f.jours_prevus, panelVersion, status: "running", start: f.debut, missingDays: [], targets, ...(f.heure_utc ? { runTimeUtc: f.heure_utc } : {}), ...(compares ? { comparesWith: compares } : {}), note: `GO donné dans le cockpit ; inscrite par le moteur le ${day}` };
    if (at >= 0) windows[at] = w;
    else windows.push(w);
  }
  const { budget: _b, ...rest } = measurement;
  const next = { ...rest, windows, ...(s.plafond_usd !== null ? { budget: { monthlyCapUsd: s.plafond_usd } } : {}) };
  writeFileSync(join(dir, "measurement.yaml"), yaml(MeasurementSchema.parse(next)), { mode: 0o600 });
  loadSubject(dir); // contrôle de cohérence du cache
}

// ---------------------------------------------------------------- GO et plafonds

/** GO, coût estimé et plafonds lus en base avant tout appel payant. */
export function checkGo(go: GoEnBase | null, label: string, coutVuDemande?: unknown): GoEnBase & { plafond_usd: number; plafond_global_usd: number; cout_estime_usd: number } {
  if (!go) throw new EngineRefusal(`${label} : fenêtre introuvable en base, aucun appel payant`);
  if (!go.go_le) throw new EngineRefusal(`${label} : aucun GO enregistré en base, aucun appel payant`);
  if (go.statut !== "go_donne" && go.statut !== "en_cours") throw new EngineRefusal(`${label} : fenêtre au statut « ${go.statut} », aucun appel payant`);
  if (go.cout_estime_usd === null || !Number.isFinite(go.cout_estime_usd)) throw new EngineRefusal(`${label} : coût estimé illisible en base`, "COUT_ILLISIBLE");
  if (go.cout_vu_au_go_usd === null || Math.abs(go.cout_vu_au_go_usd - go.cout_estime_usd) > 1e-6) throw new EngineRefusal(`${label} : coût vu au GO différent de l'estimation en base, aucun appel payant`);
  // La charge de la demande porte aussi le coût vu : il doit être celui du GO.
  if (coutVuDemande !== undefined && (typeof coutVuDemande !== "number" || Math.abs(coutVuDemande - go.cout_vu_au_go_usd) > 1e-6)) throw new EngineRefusal(`${label} : coût vu de la demande différent du GO en base, aucun appel payant`);
  if (go.plafond_usd === null) throw new EngineRefusal(`${label} : plafond du client non fixé, aucun appel payant`, "PLAFOND");
  if (go.plafond_global_usd === null) throw new EngineRefusal(`${label} : plafond global non fixé, aucun appel payant`, "PLAFOND");
  if (go.reel_usd + go.cout_estime_usd > go.plafond_usd) {
    throw new EngineRefusal(`${label} : ${go.reel_usd.toFixed(2)} $ dépensés ce mois + ${go.cout_estime_usd.toFixed(2)} $ estimés > plafond ${go.plafond_usd} $`, "PLAFOND");
  }
  return go as GoEnBase & { plafond_usd: number; plafond_global_usd: number; cout_estime_usd: number };
}

/** Plafond passé à collect-day : le plus bas du global (base) et du reste du budget du client (base). */
function capEnv(ctx: Ctx, go: { plafond_usd: number; plafond_global_usd: number; reel_usd: number }, day: string): Record<string, string | undefined> {
  const localSpent = monthSpendUsd(ctx.dataDir, day.slice(0, 7), join(ctx.dataDir, "cost-journal.csv")).usd;
  const cap = Math.min(go.plafond_global_usd, localSpent + Math.max(0, go.plafond_usd - go.reel_usd));
  return { ...ctx.o.env, OIA_VIS_MONTHLY_CAP_USD: String(cap) };
}

// ---------------------------------------------------------------- RECON

async function reconDemande(ctx: Ctx, d: Demande): Promise<Record<string, unknown>> {
  const subjectId = subjectOf(d);
  const window = typeof d.charge.window_id === "string" ? d.charge.window_id : dbWindowId(subjectId, RECON_LOCAL);
  const go = checkGo(await ctx.o.db.go(subjectId, window), `reconnaissance ${window}`, d.charge.cout_vu_usd);
  const s = await sujetOrThrow(ctx, subjectId);
  const dir = await ensureCache(ctx, s);
  materialize(dir, s, today(ctx.now), { panel: false });
  const b = loadSubject(dir);
  const day = today(ctx.now);
  const panel = panelFromDb(s, b.subject);
  const reco = reconnaissanceBundle(dir, b.subject, b.measurement, panel, day);
  await ctx.o.db.fenetre(subjectId, window, "en_cours", day);
  const summary = await runReconnaissance({ bundle: reco, dataDir: ctx.dataDir, collector: ctx.o.collector(), env: capEnv(ctx, go, day), now: () => ctx.now, log: (l) => ctx.log(`    ${l}`) });
  const localWin = reconnaissanceWindowId(day);
  const pushed = await ctx.o.db.preuves(readEvidence(evidencePath(ctx.dataDir, subjectId, localWin)).filter((e) => e.collectorName === OIA_DIRECT_COLLECTOR).map((e) => toPreuve(e, s.client_id, window)));
  const done = summary.collected + summary.alreadyDone;
  await ctx.o.db.consignerJour({ subject_id: subjectId, window_id: window, jour: 1, date: day, etat: done === summary.planned ? "complet" : done === 0 ? "manquant" : "partiel", detail: { prevus: summary.planned, collectes: done, echecs: summary.failed + summary.failedBefore } });
  if (summary.stopped === "cout-illisible") throw new EngineRefusal("coût illisible d'une réponse : reconnaissance arrêtée", "COUT_ILLISIBLE");
  if (summary.stopped === "plafond") throw new EngineRefusal(`plafond atteint : ${summary.notRun} appel(s) non faits`, "PLAFOND");
  await ctx.o.db.fenetre(subjectId, window, "close", null);

  // Acteurs et homonymes (gratuits), proposés en base.
  const answers = readReconnaissanceAnswers(ctx.dataDir, subjectId);
  const t = subjectTerms(b.subject);
  const actors = extractActors(answers, { brandTerms: t.brandTerms, places: t.places, now: () => ctx.now });
  for (const c of ConcurrentsSchema.parse(concurrentsFile(actors)).concurrents) {
    await ctx.o.db.proposer({ subject_id: subjectId, id: propositionId(subjectId, "concurrent", c.id), nature: "concurrent", contenu: { nom: c.name, type: c.type, domaines: c.domains, citations: c.citations }, source: c.rationale });
  }
  const h = findHomonyms(answers, { brand: b.subject.displayName, aliases: t.nameAliases, domains: t.domains, places: t.places, now: () => ctx.now });
  for (const x of HomonymesSchema.parse(homonymesFile(h)).homonymes) {
    await ctx.o.db.proposer({ subject_id: subjectId, id: propositionId(subjectId, "homonyme", x.id), nature: "homonyme", contenu: { nom: x.value, exemple: x.contexte ?? "", citations: x.citations }, source: null });
  }
  // Estimation du J0 sur le panel validé, à partir des coûts réels de la référence.
  writeFileSync(join(dir, "panel.yaml"), yaml(panel), { mode: 0o600 });
  const nb = loadSubjectWithPanel(dir);
  const j0 = nb.measurement.windows.find((w) => w.id === "j0") ?? nb.measurement.windows[0]!;
  const est = estimateWindow(nb, { ...j0, panelVersion: panel.panelVersion }, { reference: globalReference(ctx), judge: ctx.o.judgeName ?? "jev" });
  await ctx.o.db.estimer(estimation(subjectId, j0.id, "reference", "J0", null, est, runTimeUtc(ctx)));
  return { reponses: summary.collected, preuves_en_base: pushed, concurrents: actors.acteurs.length, homonymes: h.homonymes.length, j0: { cout_estime_usd: est.totalUsd, appels: est.answers } };
}

/** Le cache avec le panel validé : la fenêtre j0 prévue suit la version du panel. */
function loadSubjectWithPanel(dir: string) {
  const panel = PanelSchema.parse(parse(readFileSync(join(dir, "panel.yaml"), "utf8")));
  const m = MeasurementSchema.parse(parse(readFileSync(join(dir, "measurement.yaml"), "utf8")));
  writeFileSync(join(dir, "measurement.yaml"), yaml({ ...m, windows: m.windows.map((w) => (w.status === "planned" ? { ...w, panelVersion: panel.panelVersion } : w)) }), { mode: 0o600 });
  return loadSubject(dir);
}

// ---------------------------------------------------------------- WINDOW_RUN

async function windowRunDemande(ctx: Ctx, d: Demande): Promise<Record<string, unknown>> {
  const subjectId = subjectOf(d);
  const window = str(d.charge.window_id, "window_id");
  const go = checkGo(await ctx.o.db.go(subjectId, window), `fenêtre ${window}`, d.charge.cout_vu_usd);
  const s = await sujetOrThrow(ctx, subjectId);
  if (!valides(s, "concurrent").length && !s.propositions.some((p) => p.nature === "concurrent" && p.etat === "rejete")) {
    throw new EngineRefusal("concurrents non validés en base");
  }
  const dir = await ensureCache(ctx, s);
  materialize(dir, s, today(ctx.now), { panel: true });
  const local = localWindowId(subjectId, window);
  const w = loadSubject(dir).measurement.windows.find((x) => x.id === local);
  if (w?.status !== "running") throw new EngineRefusal(`fenêtre ${window} non inscrite dans le cache (statut ${w?.status ?? "absente"})`);
  if (typeof d.charge.debut === "string" && d.charge.debut !== w.start) throw new EngineRefusal(`fenêtre ${window} : début de la demande ${d.charge.debut} ≠ début en base ${w.start}`);
  return { fenetre: window, debut: w.start, jours: w.days, cout_estime_usd: go.cout_estime_usd, suite: "collecte au passage quotidien, à partir du premier jour" };
}

// ---------------------------------------------------------------- REPORT

async function pushReport(ctx: Ctx, s: { subject_id: string }, dir: string, local: string): Promise<string[]> {
  const reports = join(dir, "reports", local);
  const b = loadSubject(dir);
  const out: string[] = [];
  const files: [string, "rapport" | "page_client", string][] = [
    [join(reports, `rapport-${local}.html`), "rapport", "fr"],
    [join(reports, "page-client.html"), "page_client", clientLanguage(b)],
  ];
  for (const [file, nature, langue] of files) {
    if (!existsSync(file)) throw new EngineRefusal(`${nature} de ${local} absent du cache (${file})`);
    const html = readFileSync(file, "utf8");
    // Le cockpit affiche la page sans scripts : une page qui en contient est refusée.
    if (/<script\b/i.test(html)) throw new EngineRefusal(`${nature} de ${local} : script dans la page, refusée`);
    out.push(await ctx.o.db.page({ subject_id: s.subject_id, window_id: dbWindowId(s.subject_id, local), nature, langue, html }));
  }
  return out;
}

async function reportDemande(ctx: Ctx, d: Demande): Promise<Record<string, unknown>> {
  const subjectId = subjectOf(d);
  const window = str(d.charge.window_id, "window_id");
  const dir = join(ctx.subjectsDir, subjectId);
  if (!existsSync(join(dir, "subject.yaml"))) throw new EngineRefusal(`sujet ${subjectId} absent du cache du moteur : rapport impossible`);
  const pages = await pushReport(ctx, { subject_id: subjectId }, dir, localWindowId(subjectId, window));
  return { fenetre: window, pages };
}

// ---------------------------------------------------------------- REMEASURE_PROPOSE

async function remeasureDemande(ctx: Ctx, d: Demande): Promise<Record<string, unknown>> {
  const s = await sujetOrThrow(ctx, subjectOf(d));
  return proposeRemeasure(ctx, s);
}

/**
 * Remesure chiffrée après la dernière fenêtre close, si une exécution a été déclarée depuis :
 * la fenêtre de remesure encore « proposee » est réestimée sous le même identifiant ; une
 * remesure déjà lancée n'est pas touchée. Rien n'est jamais démarré.
 */
async function proposeRemeasure(ctx: Ctx, s: SujetEnBase): Promise<Record<string, unknown>> {
  const subjectId = s.subject_id;
  const closed = s.fenetres.filter((f) => f.nature !== "reconnaissance" && f.statut === "close" && f.debut).sort((a, z) => a.debut!.localeCompare(z.debut!));
  const ref = closed.pop();
  if (!ref) return { proposee: false, raison: "aucune fenêtre close" };
  const refEnd = plusDays(ref.debut!, ref.jours_prevus);
  const last = s.executions.filter((e) => e.fenetre === null || e.fenetre !== ref.window_id).filter((e) => e.date >= refEnd).map((e) => e.date).sort().pop();
  if (!last) return { proposee: false, raison: `aucune exécution déclarée depuis la fin de ${ref.window_id}` };
  const remesures = s.fenetres.filter((f) => f.nature === "remesure");
  if (remesures.some((f) => f.statut === "go_donne" || f.statut === "en_cours")) return { proposee: false, raison: "une remesure est déjà lancée" };
  const pending = remesures.find((f) => f.statut === "proposee" && f.compare_avec === ref.window_id);
  const local = pending ? localWindowId(subjectId, pending.window_id) : `j${remesures.length + 1}`;
  const dir = await ensureCache(ctx, s);
  materialize(dir, s, today(ctx.now), { panel: true });
  const b = loadSubject(dir);
  const refLocal = localWindowId(subjectId, ref.window_id);
  const refW = b.measurement.windows.find((w) => w.id === refLocal);
  if (!refW) throw new EngineRefusal(`référence ${ref.window_id} absente du cache`);
  const figFile = join(dir, "reports", refLocal, "figures.json");
  const reference = existsSync(figFile) ? { figures: JSON.parse(readFileSync(figFile, "utf8")) as ReferenceFigures, languages: b.subject.languages } : globalReference(ctx);
  const est = estimateWindow(b, { ...refW, id: local, kind: "follow-up", status: "planned", start: undefined, end: undefined, comparesWith: refLocal }, { reference, judge: ctx.o.judgeName ?? "jev" });
  await ctx.o.db.estimer(estimation(subjectId, local, "remesure", local.toUpperCase(), refLocal, est, refW.runTimeUtc ?? runTimeUtc(ctx)));
  return { proposee: true, fenetre: dbWindowId(subjectId, local), au_plus_tot: plusDays(last, MIN_DAYS_AFTER_EXECUTION), derniere_execution: last, cout_estime_usd: est.totalUsd };
}

// ---------------------------------------------------------------- passage quotidien

const ALERT_TYPES: Record<Alert["kind"], { type: AlerteMoteur["type"]; gravite: AlerteMoteur["gravite"] } | null> = {
  echec: { type: "ECHEC_DEMANDE", gravite: "bloquant" },
  "jour-manquant": { type: "JOUR_MANQUANT", gravite: "alerte" },
  plafond: { type: "PLAFOND", gravite: "bloquant" },
  "cout-illisible": { type: "COUT_ILLISIBLE", gravite: "bloquant" },
  "rapport-pret": { type: "RAPPORT_PRET", gravite: "info" },
  // Pas de type au contrat : la remesure passe par REMEASURE_PROPOSE et vis_fenetres_v2.
  "remesure-proposee": null,
};

/** Alerte de l'ordonnanceur → alerte du contrat. */
export function toAlerte(a: Alert, clientOf: (subjectId: string | null) => string): AlerteMoteur | null {
  const t = ALERT_TYPES[a.kind];
  if (!t) return null;
  const partial = a.kind === "jour-manquant" && /\bpartiel\b/.test(a.message);
  return { client_id: clientOf(a.subjectId), subject_id: a.subjectId, gravite: t.gravite, type: partial ? "JOUR_PARTIEL" : t.type, message: a.message };
}

async function runDaily(ctx: Ctx): Promise<{ lignes: string[]; sujets: string[] }> {
  const db = ctx.o.db;
  const day = today(ctx.now);
  const clients = new Map<string, string>();
  let plafondGlobal: number | null = null;
  const sujets: string[] = [];
  // Cache remis à jour depuis la base : plafond, annulations, fenêtres inscrites.
  for (const id of readdirSync(ctx.subjectsDir).filter((x) => existsSync(join(ctx.subjectsDir, x, "subject.yaml")))) {
    const s = await db.sujet(id);
    if (!s) continue;
    clients.set(id, s.client_id);
    plafondGlobal = s.plafond_global_usd ?? plafondGlobal;
    if (!s.fenetres.some((f) => f.nature !== "reconnaissance" && ["go_donne", "en_cours", "annulee", "close"].includes(f.statut))) continue;
    try {
      materialize(join(ctx.subjectsDir, id), s, day, { panel: s.fenetres.some((f) => f.statut === "go_donne" || f.statut === "en_cours") });
      sujets.push(id);
    } catch (err) {
      await db.alerter({ client_id: s.client_id, subject_id: id, gravite: "bloquant", type: "ECHEC_DEMANDE", message: `cache du sujet : ${msg(err)}` });
    }
  }
  const collected: Alert[] = [];
  const local = journalSink(ctx.dataDir);
  const sink: AlertSink = { name: "base+journal", send: (a) => (local.send(a), collected.push(a)) };
  const r = await runScheduler({
    subjectsDir: ctx.subjectsDir,
    dataDir: ctx.dataDir,
    env: { ...ctx.o.env, OIA_VIS_MONTHLY_CAP_USD: plafondGlobal === null ? "" : String(plafondGlobal) },
    go: true,
    now: () => ctx.now,
    collector: ctx.o.collector,
    judge: ctx.o.judge,
    judgeName: ctx.o.judgeName ?? "jev",
    alerts: sink,
    generateRecommendations: ctx.o.generateRecommendations,
    log: (l) => ctx.log(`  ${l}`),
  });
  for (const a of collected) {
    const x = toAlerte(a, (sid) => (sid ? clients.get(sid) ?? "oia" : "oia"));
    if (x) await db.alerter(x);
  }
  for (const id of sujets) await syncSubject(ctx, id, clients.get(id)!);
  // Remesure proposée dès qu'une exécution est déclarée après la dernière fenêtre close (aucune demande nécessaire).
  for (const id of sujets) {
    const s = await db.sujet(id);
    if (!s) continue;
    try {
      await proposeRemeasure(ctx, s);
    } catch (err) {
      await db.alerter({ client_id: s.client_id, subject_id: id, gravite: "bloquant", type: "ECHEC_DEMANDE", message: `remesure : ${msg(err)}` });
    }
  }
  return { lignes: r.lines, sujets };
}

/** Jours, preuves, statut, puis à la clôture pages et recommandations, écrits en base une fois. */
async function syncSubject(ctx: Ctx, subjectId: string, clientId: string): Promise<void> {
  const db = ctx.o.db;
  const dir = join(ctx.subjectsDir, subjectId);
  const b = loadSubject(dir);
  for (const w of b.measurement.windows.filter((x) => x.status !== "planned")) {
    const wdir = windowDir(ctx.dataDir, subjectId, w.id);
    const dbw = dbWindowId(subjectId, w.id);
    const base = join(wdir, "base");
    mkdirSync(base, { recursive: true });
    const sentFile = join(base, "preuves-envoyees.txt");
    const sent = new Set(existsSync(sentFile) ? readFileSync(sentFile, "utf8").split("\n").filter(Boolean) : []);
    const fresh = readEvidence(evidencePath(ctx.dataDir, subjectId, w.id)).filter((e) => e.collectorName === OIA_DIRECT_COLLECTOR && !sent.has(e.id));
    if (fresh.length) {
      await db.preuves(fresh.map((e) => toPreuve(e, clientId, dbw)));
      appendFileSync(sentFile, fresh.map((e) => `${e.id}\n`).join(""));
    }
    const jours = existsSync(join(wdir, "jours")) ? readdirSync(join(wdir, "jours")).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)) : [];
    for (const f of jours.sort()) {
      const rec = JSON.parse(readFileSync(join(wdir, "jours", f), "utf8")) as DayRecord;
      await db.consignerJour({ subject_id: subjectId, window_id: dbw, jour: rec.n, date: rec.day, etat: rec.state, detail: { prevus: rec.planned, collectes: rec.collected, echecs: rec.failed, cout_usd: rec.costUsd, apres_coup: rec.settledLate } });
    }
    if (w.status === "running" && jours.length && !existsSync(join(base, "en-cours.done"))) {
      await db.fenetre(subjectId, dbw, "en_cours", w.start ?? null);
      writeFileSync(join(base, "en-cours.done"), `${ctx.now.toISOString()}\n`);
    }
    if (w.status === "done" && existsSync(join(wdir, "close", "rapport-pret.done")) && !existsSync(join(base, "cloture.done"))) {
      await pushReport(ctx, { subject_id: subjectId }, dir, w.id);
      for (const rec of loadRecommendations(dir).filter((x) => x.windowId === w.id && x.decision.status === "pending")) await db.recommandation(subjectId, dbw, rec as unknown as Record<string, unknown>);
      await db.fenetre(subjectId, dbw, "close", null);
      writeFileSync(join(base, "cloture.done"), `${ctx.now.toISOString()}\n`);
    }
  }
}

// ---------------------------------------------------------------- ligne de commande

/** Hôte affiché dans le cockpit : un nom, jamais une adresse. */
export function engineHost(env: Record<string, string | undefined>): string {
  const h = (env.OIA_VIS_ENGINE_HOST ?? hostname()).toLowerCase().replace(/\.local$/, "").replace(/[^a-z0-9-]/g, "-");
  return /^\d+-\d+-\d+-\d+$/.test(h) ? "moteur" : h.slice(0, 63);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const env = process.env;
  const maxAt = args.indexOf("--max");
  (async () => {
    const dir = assertOutsideRepo(resolve(env.OIA_VIS_ENGINE_DIR ?? join(homedir(), "oia-visibility-data", "moteur")));
    const realFetch = globalThis.fetch as unknown as FetchLike;
    const recoModule = "../reco-generators.js";
    const generateRecommendations = await import(recoModule).then((m: { generateRecommendations?: GenerateRecommendations }) => m.generateRecommendations).catch(() => undefined);
    const r = await runEngine({
      db: new PsqlEngineDb(),
      dir,
      hote: engineHost(env),
      version: env.OIA_VIS_ENGINE_VERSION ?? "inconnue",
      env,
      quotidien: args.includes("--quotidien"),
      max: maxAt >= 0 ? Number(args[maxAt + 1]) : undefined,
      fetch: safePageFetcher,
      crawlie: DEFAULT_CRAWLIE_COMMAND,
      collector: () => createOiaDirectCollector({ fetch: realFetch, env }),
      judge: () => createJudge("jev", { fetch: realFetch, env }),
      generateRecommendations,
    });
    // Journal sans données client : identifiants de demande, types et états seulement (le détail est en base).
    const stamp = new Date().toISOString();
    process.stdout.write(`${stamp} passage : ${r.traitees.length} demande(s)${r.quotidien ? `, passage quotidien sur ${r.quotidien.sujets.length} sujet(s)` : ""}\n`);
    for (const t of r.traitees) process.stdout.write(`${stamp} ${t.id} ${t.type} ${t.statut}\n`);
    process.exit(r.traitees.some((t) => t.statut === "FAILED") ? 3 : 0);
  })().catch((err) => {
    process.stderr.write(`moteur : ${msg(err)}\n`);
    process.exit(1);
  });
}
