import { z } from "zod";

/**
 * One schema for every subject (internal pilot or external client). A subject
 * is a folder `<subjectsDir>/<id>/` holding three files:
 *   subject.yaml  identity, URLs, languages, markets, aliases, competitors,
 *                 optional repository, optional source documents
 *   panel.yaml    the versioned question panel
 *   facts.yaml    reference facts (extracted until the owner validates them)
 * Nothing in the tool's code refers to a subject by name (see
 * test/no-hardcoded-subjects.test.ts).
 */

export const SCHEMA_VERSION = 1;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const lang = z.string().regex(/^[a-z]{2}$/, "ISO 639-1 code, lower case");
const country = z.string().regex(/^[A-Z]{2}$/, "ISO 3166-1 alpha-2 code, upper case");
const httpsUrl = z.string().url().refine((u) => u.startsWith("https://"), "https URL expected");
const domain = z.string().regex(/^(?!https?:)[a-z0-9.-]+\.[a-z]{2,}$/, "bare domain, lower case, no scheme");

/** Proposed = suggested (by Claude, Elmo's assistant, or a document); confirmed = by the subject owner. */
export const ReviewStatus = z.enum(["proposed", "confirmed", "rejected"]);

export const AliasSchema = z
  .object({
    value: z.string().min(2),
    kind: z.enum(["name", "handle", "domain", "offer", "property", "person"]),
    status: ReviewStatus,
    note: z.string().optional(),
  })
  .strict();

export const CompetitorSchema = z
  .object({
    name: z.string().min(2),
    domains: z.array(domain).default([]),
    aliases: z.array(z.string()).default([]),
    category: z.string().min(2),
    markets: z.array(country).default([]),
    status: ReviewStatus,
    rationale: z.string().min(5),
  })
  .strict();

export const SourceDocumentSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    kind: z.enum(["url", "file", "owner-statement", "note"]),
    ref: z.string().min(1),
    description: z.string().min(3),
    addedAt: isoDate,
  })
  .strict();

export const SubjectSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "kebab-case id"),
    displayName: z.string().min(2),
    status: z.enum(["draft", "active", "paused", "archived"]),
    ownership: z.enum(["internal", "external"]),
    urls: z
      .object({
        primary: httpsUrl,
        additional: z
          .array(z.object({ url: httpsUrl, status: ReviewStatus, note: z.string().optional() }).strict())
          .default([]),
      })
      .strict(),
    languages: z.array(lang).min(1),
    markets: z
      .array(
        z
          .object({
            country,
            label: z.string().min(2),
            languages: z.array(lang).min(1),
            status: ReviewStatus,
          })
          .strict(),
      )
      .min(1),
    aliases: z.array(AliasSchema).min(1),
    competitors: z.array(CompetitorSchema).default([]),
    repository: z.object({ url: z.string().min(3), branch: z.string().default("main") }).strict().optional(),
    sources: z.array(SourceDocumentSchema).default([]),
    openQuestions: z.array(z.string()).default([]),
  })
  .strict();

/**
 * A prompt is immutable once written: changing its wording means adding a new
 * entry with the same `id` and `version + 1`, and retiring the old one
 * (`status: retired`, `supersededBy`). Old versions are never deleted, so a
 * before/after comparison can always tell which wording a run used.
 */
export const PromptSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    version: z.number().int().min(1),
    family: z.enum(["unbranded", "branded"]),
    language: lang,
    markets: z.array(country).min(1),
    /** Same pairId across languages = translations of one question. */
    pairId: z.string().optional(),
    text: z.string().min(10),
    origin: z.enum(["claude", "elmo-assistant", "owner", "document"]),
    status: z.enum(["active", "retired"]),
    supersededBy: z.number().int().optional(),
    createdAt: isoDate,
  })
  .strict();

export const PanelSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    /** Bumped whenever the set of active prompts changes. Only windows with the same panelVersion are compared. */
    panelVersion: z.number().int().min(1),
    status: z.enum(["draft", "validated"]),
    validatedBy: z.string().optional(),
    validatedAt: isoDate.optional(),
    limits: z
      .object({
        /** Active prompts per language: 10 in M0, 20 at most later. */
        maxPerLanguage: z.number().int().min(1).max(20).default(10),
        minBrandedPerLanguage: z.number().int().min(0).default(2),
      })
      .strict()
      .default({}),
    prompts: z.array(PromptSchema).min(1),
  })
  .strict();

/** Fait, extrait, inférence: anything not confirmed by the owner stays "extracted". */
export const FactSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    statement: z.string().min(5),
    language: lang,
    category: z.enum(["identity", "offer", "price", "location", "audience", "contact", "other"]),
    sourceId: z.string(),
    status: z.enum(["extracted", "validated", "rejected"]),
    validatedBy: z.string().optional(),
    validatedAt: isoDate.optional(),
    note: z.string().optional(),
  })
  .strict();

export const FactsSchema = z
  .object({ schemaVersion: z.literal(SCHEMA_VERSION), facts: z.array(FactSchema) })
  .strict();

export type Subject = z.infer<typeof SubjectSchema>;
export type Panel = z.infer<typeof PanelSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type Facts = z.infer<typeof FactsSchema>;
export type SubjectBundle = { dir: string; subject: Subject; panel: Panel; facts: Facts };
