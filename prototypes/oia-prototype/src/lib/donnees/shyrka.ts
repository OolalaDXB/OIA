import { commandesShyrka, simulerShyrka, presenceInitiale, etatPresence } from "@/data/demo";
import { cadreInitial, contexteInitial, permissionsInitiales, paliers, sourcesShyrka, applications, canaux, categoriesContexte, categoriesPermission, identite } from "@/data/shyrka-contexte";
import type { SourceDonnees } from "./source";

export function lireDemoShyrka() { return { commandesShyrka: [...commandesShyrka], presenceInitiale, cadreInitial, contexteInitial, paliers, sourcesShyrka, applications, canaux, categoriesContexte, categoriesPermission, identite, actionsPreparees: ["Quatre corrections Studio Ardoise, en attente de relecture", "Annexe technique Bpifrance, brouillon"] }; }
export type DonneesShyrka = ReturnType<typeof lireDemoShyrka>;
/** Données réelles : emplacement réservé, non branché. Conversation et contexte restent locaux. */
export const sourceReelleShyrka: SourceDonnees<DonneesShyrka> | null = null;
export const sourceShyrka: SourceDonnees<DonneesShyrka> = lireDemoShyrka;
export const shyrkaVide = (d: DonneesShyrka) => d.commandesShyrka.length === 0 && d.categoriesContexte.length === 0;
export { simulerShyrka, etatPresence, permissionsInitiales, paliers };
export { type CategorieContexte, type ElementContexte, type Palier } from "@/data/shyrka-contexte";