import { z } from "zod";

export const MONEY_ANALYTICS_KEY = "oia.money.evenements.v1";
const MAX_EVENEMENTS = 200;

const evenementSchema = z.object({
  nom: z.enum([
    "project.money_export_requested",
    "project.money_filter_changed",
    "project.money_opportunity_opened",
    "project.money_tab_selected",
  ]),
  date: z.string().datetime(),
  proprietes: z.record(z.union([z.string(), z.number(), z.boolean()])),
});
const stockageSchema = z.object({ version: z.literal(1), evenements: z.array(evenementSchema).max(MAX_EVENEMENTS) });

type NomEvenement = z.infer<typeof evenementSchema>["nom"];
type Proprietes = z.infer<typeof evenementSchema>["proprietes"];
type StockageLocal = Pick<Storage, "getItem" | "setItem">;

/** Conserve les événements dans ce navigateur uniquement, sans texte libre ni transport réseau. */
export function enregistrerEvenementMoney(nom: NomEvenement, proprietes: Proprietes, stockage?: StockageLocal) {
  if (!stockage && typeof window === "undefined") return;
  const cible = stockage ?? window.localStorage;
  try {
    const brut = cible.getItem(MONEY_ANALYTICS_KEY);
    const precedent = brut ? stockageSchema.parse(JSON.parse(brut)).evenements : [];
    const evenement = { nom, date: new Date().toISOString(), proprietes };
    const prochain = stockageSchema.parse({ version: 1, evenements: [evenement, ...precedent].slice(0, MAX_EVENEMENTS) });
    cible.setItem(MONEY_ANALYTICS_KEY, JSON.stringify(prochain));
  } catch {
    try {
      const evenement = { nom, date: new Date().toISOString(), proprietes };
      cible.setItem(MONEY_ANALYTICS_KEY, JSON.stringify({ version: 1, evenements: [evenement] }));
    } catch {
      // Le suivi reste facultatif lorsque le navigateur refuse le stockage local.
    }
  }
}
