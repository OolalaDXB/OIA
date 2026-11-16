/**
 * Ajouter un site en une commande (mandat v15, bloc A ; docs/industrialisation.md) :
 *
 *   site add <url> --client <id> --langues fr,en --marches FR,AE
 *            [--nom <marque>] [--nom-client <nom>] [--go[=faits|reconnaissance]] [--base]
 *
 *  1. adresse publique vérifiée (site-init.ts), en https ;
 *  2. sujet `draft` dans le DOSSIER PRIVÉ (OIA_VIS_SUBJECTS_DIR, défaut ~/oia-visibility-data/sujets,
 *     droits 700), jamais dans un dépôt Git : à la racine, des fichiers valides pour load.ts qui
 *     ne mesurent rien ; sous `proposition/`, tout ce qui attend une validation ;
 *  3. `proposition/base.sql` : client, site et sujet en ajout seul, appliqué seulement avec `--base` ;
 *  4. audit de lecture (Crawlie, pages sans JavaScript, indexation Bing et Google « indicatif ») ;
 *  5. faits extraits : déterministes sans GO ; par Mistral avec `--go` (coût affiché avant) ;
 *  6. panel proposé (panel-generator.ts), statut `proposed` ;
 *  7. journée de reconnaissance : plan et coût toujours, collecte seulement avec `--go` ; puis
 *     acteurs nommés dans les réponses (src/site/actors.ts) ;
 *  8. homonymes du nom de marque dans ces réponses (src/site/homonyms.ts).
 *
 * Sans `--go`, aucun appel payant. Relancée sur un sujet existant (`draft` seulement), la commande
 * garde les fichiers déjà écrits et ne fait que les étapes qui manquent, les étapes payantes
 * demandées, et l'extraction des acteurs (gratuite) dès que des réponses existent.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { createMistralProvider } from "../../../packages/providers/src/mistral.js";
import type { LLMProvider } from "../../../packages/providers/src/types.js";
import { monthSpendUsd, readCap } from "./collect-day.js";
import { createOiaDirectCollector } from "./collector-oia-direct.js";
import type { FetchLike } from "./collector-oia/http.js";
import type { Collector } from "./collector.js";
import { loadSubject } from "./load.js";
import { ConcurrentsSchema, FaitsSchema, HomonymesSchema } from "./proposition.js";
import { PanelSchema, type Panel } from "./schema.js";
import { assertPublicUrl, dryRunSiteInit } from "./site-init.js";
import { extractActors, renderActors } from "./site/actors.js";
import { auditSite, DEFAULT_CRAWLIE_COMMAND, renderAudit, type CrawlieCommand } from "./site/audit.js";
import { estimateLlmFacts, extractFactsDeterministic, extractFactsWithLlm, LLM_FACTS_MODEL, LLM_MAX_OUTPUT_TOKENS, type LlmCostEstimate } from "./site/facts.js";
import { auditFile, concurrentsFile, faitsFile, homonymesFile, metaFile } from "./site/formats.js";
import { findHomonyms, renderHomonyms } from "./site/homonyms.js";
import { readSite, safePageFetcher, type PageFetcher } from "./site/pages.js";
import { assertOutsideRepo, ensurePrivateDir, privateSubjectsDir } from "./site/paths.js";
import { buildDraft } from "./site/proposal.js";
import { planReconnaissance, readReconnaissanceAnswers, reconnaissanceBundle, runReconnaissance, type ReconnaissancePlan } from "./site/reconnaissance.js";
import { applyBaseSql, sqlBaseRows } from "./site/sql.js";
import { subjectTerms } from "./site/terms.js";

/** Langues pour lesquelles panel-generator.ts a des gabarits. */
export const PANEL_LANGUAGES = ["fr", "en"];

export interface SiteAddOptions {
  url: string;
  clientId: string;
  clientName?: string;
  /** Nom de marque ; par défaut, celui que donnent les pages (JSON-LD, og:site_name, titre). */
  name?: string;
  languages: string[];
  countries: string[];
  go: { faits: boolean; reconnaissance: boolean };
  subjectsDir: string;
  dataDir: string;
  fetch: PageFetcher;
  crawlie: CrawlieCommand;
  /** Fabriques des accès payants : jamais appelées sans le GO correspondant. */
  llm?: (maxCalls: number) => LLMProvider;
  collector?: () => Collector;
  env: Record<string, string | undefined>;
  now?: () => Date;
  allowedLocal?: string[];
  maxPages?: number;
  minReponses?: number;
  journalFile?: string;
  log?: (line: string) => void;
}

export interface SiteAddResult {
  subjectId: string;
  dir: string;
  created: boolean;
  written: string[];
  costs: { faitsMistral: LlmCostEstimate; reconnaissance: ReconnaissancePlan };
  paidCalls: { mistral: number; moteurs: number };
  actors: number;
  homonyms: number;
}

const ID = /^[a-z0-9][a-z0-9-]{1,62}$/;

function checkInputs(o: SiteAddOptions): URL {
  if (!ID.test(o.clientId)) throw new Error(`identifiant de client invalide « ${o.clientId} » (kebab-case, 2 à 63 caractères)`);
  if (!o.languages.length) throw new Error("--langues : au moins une langue");
  for (const l of o.languages) {
    if (!/^[a-z]{2}$/.test(l)) throw new Error(`langue invalide « ${l} » (ISO 639-1, minuscules)`);
    if (!PANEL_LANGUAGES.includes(l)) throw new Error(`langue « ${l} » : aucun gabarit de panel (panel-generator.ts : ${PANEL_LANGUAGES.join(", ")})`);
  }
  if (!o.countries.length) throw new Error("--marches : au moins un pays");
  for (const c of o.countries) if (!/^[A-Z]{2}$/.test(c)) throw new Error(`marché invalide « ${c} » (ISO 3166-1, majuscules)`);
  const url = assertPublicUrl(o.url, { allowedLocal: o.allowedLocal });
  if (url.protocol !== "https:") throw new Error(`adresse en https attendue : ${o.url}`);
  return url;
}

const yaml = (v: unknown) => stringify(v, { lineWidth: 0 });

export async function siteAdd(o: SiteAddOptions): Promise<SiteAddResult> {
  const now = o.now ?? (() => new Date());
  const log = o.log ?? (() => {});
  const today = now().toISOString().slice(0, 10);
  const url = checkInputs(o);
  const { subjectId } = dryRunSiteInit({ clientId: o.clientId, url: url.toString(), allowedLocal: o.allowedLocal, ownership: "external", languages: o.languages });
  if (!ID.test(subjectId)) throw new Error(`identifiant de sujet dérivé invalide « ${subjectId} »`);

  // Aucun chemin dans un dépôt : contrôlé avant toute lecture du site et toute écriture.
  const subjectsDir = assertOutsideRepo(o.subjectsDir);
  const dataDir = assertOutsideRepo(o.dataDir);
  const dir = join(subjectsDir, subjectId);
  assertOutsideRepo(dir);
  const existing = existsSync(join(dir, "subject.yaml"));
  if (existing) {
    const status = (parse(readFileSync(join(dir, "subject.yaml"), "utf8")) as { status?: string }).status;
    if (status !== "draft") throw new Error(`sujet ${subjectId} au statut « ${status} » : site add ne reprend qu'un sujet draft`);
  }

  log(`lecture de ${url.toString()} (sans JavaScript)…`);
  const read = await readSite(url.toString(), { fetch: o.fetch, maxPages: o.maxPages, allowedLocal: o.allowedLocal });
  const domain = url.hostname.replace(/^www\./, "");

  ensurePrivateDir(subjectsDir);
  ensurePrivateDir(dir);
  const prop = ensurePrivateDir(join(dir, "proposition"));
  const written: string[] = [];
  const write = (path: string, content: string) => {
    writeFileSync(path, content, { mode: 0o600 });
    written.push(path);
  };
  const writeOnce = (path: string, content: () => string) => {
    if (!existsSync(path)) write(path, content());
  };

  // Faits déterministes et ce que les pages disent du site.
  const det = extractFactsDeterministic(read.pages, { today, languages: o.languages });
  const brand = o.name?.trim() || det.findings.brandCandidates[0] || domain.split(".")[0]!;
  const fallbackOffers = [...read.home.h1, ...(read.home.title ?? "").split(/\s[|–—-]\s|\s·\s/).slice(1)].map((s) => s.trim()).filter((s) => s.length >= 3);
  const draft = await buildDraft({ subjectId, displayName: brand, primaryUrl: url.toString(), domain, languages: o.languages, countries: o.countries, findings: det.findings, sources: det.sources, fallbackOffers, today });

  if (!existing) {
    write(join(dir, "subject.yaml"), yaml(draft.subject));
    write(join(dir, "panel.yaml"), yaml(draft.waitingPanel));
    write(join(dir, "facts.yaml"), yaml(draft.facts));
    write(join(dir, "measurement.yaml"), yaml(draft.measurement));
  }
  const bundle = loadSubject(dir); // les fichiers de la racine restent valides pour load.ts
  writeOnce(join(prop, "panel.yaml"), () => yaml(draft.proposedPanel));
  writeOnce(join(prop, "meta.yaml"), () => yaml(metaFile({ subjectId, clientId: o.clientId, url: url.toString(), today })));
  writeOnce(join(prop, "faits.yaml"), () => yaml(faitsFile(det.facts, det.sources, today)));
  const proposedPanel: Panel = PanelSchema.parse(parse(readFileSync(join(prop, "panel.yaml"), "utf8")));
  write(join(prop, "base.sql"), sqlBaseRows({ subject: bundle.subject, clientId: o.clientId, clientName: o.clientName ?? o.clientId }));

  if (!existsSync(join(prop, "audit.json"))) {
    log("audit de lecture : Crawlie, pages, indexation…");
    const audit = await auditSite({ site: url.toString(), domain, read, fetch: o.fetch, crawlie: o.crawlie, crawlieOut: join(prop, "crawlie.json"), now });
    write(join(prop, "audit-lecture.json"), `${JSON.stringify(audit, null, 2)}\n`);
    write(join(prop, "audit.json"), `${JSON.stringify(auditFile(audit), null, 2)}\n`);
    write(join(prop, "audit.md"), renderAudit(audit));
  }

  // Coûts, affichés avant tout GO.
  const faitsMistral = estimateLlmFacts(read.pages);
  const reco = reconnaissanceBundle(dir, bundle.subject, bundle.measurement, proposedPanel, today);
  const planFile = join(prop, "reconnaissance.json");
  const previous = existsSync(planFile) ? (JSON.parse(readFileSync(planFile, "utf8")) as ReconnaissancePlan) : null;
  let plan = planReconnaissance(reco, today);
  if (!previous || previous.statut === "planifiee") write(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  log(`coût estimé, faits par Mistral : ${faitsMistral.calls} appel(s), au plus ${faitsMistral.usd.toFixed(4)} $ (${faitsMistral.basis})`);
  log(`coût estimé, journée de reconnaissance : ${plan.appels} appel(s) (${plan.questions.length} question(s) non marquée(s) × moteurs de leur langue), au plus ${plan.coutMajorantUsd.toFixed(4)} $`);
  for (const l of plan.lignes) log(`  ${l}`);

  const paidCalls = { mistral: 0, moteurs: 0 };
  if (o.go.faits || o.go.reconnaissance) {
    const cap = readCap(o.env);
    if (cap === null) throw new Error("plafond mensuel non posé ou illisible (OIA_VIS_MONTHLY_CAP_USD) : aucun appel payant");
    const month = today.slice(0, 7);
    const spent = monthSpendUsd(dataDir, month, o.journalFile ?? join(dataDir, "cost-journal.csv")).usd;
    const asked = (o.go.faits ? faitsMistral.usd : 0) + (o.go.reconnaissance ? plan.coutMajorantUsd : 0);
    if (spent + asked > cap) throw new Error(`plafond mensuel : ${spent.toFixed(4)} $ engagés + ${asked.toFixed(4)} $ au majorant > ${cap} $ ; aucun appel`);
  }

  if (o.go.faits) {
    if (!o.llm) throw new Error("--go faits : aucun fournisseur Mistral configuré");
    log(`GO : extraction des faits par Mistral (${faitsMistral.calls} appel(s))…`);
    const r = await extractFactsWithLlm(o.llm(faitsMistral.calls), read.pages, det.sources, { languages: o.languages, model: faitsMistral.model });
    paidCalls.mistral = r.calls;
    const current = FaitsSchema.parse(parse(readFileSync(join(prop, "faits.yaml"), "utf8"))).faits;
    // Faits déterministes et faits déjà tranchés gardés ; les faits Mistral encore « extrait » remplacés.
    const kept = current.filter((f) => !f.id.startsWith("m-") || f.statut !== "extrait");
    const fresh = faitsFile(r.facts, det.sources, today).faits.filter((f) => !kept.some((k) => k.id === f.id));
    write(join(prop, "faits.yaml"), yaml({ schemaVersion: 1, faits: [...kept, ...fresh] }));
    write(join(prop, "faits-mistral.json"), `${JSON.stringify({ le: now().toISOString(), modele: faitsMistral.model, appels: r.calls, jetonsEntree: r.inputTokens, jetonsSortie: r.outputTokens, estimation: faitsMistral }, null, 2)}\n`);
  }

  if (o.go.reconnaissance) {
    if (!o.collector) throw new Error("--go reconnaissance : aucun collecteur configuré");
    log(`GO : journée de reconnaissance (${plan.appels} appel(s))…`);
    const summary = await runReconnaissance({ bundle: reco, dataDir, collector: o.collector(), env: o.env, now, journalFile: o.journalFile, log });
    paidCalls.moteurs = summary.collected + summary.failed;
    plan = { ...plan, statut: summary.collected + summary.alreadyDone === summary.planned ? "collectee" : "partielle", resume: summary };
    write(planFile, `${JSON.stringify(plan, null, 2)}\n`);
  }

  // Acteurs et homonymes : gratuits, dès que des réponses de reconnaissance existent.
  const answers = readReconnaissanceAnswers(dataDir, subjectId);
  let actors = 0;
  let homonyms = 0;
  if (answers.length) {
    const d = subjectTerms(bundle.subject);
    const a = extractActors(answers, { brandTerms: d.brandTerms, places: d.places, minReponses: o.minReponses, now });
    write(join(prop, "acteurs.json"), `${JSON.stringify(a, null, 2)}\n`);
    write(join(prop, "acteurs.md"), renderActors(a));
    const concurrents = concurrentsFile(a).concurrents;
    const before = existsSync(join(prop, "concurrents.yaml")) ? ConcurrentsSchema.parse(parse(readFileSync(join(prop, "concurrents.yaml"), "utf8"))).concurrents : [];
    write(join(prop, "concurrents.yaml"), yaml({ schemaVersion: 1, concurrents: keepDecided(before, concurrents) }));
    const h = findHomonyms(answers, { brand: bundle.subject.displayName, aliases: d.nameAliases, domains: d.domains, places: d.places, now });
    write(join(prop, "homonymes.json"), `${JSON.stringify(h, null, 2)}\n`);
    write(join(prop, "homonymes.md"), renderHomonyms(h));
    const hBefore = existsSync(join(prop, "homonymes.yaml")) ? HomonymesSchema.parse(parse(readFileSync(join(prop, "homonymes.yaml"), "utf8"))).homonymes : [];
    write(join(prop, "homonymes.yaml"), yaml({ schemaVersion: 1, homonymes: keepDecided(hBefore, homonymesFile(h).homonymes) }));
    actors = a.acteurs.length;
    homonyms = h.homonymes.length;
  }

  return { subjectId, dir, created: !existing, written, costs: { faitsMistral, reconnaissance: plan }, paidCalls, actors, homonyms };
}

/** Ce qu'un humain a tranché (valide, rejete) n'est jamais réécrit ; le reste prend la nouvelle extraction. */
function keepDecided<T extends { id: string; statut: string }>(before: T[], fresh: T[]): T[] {
  const decided = before.filter((x) => x.statut !== "extrait");
  const ids = new Set(decided.map((x) => x.id));
  return [...decided, ...fresh.filter((x) => !ids.has(x.id))];
}

export interface ParsedArgs {
  url: string;
  clientId: string;
  clientName?: string;
  name?: string;
  languages: string[];
  countries: string[];
  go: { faits: boolean; reconnaissance: boolean };
  base: boolean;
}

export const USAGE = "usage: site add <url> --client <id> --langues fr,en --marches FR,AE [--nom <marque>] [--nom-client <nom>] [--go[=faits|reconnaissance]] [--base]";

export function parseArgs(argv: string[]): ParsedArgs {
  const args = argv[0] === "add" ? argv.slice(1) : [...argv];
  const out: Partial<ParsedArgs> & { go: ParsedArgs["go"]; base: boolean } = { go: { faits: false, reconnaissance: false }, base: false };
  const positional: string[] = [];
  const value = (i: number, flag: string) => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith("--")) throw new Error(`${flag} : valeur attendue (${USAGE})`);
    return v;
  };
  const list = (v: string) => v.split(",").map((x) => x.trim()).filter(Boolean);
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a === "--client") out.clientId = value(i++, a);
    else if (a === "--nom-client") out.clientName = value(i++, a);
    else if (a === "--nom") out.name = value(i++, a);
    else if (a === "--langues") out.languages = list(value(i++, a));
    else if (a === "--marches") out.countries = list(value(i++, a));
    else if (a === "--go") out.go = { faits: true, reconnaissance: true };
    else if (a === "--go=faits") out.go.faits = true;
    else if (a === "--go=reconnaissance") out.go.reconnaissance = true;
    else if (a === "--base") out.base = true;
    else if (a.startsWith("--")) throw new Error(`option inconnue « ${a} » (${USAGE})`);
    else positional.push(a);
  }
  if (positional.length !== 1 || !out.clientId || !out.languages || !out.countries) throw new Error(USAGE);
  return { url: positional[0]!, clientId: out.clientId, clientName: out.clientName, name: out.name, languages: out.languages, countries: out.countries, go: out.go, base: out.base };
}

// Accès réels de la commande ; les tests passent leurs propres fabriques.
function createMistral(o: { apiKey: string; maxCalls: number }): LLMProvider {
  return createMistralProvider({ apiKey: o.apiKey, model: LLM_FACTS_MODEL, maxCalls: o.maxCalls, maxOutputTokens: LLM_MAX_OUTPUT_TOKENS });
}

function createCollector(env: Record<string, string | undefined>): Collector {
  return createOiaDirectCollector({ fetch: globalThis.fetch as unknown as FetchLike, env });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  (async () => {
    const a = parseArgs(process.argv.slice(2));
    const env = process.env;
    const dataDir = resolve(env.OIA_VIS_DATA ?? join(homedir(), "oia-visibility-data"));
    const r = await siteAdd({
      ...a,
      subjectsDir: privateSubjectsDir(env),
      dataDir,
      fetch: safePageFetcher,
      crawlie: DEFAULT_CRAWLIE_COMMAND,
      // Accès payants : construits seulement sur GO, clés lues dans l'environnement du processus.
      llm: (maxCalls) => {
        const apiKey = env.MISTRAL_API_KEY;
        if (!apiKey) throw new Error("clé absente de l'environnement : MISTRAL_API_KEY");
        return createMistral({ apiKey, maxCalls });
      },
      collector: () => createCollector(env),
      env,
      journalFile: env.OIA_VIS_COST_JOURNAL,
      log: (l) => process.stdout.write(`${l}\n`),
    });
    process.stdout.write(`sujet ${r.subjectId} (${r.created ? "créé" : "repris"}) : ${r.dir}\n`);
    process.stdout.write(`  ${r.written.length} fichier(s) écrit(s) ; acteurs proposés : ${r.actors} ; homonymes signalés : ${r.homonyms}\n`);
    if (!a.go.faits && !a.go.reconnaissance) process.stdout.write("Aucun appel payant. --go=faits (Mistral), --go=reconnaissance (moteurs) ou --go (les deux) pour lancer, après lecture des coûts ci-dessus.\n");
    if (a.base) {
      process.stdout.write("--base : application de proposition/base.sql (ajout seul)…\n");
      await applyBaseSql(readFileSync(join(r.dir, "proposition", "base.sql"), "utf8"), env);
      process.stdout.write("base : lignes client, site et sujet présentes.\n");
    } else process.stdout.write(`Base inchangée : proposition/base.sql s'applique avec --base.\n`);
  })().catch((err) => {
    process.stderr.write(`site add : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}

