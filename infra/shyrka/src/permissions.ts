import { readFileSync } from "node:fs";
import { z } from "zod";

/**
 * Paliers de permission des agents de Shyrka (mandat v6, B5 ; CADRE.md) :
 *
 * - palier 0 : lecture ;
 * - palier 1 : brouillon ;
 * - palier 2 : envoi seul, catégorie par catégorie, uniquement pour les
 *   catégories validées par Mickaël.
 *
 * Le palier 2 est désactivé par défaut. Seul Mickaël l'active, catégorie par
 * catégorie, en éditant infra/shyrka/permissions.json. Aucun agent ne peut
 * modifier cette configuration : ce module n'offre que la lecture, et un
 * test vérifie qu'aucun code de Shyrka n'écrit ce fichier.
 */
export const AGENTS = ["courrier", "whatsapp"] as const;
export type Agent = (typeof AGENTS)[number];
export type Palier = 0 | 1 | 2;

const Date_ = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const MICKAEL = z.literal("Mickaël Thomas");

const CategorieEnvoi = z
  .object({
    categorie: z.string().min(1),
    valideePar: MICKAEL,
    le: Date_,
  })
  .strict();

const AgentSchema = z
  .object({
    palier: z.union([z.literal(0), z.literal(1), z.literal(2)]),
    envoiSeul: z.array(CategorieEnvoi).default([]),
  })
  .strict()
  .refine((a) => a.palier === 2 || a.envoiSeul.length === 0, { message: "Des catégories d'envoi seul n'ont de sens qu'au palier 2." });

export const PermissionsSchema = z
  .object({
    version: z.number().int().min(1),
    date: Date_,
    accordePar: MICKAEL,
    agents: z.object({ courrier: AgentSchema, whatsapp: AgentSchema }).strict(),
  })
  .strict();

export type Permissions = z.infer<typeof PermissionsSchema>;

/** Valeur par défaut et de repli : lecture seule, aucun envoi. */
export const PERMISSIONS_PAR_DEFAUT: Permissions = {
  version: 1,
  date: "2026-11-08",
  accordePar: "Mickaël Thomas",
  agents: { courrier: { palier: 0, envoiSeul: [] }, whatsapp: { palier: 0, envoiSeul: [] } },
};

export function loadPermissions(path: string, read: (p: string) => string = (p) => readFileSync(p, "utf8")): { permissions: Permissions; warning?: string } {
  let raw: string;
  try {
    raw = read(path);
  } catch {
    return { permissions: PERMISSIONS_PAR_DEFAUT, warning: `Permissions introuvables (${path}) : palier 0 partout.` };
  }
  try {
    const parsed = PermissionsSchema.safeParse(JSON.parse(raw));
    if (parsed.success) return { permissions: parsed.data };
    const i = parsed.error.issues[0];
    return { permissions: PERMISSIONS_PAR_DEFAUT, warning: `Permissions invalides (${i?.path.join(".")} : ${i?.message}) : palier 0 partout.` };
  } catch {
    return { permissions: PERMISSIONS_PAR_DEFAUT, warning: "Permissions illisibles (JSON) : palier 0 partout." };
  }
}

export type Action = "lire" | "brouillon" | "envoyer";

/** Décide si un agent peut faire une action. L'envoi exige le palier 2 et une catégorie validée. */
export function autorise(perms: Permissions, agent: Agent, action: Action, categorie?: string): { ok: boolean; raison: string } {
  const a = perms.agents[agent];
  if (action === "lire") return { ok: true, raison: `palier ${a.palier}` };
  if (action === "brouillon") return a.palier >= 1 ? { ok: true, raison: `palier ${a.palier}` } : { ok: false, raison: `${agent} : palier 0, lecture seule` };
  if (a.palier < 2) return { ok: false, raison: `${agent} : palier ${a.palier}, envoi désactivé` };
  if (!categorie || !a.envoiSeul.some((c) => c.categorie === categorie)) return { ok: false, raison: `${agent} : catégorie « ${categorie ?? "?"} » non validée par Mickaël pour l'envoi` };
  return { ok: true, raison: `envoi seul validé par Mickaël pour « ${categorie} »` };
}
