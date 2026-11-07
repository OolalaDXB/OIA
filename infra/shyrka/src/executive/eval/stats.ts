/**
 * Mesures d'un banc (mandat v11, A3) : une proportion vient toujours avec
 * son effectif et son intervalle. Sous 10 exemples, pas de pourcentage
 * affiché comme une note : seulement « k sur n », avec réserve.
 */
export const EFFECTIF_MIN_POURCENTAGE = 10;

export interface Mesure {
  k: number;
  n: number;
  /** Intervalle de Wilson à 95 %, null si n = 0. */
  bas: number | null;
  haut: number | null;
  reserve: string | null;
}

export function intervalleWilson(k: number, n: number, z = 1.96): Mesure {
  if (n === 0) return { k, n, bas: null, haut: null, reserve: "aucun exemple" };
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const marge = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return { k, n, bas: Math.max(0, centre - marge), haut: Math.min(1, centre + marge), reserve: n < EFFECTIF_MIN_POURCENTAGE ? `échantillon de ${n} : indicatif seulement` : null };
}

export function texteMesure(m: Mesure): string {
  if (m.n === 0) return "0 exemple";
  if (m.n < EFFECTIF_MIN_POURCENTAGE) return `${m.k}/${m.n} (${m.reserve})`;
  const pc = (x: number) => `${Math.round(x * 100)} %`;
  return `${m.k}/${m.n} · IC95 ${pc(m.bas!)}–${pc(m.haut!)}`;
}
