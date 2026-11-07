import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Paliers de permission de Shyrka pour l'e-mail et WhatsApp (CADRE.md,
 * « Communications au nom de Mickaël » : lire, préparer, répondre, puis
 * envoyer en son nom, dans l'ordre de l'extension des permissions).
 *
 * Les permissions sont fixées et élargies par Mickaël seul. Ce module les
 * lit et les applique ; il n'écrit jamais le fichier, et aucune fonction ne
 * permet à Shyrka de s'en accorder.
 */
export const PALIERS = ["aucun", "lire", "preparer", "repondre-apres-validation", "envoyer-seule"] as const;
export type Palier = (typeof PALIERS)[number];
export const rang = (p: Palier): number => PALIERS.indexOf(p);

export type Canal = "email" | "whatsapp";

const DelegationSchema = z
  .object({
    /** Catégorie de message (voir messages/categories.ts) que Shyrka peut traiter seule. */
    categorie: z.string().min(1),
    signeLe: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .strict();

const CanalSchema = z
  .object({
    palier: z.enum(PALIERS),
    /** Délégations écrites : seul le palier « envoyer-seule » les utilise. */
    delegations: z.array(DelegationSchema).default([]),
  })
  .strict();

export const PermissionsSchema = z
  .object({
    version: z.number().int().min(0),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    accordePar: z.literal("Mickaël Thomas"),
    canaux: z.object({ email: CanalSchema, whatsapp: CanalSchema }).strict(),
    /** Catégories qui remontent toujours à Mickaël, quel que soit le palier (séance 9). */
    toujoursRemonter: z.array(z.string()).default([]),
    /** Domaines et numéros dont les messages n'entrent jamais (Swift et ses clients). */
    exclus: z.object({ domaines: z.array(z.string()).default([]), numeros: z.array(z.string()).default([]) }).strict(),
  })
  .strict();

export type Permissions = z.infer<typeof PermissionsSchema>;

/** Le plus fermé : aucun accès, rien de délégué. Valeur de repli. */
export const PERMISSIONS_FERMEES: Permissions = {
  version: 0,
  date: "2026-11-08",
  accordePar: "Mickaël Thomas",
  canaux: { email: { palier: "aucun", delegations: [] }, whatsapp: { palier: "aucun", delegations: [] } },
  toujoursRemonter: [],
  exclus: { domaines: ["swift.com"], numeros: [] },
};

export function loadPermissions(path: string, read: (p: string) => string = (p) => readFileSync(p, "utf8")): { permissions: Permissions; warning?: string } {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    return { permissions: PERMISSIONS_FERMEES, warning: `Permissions introuvables (${path}) : tout est fermé.` };
  }
  try {
    const parsed = PermissionsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { permissions: parsed.data };
    return { permissions: PERMISSIONS_FERMEES, warning: `Permissions invalides (${parsed.error.issues[0]?.path.join(".")} : ${parsed.error.issues[0]?.message}) : tout est fermé.` };
  } catch {
    return { permissions: PERMISSIONS_FERMEES, warning: "Permissions illisibles (JSON) : tout est fermé." };
  }
}

export type Action = "lire" | "preparer" | "envoyer";

export interface Decision {
  autorise: boolean;
  /** Vrai quand l'envoi est possible, mais seulement avec la validation explicite de Mickaël. */
  validationRequise: boolean;
  raison: string;
}

/**
 * Applique les paliers. Une validation est la preuve que Mickaël a approuvé
 * ce brouillon précis (identifiant et empreinte du texte), pas une
 * autorisation générale.
 */
export function decider(
  perms: Permissions,
  canal: Canal,
  action: Action,
  ctx: { categorie?: string; validation?: { brouillonId: string; empreinte: string }; brouillon?: { id: string; empreinte: string } } = {},
): Decision {
  const palier = perms.canaux[canal].palier;
  const non = (raison: string, validationRequise = false): Decision => ({ autorise: false, validationRequise, raison });
  const oui = (raison: string): Decision => ({ autorise: true, validationRequise: false, raison });

  if (action === "lire") return rang(palier) >= rang("lire") ? oui(`palier ${palier}`) : non(`${canal} : palier ${palier}, lecture non accordée`);
  if (action === "preparer") return rang(palier) >= rang("preparer") ? oui(`palier ${palier}`) : non(`${canal} : palier ${palier}, préparation non accordée`);

  // Envoi.
  if (rang(palier) < rang("repondre-apres-validation")) return non(`${canal} : palier ${palier}, aucun envoi possible`);
  const valide =
    ctx.validation !== undefined &&
    ctx.brouillon !== undefined &&
    ctx.validation.brouillonId === ctx.brouillon.id &&
    ctx.validation.empreinte === ctx.brouillon.empreinte;
  if (valide) return oui("brouillon validé par Mickaël");
  const cat = ctx.categorie;
  if (cat && perms.toujoursRemonter.includes(cat)) return non(`catégorie « ${cat} » : remonte toujours à Mickaël`, true);
  if (palier === "envoyer-seule" && cat && perms.canaux[canal].delegations.some((d) => d.categorie === cat)) {
    return oui(`délégation écrite pour « ${cat} »`);
  }
  return non(`${canal} : envoi soumis à la validation de Mickaël`, true);
}
