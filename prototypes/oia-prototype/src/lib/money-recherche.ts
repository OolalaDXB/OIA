import { z } from "zod";
import { lireDemoMoney } from "@/lib/donnees/money";

export const besoinSchema = z.object({ texte: z.string().trim().min(3).max(3000) });
export const analyseSchema = z.object({
  resume: z.string().max(1500),
  correspondances: z.array(z.object({ id: z.string(), pertinence: z.enum(["Forte", "Partielle"]), raisons: z.array(z.string().max(1000)).max(5), manquants: z.array(z.string().max(1000)).max(8) })).max(7),
  manquants: z.array(z.string().max(1000)).max(10),
});
export type AnalyseMoney = z.infer<typeof analyseSchema>;
export function validerAnalyse(value: unknown): AnalyseMoney {
  const result = analyseSchema.parse(value);
  const { opportunites } = lireDemoMoney();
  const ids = new Set<string>();
  for (const c of result.correspondances) {
    if (!opportunites.some((o) => o.id === c.id) || ids.has(c.id)) throw new Error("Correspondance hors catalogue ou dupliquée.");
    ids.add(c.id);
  }
  return result;
}