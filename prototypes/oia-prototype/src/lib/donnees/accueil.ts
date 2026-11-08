import { aDecider, modules, depenses, utilisateur, activiteRecente, modulesPersonnels } from "@/data/demo";
import type { SourceDonnees } from "./source";

export function lireDemoAccueil() { return { aDecider, modules: [...modules], depenses, utilisateur, activiteRecente, modulesPersonnels: [...modulesPersonnels] }; }
export type DonneesAccueil = ReturnType<typeof lireDemoAccueil>;
/** Données réelles : emplacement réservé, aucun appel tant que le contrat OIA n'est pas fourni. */
export const sourceReelleAccueil: SourceDonnees<DonneesAccueil> | null = null;
export const sourceAccueil: SourceDonnees<DonneesAccueil> = lireDemoAccueil;
export const accueilVide = (d: DonneesAccueil) => d.modules.length === 0 && d.aDecider.length === 0 && d.activiteRecente.length === 0;
export { type Etat } from "@/data/demo";