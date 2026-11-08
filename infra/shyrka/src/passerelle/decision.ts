import { normaliserTexte } from "@oia/shyrka-noyau";
import type { ExtraitCorpus } from "../executive/corpus.js";
import type { Reponse } from "../memoire/commandes.js";

/** Une question sur une décision passée (« Qu'avais-je décidé pour SILLON ? »). */
export const QUESTION_DECISION = /\bqu.?(avais|ai)[- ]je d[ée]cid[ée]|\bqu.?a[- ]t[- ]on d[ée]cid[ée]|\bquelle d[ée]cision\b/i;

/** Ce que le corpus peut dire pour ce tour. */
export type EtatCorpus = ExtraitCorpus[] | "indisponible" | "prive";

/** Sujet de la question : ce qui suit « pour », sans ponctuation finale. */
function sujet(phrase: string): string {
  return /\bpour\s+(?:le projet\s+|la\s+|le\s+|l')?(.+?)\s*[?.!]*\s*$/i.exec(phrase)?.[1]?.trim() ?? "ce sujet";
}

/** Source principale : un passage qui nomme le sujet, de préférence dans une section de décisions ; sinon le mieux classé. */
export function sourcePrincipale(x: ExtraitCorpus[], s: string): ExtraitCorpus {
  const n = normaliserTexte(s);
  const score = (e: ExtraitCorpus) => (normaliserTexte(`${e.section} ${e.extrait}`).includes(n) ? 2 : 0) + (/d[ée]cision/i.test(e.section) ? 1 : 0);
  return x.reduce((m, e) => (score(e) > score(m) ? e : m), x[0]!);
}

const fichier = (chemin: string) => chemin.split("/").pop()!.replace(/\.md$/, "");

/**
 * Réponse d'une question sur une décision : la mémoire ET le corpus, dits tous
 * les deux. La première ligne est celle que Shyrka dit à voix haute (voir
 * ShyrkaSession.reponseMemoire) : elle porte donc les deux constats, le
 * nombre de passages et la source principale. Les lignes suivantes, à
 * l'écran, donnent chaque passage avec chemin, ligne, version et date. Un
 * passage du corpus n'est jamais présenté comme un souvenir.
 */
export function composerDecision(r: Reponse, corpus: EtatCorpus, phrase: string): Reponse {
  const s = sujet(phrase);
  const [premiere = "", ...reste] = r.texte.split("\n");
  // « Je n'ai aucune décision enregistrée pour « sillon » … » : on dit explicitement que c'est la mémoire.
  // Décisions trouvées : l'en-tête seul ne dit rien à l'oral ; on dit leur nombre et la première.
  const decisions = /^D[ée]cisions retenues pour/i.test(premiere) ? reste.filter((l) => /^\[[0-9a-f]{8}\]/.test(l.trim())).map((l) => l.trim().replace(/^\[[0-9a-f]{8}\]\s*/, "")) : [];
  const memoire = /aucune d[ée]cision enregistr[ée]e/i.test(premiere)
    ? `Aucune décision enregistrée dans ma mémoire pour ${s}.`
    : decisions.length
      ? `Ma mémoire a ${decisions.length} décision${decisions.length > 1 ? "s" : ""} pour ${s} : ${decisions[0]!.replace(/[.\s]+$/, "")}${decisions.length > 1 ? " (les autres à l'écran)" : ""}.`
      : premiere.trim();
  let constat: string;
  let detail: string[] = [];
  if (corpus === "prive") constat = "Mode privé : je n'ai pas consulté le corpus.";
  else if (corpus === "indisponible") constat = "Le corpus est indisponible : je ne peux pas vérifier ce qu'il en dit.";
  else if (!corpus.length) constat = decisions.length ? "Le corpus n'en parle pas." : "Le corpus n'en parle pas non plus.";
  else {
    const p = sourcePrincipale(corpus, s);
    constat = `Le corpus en parle : ${corpus.length} passage${corpus.length > 1 ? "s" : ""}, source principale ${fichier(p.chemin)}, section ${p.section}.`;
    detail = ["Passages du corpus (à lire ; ce ne sont pas des souvenirs) :", ...corpus.map((e) => `- ${e.chemin}:${e.ligne} § ${e.section} · version ${e.version} · ${e.dateSource.slice(0, 10)}`)];
  }
  const restes = reste.filter((l) => !/^Je ne compl[èe]te pas/i.test(l.trim()));
  return { ...r, texte: [`${memoire} ${constat}`, ...restes, ...detail].join("\n") };
}
