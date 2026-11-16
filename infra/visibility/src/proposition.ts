/**
 * Propositions d'un sujet et journal des validations (mandat v15, bloc B).
 *
 * Dossier privé des sujets (docs/industrialisation.md, §1) : `OIA_VIS_SUBJECTS_DIR`,
 * à défaut `~/oia-visibility-data/sujets/`. Jamais sous le dépôt, sauf les fixtures
 * de test. Pour un sujet `<id>` :
 *
 *   <id>/subject.yaml, panel.yaml, facts.yaml, measurement.yaml, recommendations.yaml
 *                       les fichiers lus par load.ts (seulement ce qui est validé)
 *   <id>/proposition/   ce qui attend une validation (écrit par `site add`, bloc A) :
 *     meta.yaml         client, site, adresse, date de la proposition (MetaSchema)
 *     panel.yaml        panel proposé, au format de PanelSchema (status draft,
 *                       questions `proposed`)
 *     concurrents.yaml  concurrents proposés (ConcurrentsSchema)
 *     faits.yaml        faits extraits des pages publiques, chacun avec sa page (FaitsSchema)
 *     homonymes.yaml    homonymes du nom de marque trouvés dans les réponses (HomonymesSchema)
 *     audit.json        audit de lecture (AuditSchema)
 *     revue.html        page de revue (site-review.ts)
 *   <id>/journal.jsonl  validations et déclarations, en ajout seul (JournalEntry)
 *   <id>/base/          SQL proposé pour la base, jamais appliqué par ces commandes
 *
 * Dossier privé et refus du dépôt : src/site/paths.ts (bloc A).
 *
 * Statuts d'une proposition : `extrait` (machine) ; seul un humain le passe à `valide`
 * ou `rejete`, avec `par` et `le`.
 *
 * Format minimal, défini ici en attendant les écrivains du bloc A (src/site/) : le
 * chef d'équipe aligne les deux côtés sur ces schémas.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";
import { checkBundle } from "./load.js";
import { FactSchema, PanelSchema, type Measurement, type Panel, type Subject } from "./schema.js";
import { resolveHumanValidator, type HumanIdentity } from "./panel-generator.js";
import { assertOutsideRepo, privateSubjectsDir } from "./site/paths.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "AAAA-MM-JJ attendu");
const slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
const domain = z.string().regex(/^(?!https?:)[a-z0-9.-]+\.[a-z]{2,}$/, "domaine nu, en minuscules");

export const StatutProposition = z.enum(["extrait", "valide", "rejete"]);
export type StatutProposition = z.infer<typeof StatutProposition>;

/** Qui a tranché, et quand : obligatoire dès que le statut n'est plus `extrait`. */
const tranche = { par: z.string().min(2).optional(), le: isoDate.optional() };
const trancheOk = (x: { statut: StatutProposition; par?: string; le?: string }) => x.statut === "extrait" || Boolean(x.par && x.le);
const trancheMsg = "statut valide ou rejete sans par / le";

export const MetaSchema = z
  .object({
    schemaVersion: z.literal(1),
    subjectId: slug,
    clientId: slug,
    siteId: slug.optional(),
    url: z.string().url(),
    proposeLe: isoDate,
  })
  .strict();

export const FaitProposeSchema = z
  .object({
    id: slug,
    statement: z.string().min(5),
    language: z.string().regex(/^[a-z]{2}$/),
    category: FactSchema.shape.category,
    /** Page publique d'où le fait est extrait. */
    sourceUrl: z.string().url().refine((u) => u.startsWith("https://"), "adresse https attendue"),
    extraitLe: isoDate,
    statut: StatutProposition,
    ...tranche,
    note: z.string().optional(),
  })
  .strict()
  .refine(trancheOk, trancheMsg);
export const FaitsSchema = z.object({ schemaVersion: z.literal(1), faits: z.array(FaitProposeSchema) }).strict();

export const ConcurrentProposeSchema = z
  .object({
    id: slug,
    name: z.string().min(2),
    /** Classement de l'acteur nommé par les IA (leçon de la reconnaissance, bloc A). */
    type: z.enum(["personne", "structure", "plateforme"]),
    domains: z.array(domain).default([]),
    aliases: z.array(z.string()).default([]),
    category: z.string().min(2),
    markets: z.array(z.string().regex(/^[A-Z]{2}$/)).default([]),
    /** Réponses de la journée de reconnaissance qui le citent. */
    citations: z.number().int().min(0),
    rationale: z.string().min(5),
    statut: StatutProposition,
    ...tranche,
  })
  .strict()
  .refine(trancheOk, trancheMsg);
export const ConcurrentsSchema = z.object({ schemaVersion: z.literal(1), concurrents: z.array(ConcurrentProposeSchema) }).strict();

export const HomonymeSchema = z
  .object({
    id: slug,
    value: z.string().min(2),
    citations: z.number().int().min(0),
    /** Ce que désigne l'homonyme dans les réponses (autre entreprise, lieu, personne…). */
    contexte: z.string().optional(),
    statut: StatutProposition,
    ...tranche,
  })
  .strict()
  .refine(trancheOk, trancheMsg);
export const HomonymesSchema = z.object({ schemaVersion: z.literal(1), homonymes: z.array(HomonymeSchema) }).strict();

export const AuditSchema = z
  .object({
    schemaVersion: z.literal(1),
    url: z.string().url(),
    faitLe: isoDate,
    constats: z.array(
      z
        .object({
          /** Contrôle : pages, prix-sans-js, donnees-structurees, robots, index-bing, index-google… */
          code: z.string().min(2),
          niveau: z.enum(["ok", "attention", "bloquant"]),
          texte: z.string().min(3),
          preuve: z.string().optional(),
        })
        .strict(),
    ),
  })
  .strict();

export type Meta = z.infer<typeof MetaSchema>;
export type FaitPropose = z.infer<typeof FaitProposeSchema>;
export type ConcurrentPropose = z.infer<typeof ConcurrentProposeSchema>;
export type Homonyme = z.infer<typeof HomonymeSchema>;
export type Audit = z.infer<typeof AuditSchema>;

export interface Propositions {
  meta: Meta | null;
  panel: Panel | null;
  concurrents: ConcurrentPropose[] | null;
  faits: FaitPropose[] | null;
  homonymes: Homonyme[] | null;
  audit: Audit | null;
}

type Schema<T> = { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } };
function lire<T>(path: string, schema: Schema<T>): T | null {
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const r = schema.safeParse(path.endsWith(".json") ? JSON.parse(text) : parse(text));
  if (!r.success) throw new Error(`${path} invalide : ${r.error.message}`);
  return r.data;
}

/** Lit `proposition/` ; un fichier absent rend `null` (pas encore proposé), un fichier invalide lève. */
export function lirePropositions(subjectDir: string): Propositions {
  const p = (f: string) => join(subjectDir, "proposition", f);
  return {
    meta: lire(p("meta.yaml"), MetaSchema),
    panel: lire(p("panel.yaml"), PanelSchema),
    concurrents: lire(p("concurrents.yaml"), ConcurrentsSchema)?.concurrents ?? null,
    faits: lire(p("faits.yaml"), FaitsSchema)?.faits ?? null,
    homonymes: lire(p("homonymes.yaml"), HomonymesSchema)?.homonymes ?? null,
    audit: lire(p("audit.json"), AuditSchema),
  };
}

/**
 * Contrôles du panel proposé, ceux de load.ts (checkBundle) : marque présente dans les
 * questions marquées, absente des autres, limites par langue. Les questions `proposed`
 * comptent comme actives, puisque la validation les active.
 */
export function controlePanel(subject: Subject, panel: Panel): string[] {
  const actif: Panel = { ...panel, prompts: panel.prompts.map((p) => (p.status === "proposed" ? { ...p, status: "active" as const } : p)) };
  const measurement: Measurement = {
    schemaVersion: 1,
    engines: [{ model: "controle", collection: "api", webSearch: true }],
    windows: [{ id: "controle", kind: "baseline", days: 1, panelVersion: actif.panelVersion, status: "planned", missingDays: [] }],
    freezes: [],
  };
  return checkBundle({ dir: subject.id, subject, panel: actif, facts: { schemaVersion: 1, facts: [] }, measurement });
}

// ------------------------------------------------------------------
// Dossier privé
// ------------------------------------------------------------------

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

/** Dossier privé et refus d'écrire sous un dépôt : ceux du bloc A (src/site/paths.ts). */
export { assertOutsideRepo, privateSubjectsDir };

/** Dossier d'un sujet du dossier privé (il doit contenir subject.yaml). */
export function subjectDirOf(root: string, subjectId: string): string {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(subjectId)) throw new Error(`identifiant de sujet invalide : « ${subjectId} »`);
  const dir = join(root, subjectId);
  if (!existsSync(join(dir, "subject.yaml"))) throw new Error(`aucun sujet « ${subjectId} » dans ${root} (subject.yaml absent)`);
  return dir;
}

/** Sujets du dossier privé : tout dossier qui contient subject.yaml ou proposition/meta.yaml. */
export function listPrivateSubjects(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .sort()
    .map((n) => join(root, n))
    .filter((p) => statSync(p).isDirectory() && (existsSync(join(p, "subject.yaml")) || existsSync(join(p, "proposition", "meta.yaml"))));
}

/** Écrit un fichier par renommage (jamais à moitié écrit), droits 600. */
export function ecrireFichier(path: string, content: string): void {
  assertOutsideRepo(path);
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, content, { mode: 0o600 });
  renameSync(tmp, path);
}

// ------------------------------------------------------------------
// Humains
// ------------------------------------------------------------------

/**
 * humans.yaml : OIA_VIS_HUMANS, sinon à côté du dossier des sujets (comme `cli.ts panel
 * validate`), sinon celui du dépôt.
 */
export function humansFileFor(subjectsRoot: string, env: NodeJS.ProcessEnv = process.env): string {
  if (env.OIA_VIS_HUMANS) return resolve(env.OIA_VIS_HUMANS);
  const beside = join(dirname(subjectsRoot), "humans.yaml");
  return existsSync(beside) ? beside : join(REPO_ROOT, "infra", "visibility", "humans.yaml");
}

export function readHumans(file: string): HumanIdentity[] {
  if (!existsSync(file)) throw new Error(`humans.yaml absent : ${file}`);
  return (parse(readFileSync(file, "utf8")) as { humans?: HumanIdentity[] } | null)?.humans ?? [];
}

/** Valideur : un humain de humans.yaml, rôle owner, jamais un exécuteur d'agent (resolveHumanValidator). */
export function valideur(humans: HumanIdentity[], par: string | undefined, env: NodeJS.ProcessEnv = process.env): HumanIdentity {
  if (!par) throw new Error("--par <identité> obligatoire (une identité de humans.yaml)");
  return resolveHumanValidator(humans, { OIA_SEO_HUMAN_IDENTITY: par, OIA_SEO_IS_AGENT: env.OIA_SEO_IS_AGENT });
}

// ------------------------------------------------------------------
// Journal
// ------------------------------------------------------------------

export interface JournalEntry {
  /** Horodatage ISO de l'opération. */
  le: string;
  par: string;
  sujet: string;
  /** Une commande = une opération ; une ligne par objet. */
  operation: string;
  action: "valider" | "rejeter" | "executer";
  objet: "panel" | "concurrent" | "fait" | "recommandation";
  objetId: string;
  /** Statut avant et après. */
  avant: string;
  apres: string;
  /** Fichier du sujet modifié. */
  fichier: string;
  detail?: Record<string, string>;
}

export function appendJournal(subjectDir: string, entries: JournalEntry[]): void {
  if (!entries.length) return;
  const p = join(subjectDir, "journal.jsonl");
  assertOutsideRepo(p);
  appendFileSync(p, entries.map((e) => `${JSON.stringify(e)}\n`).join(""), { mode: 0o600 });
}

export function readJournal(subjectDir: string): JournalEntry[] {
  const p = join(subjectDir, "journal.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as JournalEntry);
}

/**
 * Arguments des commandes v15 : positionnels, puis `--nom valeur` ou `--drapeau`. Une option
 * inconnue est refusée (jamais ignorée en silence).
 */
export function lireArguments(
  args: string[],
  connues: { valeurs: string[]; drapeaux: string[]; optionnelles?: string[] },
): { positionnels: string[]; options: Record<string, string | true> } {
  const positionnels: string[] = [];
  const options: Record<string, string | true> = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (!a.startsWith("--")) {
      positionnels.push(a);
      continue;
    }
    const nom = a.slice(2);
    const suivant = args[i + 1];
    if (connues.drapeaux.includes(nom)) options[nom] = true;
    else if (connues.optionnelles?.includes(nom)) {
      // Valeur facultative : `--concurrents` seul, ou `--concurrents a,b`.
      if (suivant !== undefined && !suivant.startsWith("--")) options[nom] = args[++i]!;
      else options[nom] = true;
    } else if (connues.valeurs.includes(nom)) {
      if (suivant === undefined || suivant.startsWith("--")) throw new Error(`--${nom} attend une valeur`);
      options[nom] = args[++i]!;
    } else throw new Error(`option inconnue : ${a}`);
  }
  return { positionnels, options };
}

/** Échappe une valeur pour un littéral SQL. */
export const q = (v: string | number | null | undefined): string =>
  v === null || v === undefined ? "null" : typeof v === "number" ? String(v) : `'${v.replace(/'/g, "''")}'`;
