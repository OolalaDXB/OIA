import { z } from "zod";

export const SHYRKA_STORAGE_KEY = "oia.shyrka.v1";
const action = z.object({ id: z.number().int().nonnegative(), texte: z.string(), faite: z.boolean() });
const savedSchema = z.object({
  version: z.literal(1),
  messages: z.array(z.object({ id: z.number().int().nonnegative(), auteur: z.enum(["Vous", "Shyrka"]), texte: z.string() })),
  actions: z.array(action),
  decisions: z.array(action),
});
export type SavedShyrka = z.infer<typeof savedSchema>;
export function lireShyrka(storage: Pick<Storage, "getItem">): SavedShyrka | null {
  try {
    const raw = storage.getItem(SHYRKA_STORAGE_KEY);
    if (!raw) return null;
    const result = savedSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch { return null; }
}
export function sauverShyrka(storage: Pick<Storage, "setItem" | "removeItem">, data: SavedShyrka): boolean {
  try {
    if (data.messages.length || data.actions.length || data.decisions.length) storage.setItem(SHYRKA_STORAGE_KEY, JSON.stringify(data));
    else storage.removeItem(SHYRKA_STORAGE_KEY);
    return true;
  } catch { return false; }
}