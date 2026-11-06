import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

/**
 * Mirror TypeScript du JSON Schema E2 (`schemas/recommendation.schema.json`).
 * Les deux sources sont tenues alignées par un test (`recommendation.test.ts`).
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);

export const RecommendationType = z.enum([
  "FIX_FACT",
  "CONTENT_GAP",
  "ENTITY_INCONSISTENCY",
  "SOURCE_TARGET",
  "TECH_FIX",
  "WATCH",
]);
export type RecommendationType = z.infer<typeof RecommendationType>;

export const EvidenceRef = z
  .object({
    kind: z.enum([
      "evidence-row",
      "crawlie-report",
      "crawlseo-row",
      "repo-file",
      "panel-prompt",
      "fact",
      "manual-capture",
      "other",
    ]),
    ref: z.string().min(1),
    sha256: sha256.optional(),
    note: z.string().optional(),
  })
  .strict();

export const FixKindZ = z.enum([
  "robots-txt",
  "sitemap-xml",
  "llms-txt",
  "jsonld-organization",
  "jsonld-local-business",
  "jsonld-product",
  "title",
  "meta-description",
  "price-ssr-placeholder",
  "noindex-removal",
  "manual",
]);

export const DecisionStatus = z.enum(["pending", "accepted", "rejected", "obsolete"]);

export const RecommendationSchema = z
  .object({
    id: z.string().regex(/^rec-[a-z0-9-]{6,}$/),
    schemaVersion: z.literal(1),
    type: RecommendationType,
    clientId: z.string().min(1),
    siteId: z.string().optional(),
    subjectId: z.string().min(1),
    title: z.string().min(3).max(140),
    statement: z.string().min(10),
    evidence: z.array(EvidenceRef).min(1),
    impact: z.object({ level: z.enum(["low", "medium", "high"]), note: z.string().optional() }).strict(),
    effort: z.object({ level: z.enum(["XS", "S", "M", "L", "XL"]), note: z.string().optional() }).strict(),
    risk: z.enum(["low", "medium", "high"]),
    confidence: z.enum(["low", "medium", "high"]),
    fix: z
      .object({ kind: FixKindZ, generator: z.string(), notes: z.string().optional() })
      .strict()
      .optional(),
    decision: z
      .object({
        status: DecisionStatus,
        by: z.string().optional(),
        at: isoDate.optional(),
        reason: z.string().optional(),
      })
      .strict(),
    createdBy: z.string().min(1),
    createdAt: isoDate,
    windowId: z.string().optional(),
  })
  .strict()
  .refine(
    (r) => !(r.risk === "high" && r.decision.status === "accepted"),
    "A high-risk recommendation cannot be accepted by an agent alone (see E3 for the human check).",
  );

export type Recommendation = z.infer<typeof RecommendationSchema>;

export function loadRecommendationJsonSchema(): object {
  const here = dirname(fileURLToPath(import.meta.url));
  const p = join(here, "..", "schemas", "recommendation.schema.json");
  return JSON.parse(readFileSync(p, "utf8"));
}
