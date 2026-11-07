import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Identité de Shyrka (docs/shyrka/CADRE.md, « Identité »).
 *
 * Version 0, décidée par Mickaël le 7 novembre 2026 (amendement aux mandats
 * v6 et v7, § 3) : présence en points et voix Aurélie, voix en sortie
 * comprise. Le reste de l'identité, Shyrka le fera évoluer elle-même ; chaque
 * version est consignée dans le cadre puis dans infra/shyrka/identite.json.
 * Ce programme lit le fichier et ne l'écrit jamais.
 */
export const IdentitySchema = z
  .object({
    version: z.number().int().min(0),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    decidePar: z.string().min(1),
    presence: z.string().min(1),
    voixEnSortie: z.boolean(),
    voix: z.string().min(1),
    visage: z.boolean(),
    source: z.string().min(1),
  })
  .strict();

export type Identity = z.infer<typeof IdentitySchema>;

export const IDENTITY_V0: Identity = {
  version: 0,
  date: "2026-11-07",
  decidePar: "Mickaël Thomas",
  presence: "points",
  voixEnSortie: true,
  voix: "Aurélie",
  visage: false,
  source: "docs/shyrka/CADRE.md",
};

/** Repli sans voix, utilisé seulement quand le fichier d'identité est illisible ou invalide. */
export const IDENTITE_DE_REPLI: Identity = { ...IDENTITY_V0, voixEnSortie: false };

/** Lit l'identité. Fichier absent ou invalide : repli en texte seul, et un avertissement. */
export function loadIdentity(path: string, read: (p: string) => string = (p) => readFileSync(p, "utf8")): { identity: Identity; warning?: string } {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    return { identity: IDENTITE_DE_REPLI, warning: `Identité introuvable (${path}) : réponses en texte seul.` };
  }
  try {
    const parsed = IdentitySchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { identity: parsed.data };
    return { identity: IDENTITE_DE_REPLI, warning: `Identité invalide (${parsed.error.issues[0]?.message ?? "schéma"}) : réponses en texte seul.` };
  } catch {
    return { identity: IDENTITE_DE_REPLI, warning: "Identité illisible (JSON) : réponses en texte seul." };
  }
}

export function voiceOutputAllowed(identity: Identity): boolean {
  return identity.voixEnSortie;
}
