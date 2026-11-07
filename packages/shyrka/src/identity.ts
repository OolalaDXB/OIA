import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Identité de Shyrka, version par version (docs/shyrka/CADRE.md, « Identité »).
 * La version 0 interdit toute voix synthétisée en sortie. Seul Mickaël change
 * de version, par une décision écrite dans le cadre puis dans
 * infra/shyrka/identite.json. Le code ne modifie jamais ce fichier.
 */
export const IdentitySchema = z
  .object({
    version: z.number().int().min(0),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    decidePar: z.string().min(1),
    voixEnSortie: z.boolean(),
    visage: z.boolean(),
    voixDeReference: z.string().min(1),
    source: z.string().min(1),
  })
  .strict()
  .refine((i) => i.version > 0 || (!i.voixEnSortie && !i.visage), {
    message: "La version 0 n'autorise ni voix en sortie ni visage (CADRE.md).",
  });

export type Identity = z.infer<typeof IdentitySchema>;

export const IDENTITY_V0: Identity = {
  version: 0,
  date: "2026-11-07",
  decidePar: "Mickaël Thomas",
  voixEnSortie: false,
  visage: false,
  voixDeReference: "Aurélie",
  source: "docs/shyrka/CADRE.md",
};

/** Lit l'identité. Fichier absent ou invalide : version 0, la plus fermée. */
export function loadIdentity(path: string, read: (p: string) => string = (p) => readFileSync(p, "utf8")): { identity: Identity; warning?: string } {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    return { identity: IDENTITY_V0, warning: `Identité introuvable (${path}) : version 0 appliquée.` };
  }
  try {
    const parsed = IdentitySchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { identity: parsed.data };
    return { identity: IDENTITY_V0, warning: `Identité invalide (${parsed.error.issues[0]?.message ?? "schéma"}) : version 0 appliquée.` };
  } catch {
    return { identity: IDENTITY_V0, warning: "Identité illisible (JSON) : version 0 appliquée." };
  }
}

export function voiceOutputAllowed(identity: Identity): boolean {
  return identity.version > 0 && identity.voixEnSortie;
}
