/**
 * Outils de texte communs à l'extraction des acteurs et des homonymes : repli des accents et
 * de la casse aligné caractère par caractère sur le texte d'origine (les positions restent
 * celles de `rawText`), recherche en mot entier, passage autour d'une position.
 */
import { wholeWordPattern } from "../judge-jev.js";

/** Réponse d'un moteur, telle que la range collect-day (sous-ensemble d'EvidenceRow). */
export interface AnswerRow {
  id: string;
  engine: string;
  promptId: string;
  rawText: string;
  citations: { url: string; label?: string }[];
}

/** Minuscules sans accents, même longueur que l'entrée (un caractère qui changerait de longueur est gardé tel quel). */
export function fold(s: string): string {
  let out = "";
  for (const ch of s) {
    const base = ch.normalize("NFD").replace(/\p{M}+/gu, "");
    const lower = base.toLowerCase();
    out += lower.length === ch.length ? lower : base.length === ch.length ? base : ch;
  }
  return out;
}

/** Clé de regroupement d'un nom : repli, espaces réduits. */
export const nameKey = (s: string) => fold(s).replace(/\s+/g, " ").trim();

/** Positions, dans `text`, des mentions en mot entier de `term` (accents et casse ignorés). */
export function offsetsOf(text: string, term: string): number[] {
  const pattern = wholeWordPattern(nameKey(term));
  return [...fold(text).matchAll(pattern)].map((m) => m.index ?? 0);
}

/** Ligne (ou phrase de la ligne) qui contient la position, bornée à `max` caractères. */
export function passageAt(text: string, at: number, max = 300): { start: number; end: number; text: string } {
  let start = text.lastIndexOf("\n", at - 1) + 1;
  let end = text.indexOf("\n", at);
  if (end < 0) end = text.length;
  if (end - start > max) {
    const s = Math.max(start, at - Math.floor(max / 2));
    start = s;
    end = Math.min(end, s + max);
  }
  return { start, end, text: text.slice(start, end).trim() };
}

/** URL écrites dans un passage (liens markdown ou adresses nues). */
export function urlsIn(text: string): string[] {
  return [...text.matchAll(/\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)\]>"']+)/g)].map((m) => (m[1] ?? m[2]!).replace(/[.,;]+$/, ""));
}

export function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}
