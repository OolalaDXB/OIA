import { z } from "zod";

/**
 * Knowledge layer schemas (mandate §5, §12, §18, §19, §28, §29).
 * One canonical source per fact/capability; documents are OUTPUTS.
 * Hierarchy: Truth → Capability → Evidence → Match → Composition → Draft →
 * Human approval. Never: prompt → plausible story → assumed truth.
 */

// ── Provenance (§18) — mirrors the OIA provenance model ─────────────────────
export const KnowledgeSourceType = z.enum([
  "FOUNDER_DECLARED",
  "INTERNAL_DOCUMENT",
  "CODE_REPOSITORY",
  "SIGNED_DOCUMENT",
  "CUSTOMER_EVIDENCE",
  "EXTERNAL_SOURCE",
  "INFERRED",
]);
export type KnowledgeSourceType = z.infer<typeof KnowledgeSourceType>;

// ── Disclosure (§9, §10) — machine-readable, never a writer's memory ────────
export const Disclosure = z.enum([
  "EXTERNAL_OK", // may appear in external outputs
  "INTERNAL_ONLY", // never in external outputs without explicit human override
  "FORBIDDEN_EXTERNAL", // hard ban (e.g. Dixio) — no override path in code
]);
export type Disclosure = z.infer<typeof Disclosure>;

// ── Fact lifecycle (§19) ────────────────────────────────────────────────────
export const FactLifecycle = z.enum(["DRAFT", "REVIEWED", "CANONICAL", "SUPERSEDED"]);
export type FactLifecycle = z.infer<typeof FactLifecycle>;

export const ProvenanceSchema = z.object({
  sourceType: KnowledgeSourceType,
  sourceId: z.string(),
  locator: z.string().optional(),
  confidence: z.number().min(0).max(1),
  createdAt: z.string(),
  updatedAt: z.string(),
  approvedBy: z.string().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

export const FactSchema = z.object({
  id: z.string(),
  statement: z.string(),
  subject: z.string(), // product/entity/capability slug the fact is about
  lifecycle: FactLifecycle,
  disclosure: Disclosure,
  provenance: ProvenanceSchema,
  supersededBy: z.string().optional(),
  notes: z.string().optional(),
});
export type Fact = z.infer<typeof FactSchema>;

// ── Evidence maturity (§29) — explainable, not a pseudo-scientific score ────
export const EvidenceMaturity = z.enum([
  "DECLARED",
  "IMPLEMENTED",
  "TESTED",
  "DEPLOYED",
  "CUSTOMER_USED",
  "INDEPENDENTLY_VERIFIED",
]);
export type EvidenceMaturity = z.infer<typeof EvidenceMaturity>;

export const EvidenceItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  kind: z.enum(["REPOSITORY", "TEST_SUITE", "RELEASE", "RUN_OUTPUT", "DOCUMENT", "DEMO", "CUSTOMER_REFERENCE"]),
  locator: z.string(), // repo path, URL, doc id in source-documents/
  maturity: EvidenceMaturity,
  disclosure: Disclosure,
  provenance: ProvenanceSchema,
  notes: z.string().optional(),
});
export type EvidenceItem = z.infer<typeof EvidenceItemSchema>;

// ── Capability / brick registry (§11-12, §28) ───────────────────────────────
export const CapabilityStatus = z.enum([
  "EXPERIMENTAL",
  "INTERNAL",
  "PROVEN",
  "PRODUCTIZED",
  "SUBMISSION_READY",
]);
export type CapabilityStatus = z.infer<typeof CapabilityStatus>;

export const CapabilitySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(), // canonical description — approved language
  category: z.string(),
  technicalCapabilities: z.array(z.string()).default([]),
  businessCapabilities: z.array(z.string()).default([]),
  status: CapabilityStatus,
  maturity: EvidenceMaturity,
  usedBy: z.array(z.string()).default([]), // product slugs (may be empty: §32)
  implementations: z.array(z.string()).default([]), // repos/paths
  supportedEnvironments: z.array(z.string()).default([]),
  evidenceIds: z.array(z.string()).default([]),
  limitations: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  jurisdictions: z.array(z.string()).default([]),
  securityCharacteristics: z.array(z.string()).default([]),
  externalSafeClaims: z.array(z.string()).default([]), // pre-approved wording
  internalOnlyFactIds: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  synonyms: z.array(z.string()).default([]),
  provenance: ProvenanceSchema,
});
export type Capability = z.infer<typeof CapabilitySchema>;

// ── Entities (§7) — product != legal entity; location follows money ─────────
export const EntityStatusSchema = z.enum(["ACTIVE", "PLANNED", "HYPOTHETICAL"]);

export const EntitySchema = z.object({
  id: z.string(),
  name: z.string(),
  status: EntityStatusSchema,
  jurisdiction: z.string().optional(), // ABSENT for planned entities — never invented
  roles: z.array(z.string()).default([]), // e.g. "EU/FR funding route", "GCC commercial arm"
  eligibleGeographies: z.array(z.string()).default([]),
  /** Mobilisable delivery capacity ≠ current dedicated team (§8). */
  deliveryCapacity: z
    .object({
      type: z.enum(["DEDICATED", "MOBILISABLE", "NONE"]),
      description: z.string(),
      headcount: z.string().optional(), // e.g. "70+" — keep as approved wording
    })
    .optional(),
  disclosureNotes: z.array(z.string()).default([]),
  internalOnlyFactIds: z.array(z.string()).default([]),
  provenance: ProvenanceSchema,
});
export type Entity = z.infer<typeof EntitySchema>;

// ── Disclosure policy (§9, §10) ─────────────────────────────────────────────
export const DisclosurePolicySchema = z.object({
  id: z.string(),
  /** Names that must NEVER appear in an external output (hard gate). */
  forbiddenExternalNames: z.array(z.string()).default([]),
  /** Topics/patterns internal-only unless explicit human override. */
  internalOnlyPatterns: z.array(z.string()).default([]),
  /** Claims forbidden because no canonical fact establishes them. */
  forbiddenClaims: z.array(z.string()).default([]),
  rules: z.array(z.string()).default([]),
});
export type DisclosurePolicy = z.infer<typeof DisclosurePolicySchema>;

// ── Product dossier index ───────────────────────────────────────────────────
export const ProductSchema = z.object({
  slug: z.string(),
  name: z.string(),
  oneLine: z.string(), // canonical positioning line — approved language
  status: z.enum(["CONCEPT", "PRE_LAUNCH", "BUILD", "OPERATING"]),
  capabilities: z.array(z.string()).default([]), // capability ids
  entityRoutes: z.array(z.string()).default([]), // entity ids that can carry it
  factIds: z.array(z.string()).default([]),
  provenance: ProvenanceSchema,
});
export type Product = z.infer<typeof ProductSchema>;
