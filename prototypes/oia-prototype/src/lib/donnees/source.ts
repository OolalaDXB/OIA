/** Contrat commun, sans transport distant ni hypothèse sur le contrat OIA à venir. */
export type EtatDonnees<T> =
  | { statut: "chargement" }
  | { statut: "vide" }
  | { statut: "erreur"; message: string }
  | { statut: "pret"; donnees: T };

export type SourceDonnees<T> = () => T | null | Promise<T | null>;
export function resultatDonnees<T>(donnees: T | null, estVide: (d: T) => boolean): EtatDonnees<T> {
  return donnees === null || estVide(donnees) ? { statut: "vide" } : { statut: "pret", donnees };
}
export async function chargerDonnees<T>(source: SourceDonnees<T>, estVide: (d: T) => boolean): Promise<EtatDonnees<T>> {
  try { return resultatDonnees(await source(), estVide); }
  catch { return { statut: "erreur", message: "Les données sont indisponibles pour le moment." }; }
}