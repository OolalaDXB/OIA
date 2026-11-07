import { opportunites, projets, signals, typesMontant } from "@/data/money";
import type { SourceDonnees } from "./source";

export function lireDemoMoney() { return { opportunites, projets, signals, typesMontant }; }
export type DonneesMoney = ReturnType<typeof lireDemoMoney>;
/** Données réelles : emplacement réservé, non branché. La recherche IA reste sur lireDemoMoney. */
export const sourceReelleMoney: SourceDonnees<DonneesMoney> | null = null;
export const sourceMoney: SourceDonnees<DonneesMoney> = lireDemoMoney;
export const moneyVide = (d: DonneesMoney) => d.opportunites.length === 0 && d.signals.length === 0;
export { formatMontant, sousTotaux, versCsv, versMarkdown, type Opportunite } from "@/data/money";