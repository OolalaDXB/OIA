import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Contrat commun de la mémoire de Shyrka (ADR 0004, § 2, validée le
 * 2026-11-08). Une seule interface, deux stockages : le Mac (SQLite dans le
 * volume chiffré, infra/shyrka) et le cockpit (base OIA, `shy_contexte`).
 *
 * Ce fichier ne dépend d'aucun stockage ni d'aucun runtime particulier : il
 * se charge aussi bien sous Node que dans une fonction Deno.
 */

export const FORMES = ["preference", "decision", "travail", "experience"] as const;
export type Forme = (typeof FORMES)[number];

/** Voies d'apprentissage (ADR § 4). */
export const VOIES = ["instruction", "proposition", "observation"] as const;
export type Voie = (typeof VOIES)[number];

export const STATUTS_MEMOIRE = ["a_confirmer", "valide", "observe", "retire"] as const;
export type StatutMemoire = (typeof STATUTS_MEMOIRE)[number];

export type Emplacement = "mac" | "cockpit";
export type PorteeMemoire = "local_seulement" | "cockpit";

/** `personnel`, `projet:<slug>`, `module:<nom>` ou `souffleur`. */
export const CompartimentSchema = z
  .string()
  .regex(/^(personnel|souffleur|projet:[a-z0-9][a-z0-9-]{0,40}|module:[a-z0-9][a-z0-9-]{0,40})$/, "compartiment inconnu");
export type Compartiment = z.infer<typeof CompartimentSchema>;

export interface SourceMemoire {
  voie: Voie;
  /** Référence précise : « conversation 2026-11-08T22:14Z », « fichier:ligne », « outil#exécution ». */
  ref: string;
  /** Vrai quand l'énoncé vient d'un modèle : jamais une preuve (ADR § 4). */
  affirmeParIA?: boolean;
}

export interface ElementMemoire {
  /** UUID stable, le même pour toutes les versions d'un élément. */
  id: string;
  compartiment: Compartiment;
  forme: Forme;
  /** L'énoncé, en une phrase ou un court paragraphe. */
  contenu: string;
  /** Champs propres à la forme (raisons, options écartées, prochaine action…). */
  details: Record<string, string>;
  source: SourceMemoire;
  /** Quand le fait a été dit ou observé. */
  date: string;
  /** Quand Mickaël l'a confirmé (null tant que non confirmé). */
  valideLe: string | null;
  statut: StatutMemoire;
  emplacement: Emplacement;
  portee: PorteeMemoire;
  version: number;
  /** Version précédente remplacée (numéro), null pour la première. */
  remplace: number | null;
  /** Identifiants des éléments d'où vient un résumé dérivé. */
  deriveDe: string[];
  /** Restrictions de diffusion supplémentaires, héritées par les dérivés. */
  restrictions: string[];
}

export const NouvelElementSchema = z
  .object({
    compartiment: CompartimentSchema,
    forme: z.enum(FORMES),
    contenu: z.string().trim().min(1).max(2000),
    details: z.record(z.string().max(2000)).default({}),
    source: z.object({ voie: z.enum(VOIES), ref: z.string().min(1).max(300), affirmeParIA: z.boolean().optional() }).strict(),
    date: z.string().datetime().optional(),
    portee: z.enum(["local_seulement", "cockpit"]).default("local_seulement"),
    deriveDe: z.array(z.string().uuid()).max(50).default([]),
    restrictions: z.array(z.string().regex(/^[a-z0-9_:-]{1,60}$/)).max(20).default([]),
  })
  .strict();
export type NouvelElement = z.input<typeof NouvelElementSchema>;

export const ChangementSchema = z
  .object({
    contenu: z.string().trim().min(1).max(2000).optional(),
    details: z.record(z.string().max(2000)).optional(),
    compartiment: CompartimentSchema.optional(),
    forme: z.enum(FORMES).optional(),
    /** Changement de portée : seulement par Mickaël (ADR § 2). */
    portee: z.enum(["local_seulement", "cockpit"]).optional(),
    /** Confirmation d'une proposition (voie 2) : seulement par Mickaël. */
    valider: z.boolean().optional(),
  })
  .strict()
  .refine((c) => Object.keys(c).length > 0, { message: "aucun changement" });
export type Changement = z.input<typeof ChangementSchema>;

/** Qui agit sur la mémoire. Seul Mickaël valide, corrige la portée, retire ou oublie. */
export type Acteur = { type: "mickael"; via: string } | { type: "shyrka" } | { type: "agent"; id: string } | { type: "outil"; id: string };

/**
 * Pour qui on cherche. Les droits sont appliqués par le code avant la
 * recherche et avant l'assemblage d'un prompt, jamais par le modèle.
 */
export type Demandeur =
  | { type: "mickael" }
  /** Conversation locale ; `modele` dit où partira ce qui est rendu. */
  | { type: "conversation"; modele: "local" | "en_ligne" | "aucun" }
  | { type: "cockpit" }
  | { type: "agent"; id: string; compartiments: Compartiment[] };

export interface Requete {
  texte?: string;
  compartiment?: Compartiment | `projet:*`;
  statuts?: StatutMemoire[];
  formes?: Forme[];
  limite?: number;
  /** Décalage de pagination. */
  apres?: number;
}

export interface Resultat {
  element: ElementMemoire;
  /** Provenance lisible : voie, référence, date, version. */
  provenance: string;
  /** Extrait mis en évidence, issu de la version actuelle. */
  extrait: string;
}

export interface ExportMemoire {
  format: "shyrka.memoire.export";
  version: 1;
  exporteLe: string;
  elements: ElementMemoire[];
  /** Empreintes d'oubli (jamais le contenu). */
  oublis: string[];
}

export interface Memoire {
  enregistrer(element: NouvelElement, par: Acteur): ElementMemoire;
  retrouver(requete: Requete, pour: Demandeur): Resultat[];
  corriger(id: string, changement: Changement, par: Acteur): ElementMemoire;
  /** N'est plus servi, reste visible de Mickaël. */
  retirer(id: string, motif: string, par: Acteur): void;
  /** L'élément, ses dérivés de proche en proche, leurs index. */
  oublier(id: string, par: Acteur): { oublies: number };
  exporter(par: Acteur): ExportMemoire;
}

export class RefusMemoire extends Error {
  constructor(
    message: string,
    readonly code:
      | "valeur_refusee"
      | "exclu"
      | "oublie"
      | "introuvable"
      | "ambigu"
      | "non_autorise"
      | "mode_prive"
      | "stockage_indisponible"
      | "stockage_corrompu"
      | "doublon",
  ) {
    super(message);
  }
}

/** Minuscules, sans accents, espaces simples : base des empreintes d'oubli. */
export function normaliserTexte(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

/** Empreinte de contenu : compartiment + énoncé normalisé. Sert au registre des oublis. */
export const empreinteContenu = (compartiment: string, contenu: string) => sha256(`contenu\n${compartiment}\n${normaliserTexte(contenu)}`);
export const empreinteId = (id: string) => sha256(`id\n${id}`);

/**
 * Exclusions à l'entrée, quelle que soit la voie (ADR § 6, corpus-inventaire) :
 * Swift et ses clients, secrets. Ces filtres sont un garde-fou complémentaire,
 * pas une preuve d'absence de secret.
 */
const EXCLUSIONS: [RegExp, string][] = [
  [/\bswift\b/i, "Swift et ses clients sont exclus de la mémoire"],
  [/\b(sk|pk|rk)[-_](live|test|proj|ant)[-_][A-Za-z0-9_-]{8,}/, "ressemble à une clé d'API"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./, "ressemble à un jeton JWT"],
  [/\b(gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/, "ressemble à un jeton GitHub"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "clé privée"],
  [/\b(mot de passe|password|passwd|api[_ -]?key|secret)\s*[:=]\s*\S{4,}/i, "ressemble à un secret"],
  [/\b(?:\d[ -]?){13,19}\b/, "ressemble à un numéro de carte"],
];

export function motifExclusion(texte: string): string | null {
  for (const [re, motif] of EXCLUSIONS) if (re.test(texte)) return motif;
  return null;
}

/**
 * Droits de lecture, appliqués par le noyau (ADR § 6) :
 * - Mickaël lit tout ce qui n'est pas oublié, retiré compris ;
 * - un élément `local_seulement` n'est rendu qu'à une conversation dont le
 *   modèle est local (ou sans modèle) ; jamais au cockpit, à un agent, ni à
 *   un message destiné à un modèle en ligne ;
 * - un agent ne lit que les compartiments de son mandat, en portée cockpit ;
 * - une restriction `mickael_seulement` (faits très privés) réserve l'élément
 *   à Mickaël et à Shyrka locale avec son modèle local (décision de Mickaël,
 *   8 novembre 2026) : jamais un modèle en ligne, un agent ni le cockpit.
 * Un dérivé n'est visible que si toutes ses sources le sont.
 */
export function peutLire(e: Pick<ElementMemoire, "statut" | "portee" | "compartiment" | "restrictions">, pour: Demandeur): boolean {
  if (pour.type === "mickael") return true;
  if (e.statut === "retire") return false;
  if (e.restrictions.includes("mickael_seulement")) return pour.type === "conversation" && pour.modele !== "en_ligne";
  switch (pour.type) {
    case "conversation":
      return e.portee === "cockpit" || pour.modele !== "en_ligne";
    case "cockpit":
      return e.portee === "cockpit";
    case "agent":
      return e.portee === "cockpit" && pour.compartiments.includes(e.compartiment);
  }
}

/** Provenance lisible d'un élément. */
export function provenance(e: ElementMemoire): string {
  const voie = { instruction: "dit par Mickaël", proposition: "proposition à confirmer", observation: "observé par un outil" }[e.source.voie];
  const ia = e.source.affirmeParIA ? ", affirmé par une IA, non vérifié" : "";
  return `${voie}${ia} · ${e.source.ref} · le ${e.date.slice(0, 10)} · v${e.version}`;
}

/** Libellé court d'affichage : 8 premiers caractères de l'UUID. Jamais une clé persistante. */
export const refCourte = (id: string) => id.slice(0, 8);
