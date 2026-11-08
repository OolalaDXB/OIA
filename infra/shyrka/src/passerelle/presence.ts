import { normaliserTexte, type ModePresence } from "@oia/shyrka-noyau";

/**
 * Mode de présence (décision de Mickaël, 9 novembre 2026) : « je suis seul »,
 * « on est entre nous », « je suis avec quelqu'un ». Reconnu par le code,
 * avant tout modèle ; la phrase entière doit être la commande (une phrase qui
 * contient « seul » ne change rien).
 */

const COMMANDES: [RegExp, ModePresence][] = [
  [/^(?:je suis (?:tout |toute )?seule?|me voila seule?|je suis seule? maintenant|tu peux tout dire|on est seuls?)$/, "seul"],
  [/^(?:on est entre nous|nous sommes entre nous|on est en famille|on est entre proches|entre nous)$/, "entre_proches"],
  [/^(?:je suis avec quelqu ?un|il y a quelqu ?un|je ne suis pas seule?|quelqu ?un est la|on n est pas seuls?|attention quelqu ?un)$/, "externe"],
];

export function commandePresence(texte: string): ModePresence | null {
  const n = normaliserTexte(texte.replace(/^shyrka[,!:. ]+/i, "")).replace(/[^a-z' ]/g, " ").replace(/'/g, " ").replace(/\s+/g, " ").trim();
  for (const [re, mode] of COMMANDES) if (re.test(n)) return mode;
  return null;
}

/** Ce que Shyrka dit au changement de mode : jamais ce qui devient masqué. */
export const REPONSES_PRESENCE: Record<ModePresence, string> = {
  seul: "D'accord, tu es seul : je peux te parler de tout.",
  entre_proches: "Entendu, vous êtes entre vous : je m'en tiens au public et à l'interne.",
  externe: "Compris : je m'en tiens à ce qui est public.",
};

export const LIBELLES_PRESENCE: Record<ModePresence, string> = { seul: "Seul", entre_proches: "Entre proches", externe: "Avec un externe" };

/** Un mode est plus restreint qu'un autre s'il montre moins de niveaux. */
export const RANG: Record<ModePresence, number> = { seul: 2, entre_proches: 1, externe: 0 };
