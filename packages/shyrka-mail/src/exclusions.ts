import type { EnteteMessage, Message } from "./types.js";

/**
 * Exclusions (mandat v6, B3 ; amendement, § 4). Elles s'appliquent AVANT
 * qu'un contenu n'atteigne un modèle, même local :
 *
 * - par domaine de l'expéditeur et des destinataires ;
 * - par mention d'un mot de la liste dans l'objet, le corps, les messages transférés et
 *   les noms de pièces jointes ;
 * - dans tous les en-têtes (Reply-To, Sender, Return-Path, Received…), pour
 *   déjouer un expéditeur falsifié.
 *
 * En cas de doute, le message est exclu. Un message exclu n'est jamais lu par
 * un modèle, classé ni résumé : seul son nombre est compté.
 *
 * La liste est décidée uniquement par Mickaël (décision du 7 novembre) : elle
 * est vide par défaut, sans aucun domaine prérempli, et se configure dans un
 * fichier hors du dépôt (chargerExclusions).
 */
export interface ConfigExclusions {
  /** Domaines exclus, sous-domaines compris. */
  domaines: string[];
  /** Mots qui excluent un message dès qu'ils apparaissent, où que ce soit. */
  mots: string[];
}

export const EXCLUSIONS_PAR_DEFAUT: ConfigExclusions = { domaines: [], mots: [] };

/**
 * Lit la liste de Mickaël : `{ "domaines": [...], "mots": [...] }`, dans un
 * fichier hors du dépôt. Fichier absent : liste vide. Fichier illisible ou mal
 * formé : erreur, pour ne jamais trier avec une liste que Mickaël n'a pas
 * voulue.
 */
export function chargerExclusions(contenu: string | null): ConfigExclusions {
  if (contenu === null) return EXCLUSIONS_PAR_DEFAUT;
  const j = JSON.parse(contenu) as { domaines?: unknown; mots?: unknown };
  const liste = (v: unknown, nom: string): string[] => {
    if (v === undefined) return [];
    if (!Array.isArray(v) || !v.every((x) => typeof x === "string" && x.trim() !== "")) throw new Error(`Liste d'exclusion : « ${nom} » doit être une liste de textes non vides.`);
    return v.map((x: string) => x.trim().toLowerCase());
  };
  return { domaines: liste(j.domaines, "domaines"), mots: liste(j.mots, "mots") };
}

const ADRESSE = /[^\s<>"',;:()]+@[^\s<>"',;:()]+/g;

function adresses(texte: string): string[] {
  return (texte.match(ADRESSE) ?? []).map((a) => a.toLowerCase().replace(/[.>]+$/, ""));
}

function domaineExclu(adresse: string, domaines: string[]): boolean {
  const d = adresse.split("@")[1] ?? "";
  return domaines.some((x) => d === x.toLowerCase() || d.endsWith(`.${x.toLowerCase()}`));
}

function contientMot(texte: string, mots: string[]): string | null {
  // Normalisation : accents retirés, séparateurs ignorés (« s.w.i.f.t », « S W I F T », « ｓｗｉｆｔ »).
  const plat = texte.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const compact = plat.replace(/[^a-z0-9]+/g, "");
  for (const m of mots) {
    const mm = m.toLowerCase();
    if (plat.includes(mm) || compact.includes(mm)) return m;
  }
  return null;
}

export type Verdict = { exclu: false } | { exclu: true; raison: string };

function verifierTexte(nom: string, texte: string, cfg: ConfigExclusions): Verdict {
  for (const a of adresses(texte)) if (domaineExclu(a, cfg.domaines)) return { exclu: true, raison: `${nom} : domaine exclu` };
  const mot = contientMot(texte, cfg.mots);
  if (mot) return { exclu: true, raison: `${nom} : mention exclue` };
  return { exclu: false };
}

/** Contrôle sur les seuls en-têtes, avant toute lecture du corps. */
export function verifierEntete(e: EnteteMessage, cfg: ConfigExclusions = EXCLUSIONS_PAR_DEFAUT): Verdict {
  // Doute : expéditeur absent ou illisible. Cette règle ne dépend pas de la liste.
  if (adresses(e.de).length === 0) return { exclu: true, raison: "expéditeur illisible (doute)" };
  const champs: [string, string][] = [
    ["expéditeur", e.de],
    ["destinataires", e.a.join(" ")],
    ["copie", e.cc.join(" ")],
    ["objet", e.objet],
    ["pièces jointes", e.piecesJointes.join(" ")],
    ...Object.entries(e.autresEntetes).map(([k, v]): [string, string] => [`en-tête ${k}`, v.join(" ")]),
  ];
  for (const [nom, texte] of champs) {
    const v = verifierTexte(nom, texte, cfg);
    if (v.exclu) return v;
  }
  return { exclu: false };
}

/** Contrôle complet : en-têtes, puis corps (messages transférés compris). */
export function verifierMessage(m: Message, cfg: ConfigExclusions = EXCLUSIONS_PAR_DEFAUT): Verdict {
  const v = verifierEntete(m, cfg);
  if (v.exclu) return v;
  return verifierTexte("corps", m.corps, cfg);
}
