import { z } from "zod";

/**
 * Modèle de mission SEO Command (E5). Une mission regroupe un travail que
 * l'équipe fait pour un sujet, à un moment donné, avec un budget réservé.
 * Jamais exécutée sans validation humaine quand elle aboutit à une écriture.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const MissionType = z.enum([
  "audit-technique",
  "audit-seo",
  "measure-aeo-window",
  "post-deploy-analysis",
  "competitive-watch",
  "report-review",
]);
export type MissionType = z.infer<typeof MissionType>;

export const MissionState = z.enum([
  "planned",            // Dans la file, pas démarrée.
  "waiting-budget",     // Budget refusé, retentera quand le plafond le permet.
  "running",            // Prise par un exécuteur.
  "waiting-validation", // Produite une écriture ; attend une identité humaine owner.
  "done",               // Terminée (lecture uniquement ou validation acceptée).
  "failed",             // Erreur non récupérable.
  "cancelled",          // Annulée par un humain.
]);
export type MissionState = z.infer<typeof MissionState>;

export const MissionTrigger = z.enum([
  "manual",
  "scheduler",
  "window-end",
  "deploy-detected",
  "pr-merged",
  "threshold-alert",
]);
export type MissionTrigger = z.infer<typeof MissionTrigger>;

export const MissionSchema = z
  .object({
    id: z.string().regex(/^msn-[a-z0-9-]{6,}$/),
    type: MissionType,
    clientId: z.string(),
    siteId: z.string().optional(),
    subjectId: z.string(),
    trigger: MissionTrigger,
    agents: z.array(z.string()).min(1),
    reservedBudgetUsd: z.number().min(0),
    actualCostUsd: z.number().min(0).default(0),
    state: MissionState,
    createdAt: isoDate,
    updatedAt: isoDate,
    results: z
      .object({
        recommendationIds: z.array(z.string()).default([]),
        evidenceIds: z.array(z.string()).default([]),
        notes: z.string().optional(),
      })
      .default({ recommendationIds: [], evidenceIds: [] }),
    /** Qui a levé la mise en attente de validation ? (identité humaine owner, voir règle 16). */
    validatedBy: z.string().optional(),
    validatedAt: isoDate.optional(),
    /** Pour la post-deploy-analysis : la PR fusionnée qui a déclenché. */
    sourcePrRef: z.string().optional(),
  })
  .strict();

export type Mission = z.infer<typeof MissionSchema>;

export const VALID_TRANSITIONS: Record<MissionState, MissionState[]> = {
  planned: ["running", "waiting-budget", "cancelled"],
  "waiting-budget": ["planned", "cancelled"],
  // running → waiting-budget : le budget peut être refusé après le claim
  // (un autre worker a reservé avant). Dans ce cas on rend la mission à la
  // file en marquant « attend un budget » ; un `reap()` suivant la remet
  // à planned quand le plafond le permet.
  running: ["waiting-budget", "waiting-validation", "done", "failed"],
  "waiting-validation": ["done", "failed", "cancelled"],
  done: [],
  failed: [],
  cancelled: [],
};

export function canTransition(from: MissionState, to: MissionState): boolean {
  return VALID_TRANSITIONS[from].includes(to);
}
