/**
 * Mots qui interrompent Shyrka pendant qu'elle parle (décision de Mickaël,
 * 8 novembre 2026) : « Stop », « Attends », « Excuse-moi », dans toutes les
 * langues. Un autre son (son propre écho, un bruit, une remarque) ne la coupe
 * pas : elle finit sa phrase.
 */
const MOTS: string[] = [
  // Les trois ordres de Mickaël et leurs équivalents directs ; aucun mot courant qu'elle pourrait dire elle-même.
  "stop", "arrete", "arretez", "attends", "attendez", "excuse moi", "excusez moi",
  "wait", "hold on", "excuse me",
  "espera", "espere", "disculpa", "disculpe", "aspetta", "scusa", "scusi", "desculpa", "desculpe",
  "stopp", "warte", "warten sie", "entschuldigung", "wacht",
  "стоп", "подожди", "подождите", "извини", "извините", "зачекай", "вибач", "вибачте",
  "توقف", "انتظر", "عذرا", "רגע", "חכה", "סליחה", "ببخشید", "bekle",
  "停", "等一下", "等等", "对不起", "待って", "すみません", "ストップ", "잠깐", "멈춰", "रुको",
];
/** Un ordre est court : au-delà, c'est une phrase (souvent l'écho de sa propre voix) qui contient le mot par hasard. */
export const MOTS_MAX_ORDRE = 6;

/** Texte normalisé : minuscules, sans accents latins, ponctuation en espaces. */
function normaliser(t: string): string {
  return ` ${t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim()} `;
}

const NORMALISES = [...new Set(MOTS.map((m) => normaliser(m).trim()))];
/** Écritures sans espaces entre les mots : le mot est cherché tel quel, pas en mot entier. */
const SANS_ESPACES = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/** Le mot d'arrêt trouvé dans la transcription, ou null. */
export function motInterruption(texte: string): string | null {
  const n = normaliser(texte);
  const mots = n.trim().split(" ").filter(Boolean);
  if (!mots.length || (mots.length > MOTS_MAX_ORDRE && !SANS_ESPACES.test(n))) return null;
  for (const m of NORMALISES) {
    if (SANS_ESPACES.test(m) ? n.includes(m) : n.includes(` ${m} `)) return m;
  }
  return null;
}
