import { z } from "zod";
import { deriveStrategicRoute } from "@oia/scoring";

/**
 * Seed-dataset schema + validator (spec §1, §10). Seed `expected_*` fields are
 * HYPOTHESES to test, never ground truth. The validator also runs deterministic
 * internal-inconsistency checks so the seed's own claims are cross-examined
 * before ingestion. We never invent records — an absent file is reported, not
 * fabricated.
 */

const APP_ELIG = [
  "ELIGIBLE_TO_APPLY_NOW", "ELIGIBLE_TO_APPLY_VIA_EXISTING_ENTITY",
  "ELIGIBLE_TO_APPLY_VIA_PARTNER", "ELIGIBLE_TO_APPLY_VIA_CONSORTIUM",
  "NOT_CURRENTLY_ELIGIBLE_TO_APPLY", "UNKNOWN",
] as const;
const AWARD_ELIG = [
  "READY_FOR_AWARD", "REQUIRES_EXISTING_ENTITY_VALIDATION", "REQUIRES_NEW_ENTITY",
  "REQUIRES_RELOCATION", "REQUIRES_LOCAL_PARTNER", "REQUIRES_CONSORTIUM",
  "STRUCTURALLY_INELIGIBLE", "UNKNOWN",
] as const;
const STRATEGIC = [
  "ELIGIBLE_NOW", "ELIGIBLE_VIA_EXISTING_ENTITY", "ELIGIBLE_VIA_PARTNER",
  "ELIGIBLE_VIA_CONSORTIUM", "ELIGIBLE_AFTER_NEW_ENTITY", "ELIGIBLE_AFTER_RELOCATION",
  "STRUCTURALLY_INELIGIBLE", "UNKNOWN",
] as const;
const RECOMMENDATION = ["PURSUE", "PARTNER", "INVESTIGATE", "MONITOR", "REJECT"] as const;
const VERIFICATION = [
  "DISCOVERED_UNVERIFIED", "OFFICIAL_SOURCE_FOUND", "VERIFIED", "VERIFICATION_FAILED",
  "SOURCE_UNAVAILABLE", "MANUAL_REVIEW_REQUIRED", "REJECTED",
] as const;
const SOURCE_FORMAT = [
  "STATIC_HTML", "CLIENT_RENDERED_SPA", "PDF", "AUTHENTICATED", "BLOCKED", "UNSUPPORTED", "UNKNOWN",
] as const;

export const SeedRecordSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    issuer: z.string().min(1),
    officialUrl: z.string().url().optional(),
    discoveryUrl: z.string().url().optional(),
    applicationUrl: z.string().url().optional(),
    localArtifact: z.string().optional(), // links to an official-artifact manifest entry
    isAggregatorOnly: z.boolean().optional(),
    isClosedCall: z.boolean().optional(),
    // expected_* — hypotheses to test, not facts:
    expectedSourceFormat: z.enum(SOURCE_FORMAT).optional(),
    expectedVerificationStatus: z.enum(VERIFICATION).optional(),
    expectedApplicationEligibility: z.enum(APP_ELIG).optional(),
    expectedAwardEligibility: z.enum(AWARD_ELIG).optional(),
    expectedStrategicRoute: z.enum(STRATEGIC).optional(),
    expectedRecommendation: z.enum(RECOMMENDATION).optional(),
    expectedExtractedFacts: z.record(z.string(), z.unknown()).optional(),
    notes: z.string().optional(),
  })
  .passthrough()
  .refine((r) => r.officialUrl || r.discoveryUrl || r.applicationUrl || r.localArtifact, {
    message: "record needs at least one of officialUrl / discoveryUrl / applicationUrl / localArtifact",
  });

export type SeedRecord = z.infer<typeof SeedRecordSchema>;

export const SeedDatasetSchema = z.object({
  version: z.literal(1),
  records: z.array(SeedRecordSchema).min(1),
});
export type SeedDataset = z.infer<typeof SeedDatasetSchema>;

export interface SeedInconsistency {
  recordId: string;
  rule: string;
  detail: string;
}

/** Deterministic cross-field checks on the seed's OWN claims (spec §1, §10). */
export function detectSeedInconsistencies(dataset: SeedDataset): SeedInconsistency[] {
  const out: SeedInconsistency[] = [];
  const add = (recordId: string, rule: string, detail: string) => out.push({ recordId, rule, detail });

  for (const r of dataset.records) {
    // PURSUE requires a VERIFIED official source.
    if (r.expectedRecommendation === "PURSUE" && r.expectedVerificationStatus !== "VERIFIED") {
      add(r.id, "pursue-requires-verified", `expected PURSUE but verification is ${r.expectedVerificationStatus ?? "unset"} (must be VERIFIED)`);
    }
    if (r.expectedRecommendation === "PURSUE" && !r.officialUrl && !r.localArtifact) {
      add(r.id, "pursue-requires-primary-source", "expected PURSUE but no officialUrl/localArtifact");
    }
    // Seed's own derived route must match the deterministic derivation.
    if (r.expectedApplicationEligibility && r.expectedAwardEligibility && r.expectedStrategicRoute) {
      const derived = deriveStrategicRoute(r.expectedApplicationEligibility, r.expectedAwardEligibility);
      if (derived !== r.expectedStrategicRoute) {
        add(r.id, "strategic-route-mismatch", `seed route ${r.expectedStrategicRoute} ≠ derived ${derived} from (${r.expectedApplicationEligibility}, ${r.expectedAwardEligibility})`);
      }
    }
    // Structural ineligibility must not be recommended as anything but REJECT.
    if (r.expectedAwardEligibility === "STRUCTURALLY_INELIGIBLE" && r.expectedRecommendation && r.expectedRecommendation !== "REJECT") {
      add(r.id, "structural-ineligible-not-rejected", `award STRUCTURALLY_INELIGIBLE but recommendation is ${r.expectedRecommendation}`);
    }
    // Aggregator-only lead cannot carry confirmed financial facts or PURSUE.
    if (r.isAggregatorOnly) {
      if (r.expectedRecommendation === "PURSUE") add(r.id, "aggregator-cannot-pursue", "aggregator-only lead expected PURSUE");
      if (r.expectedVerificationStatus === "VERIFIED") add(r.id, "aggregator-cannot-verify", "aggregator-only lead expected VERIFIED");
      if (r.expectedExtractedFacts && Object.keys(r.expectedExtractedFacts).length > 0) {
        add(r.id, "aggregator-no-confirmed-facts", "aggregator-only lead carries expectedExtractedFacts (should be none)");
      }
    }
    // Closed call cannot remain an active PARTNER opportunity.
    if (r.isClosedCall && r.expectedRecommendation === "PARTNER") {
      add(r.id, "closed-call-not-partner", "closed call expected as active PARTNER (needs a separate derived lead)");
    }
    // New-entity conclusion for an EU/FR opportunity while Oolala France SAS exists.
    if (r.expectedStrategicRoute === "ELIGIBLE_AFTER_NEW_ENTITY") {
      const euish = `${r.issuer} ${r.title}`.toLowerCase();
      if (/(eu|europe|horizon|eic|digital|france|french|bpifrance)/.test(euish)) {
        add(r.id, "new-entity-vs-existing-fr", "route ELIGIBLE_AFTER_NEW_ENTITY for an EU/FR opportunity: Oolala France SAS already exists — must justify, else UNKNOWN");
      }
    }
  }
  return out;
}

export interface SeedValidation {
  ok: boolean;
  dataset?: SeedDataset;
  errors: string[];
  inconsistencies: SeedInconsistency[];
}

export function validateSeedDataset(raw: unknown): SeedValidation {
  const parsed = SeedDatasetSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
      inconsistencies: [],
    };
  }
  const ids = parsed.data.records.map((r) => r.id);
  const errors: string[] = [];
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length) errors.push(`duplicate record ids: ${[...new Set(dupes)].join(", ")}`);
  return {
    ok: errors.length === 0,
    dataset: parsed.data,
    errors,
    inconsistencies: detectSeedInconsistencies(parsed.data),
  };
}
