/**
 * Commandes de voix (essai réel du 8 novembre 2026 : à « parle plus fort », Shyrka répondait
 * qu'elle ne pouvait pas parler). Traitées par le code, avant tout modèle : volume de sa voix
 * (lecture seulement, jamais le volume du Mac) et débit de sa diction.
 */
export interface ReglagesVoix {
  /** Mots par minute pour `say` ; undefined : débit de la voix. */
  debit?: number;
  /** Multiplicateur de lecture (afplay -v) ; 1 : normal. */
  volume?: number;
}

export const DEBIT_NORMAL = 185;
const DEBIT_MIN = 120;
const DEBIT_MAX = 260;
const VOLUME_MAX = 2.5;

type Commande = "plus_fort" | "moins_fort" | "plus_lent" | "plus_vite" | "normal";

export function commandeVoix(texte: string): Commande | null {
  const n = texte.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z' ]/g, " ").replace(/\s+/g, " ").trim();
  if (n.split(" ").length > 10) return null;
  if (/\b(voix normale|parle normalement|reglages? (de )?voix par defaut)\b/.test(n)) return "normal";
  if (/\b(plus fort|monte (le son|le volume|ta voix)|parle fort|je ne t entends pas|je t entends mal)\b/.test(n)) return "plus_fort";
  if (/\b(moins fort|plus bas|baisse (le son|le volume|ta voix)|parle (plus )?doucement)\b/.test(n)) return "moins_fort";
  if (/\b(plus lentement|moins vite|ralentis|parle lentement)\b/.test(n)) return "plus_lent";
  if (/\b(plus vite|accelere|parle vite|plus rapidement)\b/.test(n)) return "plus_vite";
  return null;
}

/** Applique la commande et rend la phrase de confirmation, dite à voix haute. */
export function appliquerCommandeVoix(c: Commande, r: ReglagesVoix): string {
  const v = r.volume ?? 1;
  const d = r.debit ?? DEBIT_NORMAL;
  switch (c) {
    case "plus_fort":
      if (v >= VOLUME_MAX) return "Je suis déjà au plus fort pour ma voix. Monte le volume du Mac si besoin.";
      r.volume = Math.min(VOLUME_MAX, Math.round((v + 0.5) * 10) / 10);
      return "D'accord, je parle plus fort.";
    case "moins_fort":
      r.volume = Math.max(0.3, Math.round((v - 0.4) * 10) / 10);
      return "D'accord, je parle moins fort.";
    case "plus_lent":
      r.debit = Math.max(DEBIT_MIN, d - 25);
      return "D'accord, je parle plus lentement.";
    case "plus_vite":
      r.debit = Math.min(DEBIT_MAX, d + 25);
      return "D'accord, je parle plus vite.";
    case "normal":
      delete r.debit;
      delete r.volume;
      return "D'accord, je reprends ma voix normale.";
  }
}
