import { z } from "zod";
import { ProjectProfileSchema } from "@oia/database/schemas";

/**
 * The project registry — OIA's answer to "who is this system working for?".
 *
 * One YAML file per project under `registry/projects/`. Adding a project
 * (today's or next year's) is adding ONE file: no code change, no redeploy of
 * anything but the generated snapshot. The registry is the single place that
 * decides which profiles the matcher, the worker and the console see.
 *
 * The matching signals (`sectors` / `keywords` / `geographies`) are exactly the
 * existing `ProjectProfile` from @oia/database — no DTO is redefined. The
 * registry adds only what a multi-project workspace needs on top: identity,
 * lifecycle status, which opportunity kinds are worth watching, per-project
 * discovery hints, and — the honesty bit — whether the owner has actually
 * confirmed the profile or it is still Claude's working hypothesis.
 */

export const PROJECT_KINDS = [
  "PRODUCT", // software the studio builds and operates
  "VENTURE", // a business, not primarily software
  "ADVISORY", // consulting / dossier work
  "FOUNDATION", // non-profit vehicle
  "STUDIO", // the studio itself (its own funding + tender pipeline)
] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];

/** Lifecycle vocabulary, aligned with the studio's public status pills. */
export const PROJECT_STATUSES = [
  "LIVE",
  "PRIVATE_BETA",
  "IN_DEVELOPMENT",
  "PROTOTYPE",
  "CONCEPT",
  "ON_HOLD",
  "DOSSIER_ON_REQUEST",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const OPPORTUNITY_KINDS_WATCHED = [
  "GRANT",
  "TENDER_RFP",
  "VC_INVESTOR",
  "REGULATORY",
] as const;

/**
 * Where a profile's content comes from and whether a human signed it off.
 * A DRAFT profile is a hypothesis: the console labels it as such, so a wrong
 * keyword is visible and fixable in one file rather than silently steering the
 * whole pipeline.
 */
export const ProfileReviewSchema = z.object({
  status: z.enum(["DRAFT", "CONFIRMED_BY_OWNER"]),
  /** Required for CONFIRMED_BY_OWNER (ISO date). */
  confirmedAt: z.string().optional(),
  /** Where the profile content was derived from — provenance, not decoration. */
  derivedFrom: z.array(z.string()).default([]),
  note: z.string().default(""),
});
export type ProfileReview = z.infer<typeof ProfileReviewSchema>;

/**
 * Per-project discovery hints consumed by the connectors. Absent or disabled
 * means "this project is tracked in the workspace but no automated discovery
 * runs for it" — an honest state, not a silent no-op.
 */
export const DiscoverySchema = z.object({
  enabled: z.boolean().default(false),
  /**
   * Free-text search terms.
   *
   * NOT CONSUMED YET. The TED expert query is built from `cpvCodes`,
   * `countries` and the recency floor only — these terms reach no connector
   * today. They are kept because they are the right content for the full-text
   * clause and for the SEDIA keyword search, and wiring them is roadmap S1
   * (validated against the live API with `checkQuerySyntax`). Until then the
   * console labels them as unused rather than implying a search that does not
   * happen.
   */
  queryTerms: z.array(z.string()).default([]),
  /** EU CPV codes for tender discovery (TED). */
  cpvCodes: z.array(z.string()).default([]),
  /** Buyer countries bounding discovery — TED expert syntax wants ISO 3-letter (FRA, LUX). */
  countries: z.array(z.string()).default([]),
  /** Opportunity kinds worth surfacing for this project. */
  watch: z.array(z.enum(OPPORTUNITY_KINDS_WATCHED)).default(["GRANT"]),
});
export type Discovery = z.infer<typeof DiscoverySchema>;

export const ProjectEntrySchema = ProjectProfileSchema.extend({
  kind: z.enum(PROJECT_KINDS),
  status: z.enum(PROJECT_STATUSES),
  /** One line, in the owner's own public words where one exists. */
  oneLiner: z.string().default(""),
  /** Public site / product URL, when there is one. */
  url: z.string().optional(),
  /** Set false to keep a profile in the repo but out of every surface. */
  active: z.boolean().default(true),
  discovery: DiscoverySchema.default({}),
  profileReview: ProfileReviewSchema,
});
export type ProjectEntry = z.infer<typeof ProjectEntrySchema>;

/** The whole registry as the rest of the system consumes it. */
export interface ProjectRegistry {
  projects: ProjectEntry[];
  /** ISO timestamp of the generated snapshot (empty when loaded from disk). */
  generatedAt: string;
}

export const ProjectRegistrySnapshotSchema = z.object({
  generatedAt: z.string(),
  projects: z.array(ProjectEntrySchema),
});
