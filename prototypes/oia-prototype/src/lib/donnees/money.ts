import { opportunites, projets, signals, typesMontant } from "@/data/money";
import type { SourceDonnees } from "./source";

export function lireDemoMoney() { return { opportunites, projets, signals, typesMontant }; }
export type DonneesMoney = ReturnType<typeof lireDemoMoney>;
/** La démonstration reste isolée du contrat réel, sans conversion de champs inventés. */
export { sourceReelleMoney, useVueMoney, useActionMoney, useAccesMoney } from "./money-reel";
export const sourceMoney: SourceDonnees<DonneesMoney> = lireDemoMoney;
export const moneyVide = (d: DonneesMoney) => d.opportunites.length === 0 && d.signals.length === 0;
export { formatMontant, sousTotaux, versCsv, versMarkdown, type Opportunite } from "@/data/money";