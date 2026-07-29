import { z } from "zod";

/**
 * Zod schemas for the domain vocabulary shared across packages. These mirror the
 * enums and jsonb payloads in docs/architecture/schema/0001_init.sql (which
 * Postgres cannot type on its own). Generated row types live in
 * `types.generated.ts` once the Supabase project is linked.
 */

// ── Enums (must match the SQL enums) ─────────────────────────────────────────

export const ClaimType = z.enum([
  "confirmed_official_fact",
  "extracted",
  "inference",
  "recommendation",
  "unresolved_uncertainty",
]);
export type ClaimType = z.infer<typeof ClaimType>;

export const OpportunityStatus = z.enum([
  "discovered",
  "qualifying",
  "qualified",
  "archived",
  "error",
]);
export type OpportunityStatus = z.infer<typeof OpportunityStatus>;

export const RecommendationAction = z.enum([
  "PURSUE",
  "CONSIDER",
  "MONITOR",
  "DISCARD",
]);
export type RecommendationAction = z.infer<typeof RecommendationAction>;

export const DeadlineStatus = z.enum(["open", "upcoming", "closed", "unknown"]);
export type DeadlineStatus = z.infer<typeof DeadlineStatus>;

export const SourceKind = z.enum(["official_programme", "aggregator", "manual"]);
export type SourceKind = z.infer<typeof SourceKind>;

export const EligibilityVerdict = z.enum([
  "eligible",
  "likely",
  "ineligible",
  "unknown",
]);
export type EligibilityVerdict = z.infer<typeof EligibilityVerdict>;

// ── Project profile (projects.profile jsonb) ─────────────────────────────────

export const LegalEntity = z.object({
  name: z.string(),
  jurisdiction: z.string(), // ISO-ish: "FR", "AE", "EU"
  role: z.enum(["applicant", "partner", "beneficiary"]),
});

export const AmountRange = z.object({
  min: z.number().nonnegative().optional(),
  max: z.number().nonnegative().optional(),
  currency: z.string().default("EUR"),
});

export const ProjectProfileSchema = z.object({
  slug: z.string().min(1),
  name: z.string().min(1),
  legalEntities: z.array(LegalEntity).default([]),
  sectors: z.array(z.string()).default([]),
  geographies: z.array(z.string()).default([]),
  stage: z.string().default(""),
  fundingTypes: z.array(z.string()).default([]),
  amountRange: AmountRange.optional(),
  keywords: z.array(z.string()).default([]),
  exclusions: z.array(z.string()).default([]),
});
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>;

// ── Eligibility assessment payload ───────────────────────────────────────────

export const EligibilityCriterion = z.object({
  criterion: z.string(),
  met: z.boolean().nullable(),
  note: z.string().optional(),
  evidenceId: z.string().uuid().optional(),
});

export const EligibilityAssessmentSchema = z.object({
  verdict: EligibilityVerdict,
  criteria: z.array(EligibilityCriterion).default([]),
  rationale: z.string().optional(),
});
export type EligibilityAssessment = z.infer<typeof EligibilityAssessmentSchema>;
