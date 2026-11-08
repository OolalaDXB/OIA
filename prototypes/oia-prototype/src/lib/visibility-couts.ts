/** Estimation en dollars à partir du panel et des seuls assistants suivis. */
export function estimerDepense(questions: number, jours: number, moteurs: readonly { estime: number; suivi: boolean }[]) {
  return Math.round(questions * jours * moteurs.filter((m) => m.suivi).reduce((s, m) => s + m.estime, 0) * 100) / 100;
}
export function alerteDepense(depense: number, plafond: number) {
  return plafond > 0 && depense > plafond * 0.8;
}