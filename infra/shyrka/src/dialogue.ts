import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";
import { etatOia, lectureAutorisee, lire, listeDesDecisions, resumeDuJour, type Decision, type EtatOia } from "./contexte.js";
import { RACINE_DEPOT } from "./local.js";

/**
 * Dialogue de Shyrka 1, géré par le code et non par le modèle (correctif du
 * premier essai réel : Shyrka reposait « Veux-tu que je te présente le
 * cadre ? » malgré plusieurs « oui »).
 *
 * - Une offre faite par Shyrka (présenter, résumer, expliquer, lister) est
 *   enregistrée ; un accord à la réplique suivante l'exécute directement.
 * - Une même question n'est jamais reposée deux fois de suite.
 * - Un document se lit réellement, par la liste blanche ; hors de la liste,
 *   Shyrka le dit, sans prétendre l'avoir lu.
 *
 * Toutes les opérations sont des lectures. Aucune n'écrit, n'envoie ni ne
 * publie quoi que ce soit.
 */

export type TypeOperation = "presenter" | "resumer" | "expliquer" | "lister";

/** Ce que Shyrka sait lire : clés connues, chacune adossée à un fichier de la liste blanche. */
export type Sujet = "cadre" | "roadmap" | "decisions" | "rapports" | "jour";

export interface Operation {
  type: TypeOperation;
  sujet: Sujet;
}

export interface Offre extends Operation {
  question: string;
}

export const FICHIERS: Record<Exclude<Sujet, "jour" | "rapports">, string> = {
  cadre: "docs/shyrka/CADRE.md",
  roadmap: "docs/roadmap-oia-shyrka-souffleur.md",
  decisions: "docs/roadmap-oia-shyrka-souffleur.md",
};

/** Ce que Shyrka dit pouvoir lire, quand on lui demande autre chose. */
export const LECTURES_POSSIBLES = "le cadre (docs/shyrka/CADRE.md), la roadmap et ses décisions ouvertes, la liste des rapports, l'état des fenêtres de mesure et le budget";

/** Minuscules, sans accents ni ponctuation, espaces simples. */
export function normaliser(t: string): string {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9/._ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const ACCORDS = [
  "oui", "ouais", "ouai", "ok", "okay", "d accord", "dac", "vas y", "vas-y", "va y", "go", "allez", "allez y", "bien sur", "volontiers",
  "avec plaisir", "c est parti", "parfait", "carrement", "tout a fait", "absolument", "yes", "fais le", "fais-le", "je veux bien", "oui merci",
];
const POLITESSE = /\b(s il te plait|s il vous plait|stp|merci|shyrka|vas y|vas-y|go|allez|oui|ok|d accord)\b/g;

/** Vrai si la réplique est un accord bref (« oui », « ok », « vas-y », « d'accord », « go »…). */
export function estAccord(texte: string): boolean {
  const n = normaliser(texte).replace(/[.!]/g, "").trim();
  if (!n || n.split(" ").length > 6) return false;
  if (/\b(non|pas|jamais|plus tard|attends|stop)\b/.test(n)) return false;
  if (ACCORDS.includes(n)) return true;
  // « oui vas-y », « ok merci Shyrka », « d'accord, go » : seulement des mots d'accord et de politesse.
  return ACCORDS.some((a) => n.startsWith(`${a} `)) && n.replace(POLITESSE, "").replace(/[ ,]/g, "") === "";
}

/** Vrai si la réplique décline (« non », « pas maintenant », « plus tard »). */
export function estRefus(texte: string): boolean {
  const n = normaliser(texte);
  return /^(non|nan|pas maintenant|plus tard|non merci|laisse tomber|stop)\b/.test(n);
}

const VERBES: [RegExp, TypeOperation][] = [
  [/\b(presente|presenter|presentes|presentation)\b/, "presenter"],
  [/\b(resume|resumer|resumes|synthese|synthetise)\b/, "resumer"],
  [/\b(explique|expliquer|expliques)\b/, "expliquer"],
  [/\b(liste|lister|listes|enumere|donne la liste)\b/, "lister"],
  [/\b(lis|lire|lise|montre|montrer|ouvre|affiche)\b/, "presenter"],
];

function typeDe(n: string): TypeOperation | null {
  for (const [re, t] of VERBES) if (re.test(n)) return t;
  return null;
}

function sujetDe(n: string): Sujet | null {
  if (/\bdecision/.test(n)) return "decisions";
  if (/\bcadre\b|cadre\.md/.test(n)) return "cadre";
  if (/\broadmap\b|feuille de route/.test(n)) return "roadmap";
  if (/\brapports?\b/.test(n) && !/\.md\b/.test(n)) return "rapports";
  if (/\b(resume du jour|journee|aujourd hui|etat d oia)\b/.test(n)) return "jour";
  return null;
}

/** Repère une offre de Shyrka : une question qui propose une opération sur un sujet connu. */
export function detecterOffre(reponse: string): Offre | null {
  for (const q of questions(reponse)) {
    const n = normaliser(q);
    if (!/\b(veux|voulez|souhaites|aimerais|veux tu|tu veux|je peux|puis je|dois je|on)\b/.test(n)) continue;
    const type = typeDe(n);
    const sujet = sujetDe(n);
    if (type && sujet) return { type, sujet, question: q.trim() };
  }
  return null;
}

/** Les phrases interrogatives d'un texte. */
export function questions(texte: string): string[] {
  return (texte.match(/[^.!?\n]*\?/g) ?? []).map((q) => q.trim()).filter(Boolean);
}

export type Demande = { ok: true; operation: Operation } | { ok: true; fichier: string; type: TypeOperation } | { ok: false; document: string };

const NOMS_DOCUMENT = /\b(mandat|adr|contrat|audit|fichier|document|note|courrier|mail|e mail|email|permissions|identite\.json|secret|env|manuel)\b/;
const CHEMIN = /(?:[\w.-]+\/)+[\w.-]+|[\w-]+\.(?:md|json|ya?ml|ts|js|sql|env|txt|sh)\b|\.env\b/i;

/**
 * Repère une demande directe de Mickaël (« présente-moi le cadre », « liste les
 * décisions », « lis infra/shyrka/permissions.json »). Rend l'opération, le
 * fichier à lire, ou le document refusé. Null si ce n'est pas une demande de
 * lecture.
 */
export function detecterDemande(texte: string, depot: string = RACINE_DEPOT): Demande | null {
  const n = normaliser(texte);
  const type = typeDe(n);
  if (!type) return null;
  const chemin = CHEMIN.exec(texte)?.[0];
  if (chemin) {
    const c = chemin.toLowerCase();
    const connu = Object.values(FICHIERS).find((f) => f.toLowerCase() === c || f.toLowerCase().endsWith(`/${c}`));
    const rel = connu ?? chemin;
    const abs = isAbsolute(rel) ? rel : join(depot, rel);
    if (!lectureAutorisee(abs, depot)) return { ok: false, document: chemin };
    if (connu === FICHIERS.cadre) return { ok: true, operation: { type, sujet: "cadre" } };
    return { ok: true, fichier: rel, type };
  }
  // Une demande de lecture est courte (« présente-moi le cadre ») ; une question
  // plus longue sur le même sujet va au modèle, avec le contexte.
  const sujet = n.split(" ").length <= 12 ? sujetDe(n) : null;
  if (sujet) return { ok: true, operation: { type: sujet === "decisions" || sujet === "rapports" ? "lister" : type, sujet } };
  const nom = NOMS_DOCUMENT.exec(n)?.[0];
  return nom ? { ok: false, document: nom } : null;
}

/** Réponse honnête à un document hors de la liste : rien n'est lu. */
export function refusDocument(document: string): string {
  return `Je ne peux pas lire « ${document} » : ce document n'est pas dans ma liste de lectures autorisées, et je ne l'ai pas lu. Je peux lire ${LECTURES_POSSIBLES}.`;
}

/** Une lecture réelle : chemin, texte intégral, ou absence. */
export interface Lecture {
  fichier: string;
  texte: string | null;
}

/** Sources de Shyrka, lues par la liste blanche. Remplaçables dans les tests. */
export interface Sources {
  lireFichier(rel: string): Lecture;
  etat(): EtatOia;
}

export function sourcesDuDepot(depot: string = RACINE_DEPOT): Sources {
  return {
    lireFichier: (rel) => {
      const abs = join(depot, rel);
      return { fichier: rel, texte: existsSync(abs) ? lire(abs, depot) : null };
    },
    etat: () => etatOia(depot),
  };
}

/** Résultat d'une opération : soit un texte final, soit un document à synthétiser par le modèle. */
export type Execution = { texte: string } | { synthese: { fichier: string; texte: string; consigne: string } };

const CONSIGNES: Record<TypeOperation, string> = {
  presenter: "Présente ce document à Mickaël : son but, puis ses règles principales, en cinq phrases au plus.",
  resumer: "Résume ce document en cinq phrases au plus.",
  expliquer: "Explique ce document simplement, en cinq phrases au plus.",
  lister: "Liste les titres de ses sections, dans l'ordre.",
};

/** Exécute une opération de lecture. Les listes viennent du code, mot pour mot ; une synthèse part du texte lu. */
export function executer(op: Operation | { type: TypeOperation; fichier: string }, sources: Sources, aujourdhui: Date = new Date()): Execution {
  if ("fichier" in op) {
    const l = sources.lireFichier(op.fichier);
    if (l.texte === null) return { texte: `Le fichier ${op.fichier} est dans ma liste, mais il n'existe pas : je ne l'ai pas lu.` };
    return { synthese: { fichier: l.fichier, texte: l.texte, consigne: CONSIGNES[op.type] } };
  }
  switch (op.sujet) {
    case "decisions": {
      const e = sources.etat();
      return { texte: listeDesDecisions(e.decisionsDetail ?? []) };
    }
    case "rapports": {
      const r = sources.etat().rapports;
      return { texte: r.length ? [`Rapports (${r.length}), du plus récent au plus ancien :`, ...r.map((x) => `- ${x.titre} (${x.fichier})`)].join("\n") : "Aucun rapport." };
    }
    case "jour":
      return { texte: resumeDuJour(sources.etat(), aujourdhui) };
    case "cadre":
    case "roadmap": {
      const l = sources.lireFichier(FICHIERS[op.sujet]);
      if (l.texte === null) return { texte: `Je n'ai pas trouvé ${FICHIERS[op.sujet]} : je ne l'ai pas lu.` };
      return { synthese: { fichier: l.fichier, texte: l.texte, consigne: CONSIGNES[op.type] } };
    }
  }
}

/**
 * Retire d'une réponse les questions déjà posées au tour précédent, et les
 * offres d'une opération déjà faite : une même question n'est jamais reposée
 * deux fois de suite.
 */
export function sansRepetition(reponse: string, precedentes: string[], faites: Operation[]): string {
  const deja = new Set(precedentes.map(normaliser));
  let out = reponse;
  for (const q of questions(reponse)) {
    const offre = detecterOffre(q);
    const faite = offre && faites.some((f) => f.sujet === offre.sujet);
    if (deja.has(normaliser(q)) || faite) out = out.replace(q, "");
  }
  // Typographie française conservée : seules les espaces doublées se resserrent.
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

export type { Decision };
