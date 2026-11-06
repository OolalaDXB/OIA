import { z } from "zod";

/**
 * One schema for every subject (internal pilot or external client). A subject
 * is a folder `<subjectsDir>/<id>/` holding three files:
 *   subject.yaml  identity, URLs, languages, markets, aliases, competitors,
 *                 optional repository, optional source documents
 *   panel.yaml    the versioned question panel
 *   facts.yaml    reference facts (extracted until the owner validates them)
 *   measurement.yaml  measurement windows and the freezes they impose
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
 * `candidate` = kept for a later, larger panel; never sent to Elmo.
 * `sourceId` / `sourceRef` = where the wording comes from (a declared source
 * document and the place in it), for prompts with origin "document".
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
    sourceId: z.string().optional(),
    sourceRef: z.string().optional(),
    note: z.string().optional(),
    status: z.enum(["active", "candidate", "retired"]),
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

/**
 * Measurement plan. A window is N consecutive days, 1 run per day per target.
 * A freeze forbids, for its scope, any publication that changes what search
 * engines and AI assistants see, until the end of the window it names. Agents
 * read active freezes before proposing any execution.
 */
export const WindowSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    kind: z.enum(["baseline", "follow-up"]),
    days: z.number().int().min(1).max(31),
    panelVersion: z.number().int().min(1),
    status: z.enum(["planned", "running", "done", "aborted"]),
    start: isoDate.optional(),
    end: isoDate.optional(),
    missingDays: z.array(z.object({ date: isoDate, reason: z.string().min(3) }).strict()).default([]),
    note: z.string().optional(),
  })
  .strict();

export const FreezeSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
    /** What must not publish changes: the subject's own site, its repository, off-site profiles. */
    scope: z.array(z.enum(["site", "repository", "off-site"])).min(1),
    rule: z.string().min(10),
    /** Freeze lasts until the end of this window (status done or aborted). */
    untilEndOfWindow: z.string(),
    covers: z.array(z.string()).default([]),
    allowed: z.array(z.string()).default([]),
    decidedBy: z.string().min(2),
    decidedAt: isoDate,
  })
  .strict();

/**
 * Engines measured for this subject, as Elmo model ids (the first segment of a
 * SCRAPE_TARGETS entry: chatgpt, claude, gemini, perplexity, mistral…).
 * `languages` restricts an engine to the panel languages it is measured on.
 * Elmo 0.7.7 selects engines per brand, not per prompt: an engine restricted
 * to some languages of a multilingual subject still answers the other prompts,
 * and those answers are excluded from reporting, never deleted.
 */
export const EngineSchema = z
  .object({
    model: z.string().regex(/^[a-z0-9-]+$/),
    /**
     * api = collected by Elmo through a provider API (model = Elmo model id);
     * manual = answers copied by hand from a consumer app (model = e.g. chatgpt-app),
     * captured with `subjects capture-template` / `capture-check`, never sent to Elmo.
     */
    collection: z.enum(["api", "manual"]).default("api"),
    /** Web search on for this engine (false = no cited URLs to expect). */
    webSearch: z.boolean().default(true),
    languages: z.array(lang).optional(),
    note: z.string().optional(),
  })
  .strict();

export const MeasurementSchema = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    engines: z.array(EngineSchema).min(1),
    windows: z.array(WindowSchema).min(1),
    freezes: z.array(FreezeSchema).default([]),
  })
  .strict();

export type Subject = z.infer<typeof SubjectSchema>;
export type Panel = z.infer<typeof PanelSchema>;
export type Prompt = z.infer<typeof PromptSchema>;
export type Facts = z.infer<typeof FactsSchema>;
export type Measurement = z.infer<typeof MeasurementSchema>;
export type SubjectBundle = { dir: string; subject: Subject; panel: Panel; facts: Facts; measurement: Measurement };
