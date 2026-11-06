import { createHash } from "node:crypto";

/**
 * Single LLM access surface for OIA Visibility. Any function that will later
 * need a model goes through this contract. G1 completes the adapter list;
 * A0b establishes the interface and ships the deterministic fictive impl
 * the tests of B2, D3, F3 and F4 use.
 *
 * Alignment with `packages/providers`: the pre-existing `LLMProvider.extract`
 * is a *schema-based* extractor (Zod → T). We keep it unchanged and wrap it
 * in one of the methods here (`extract`). The other methods — reformulation,
 * writing, review, synthesis — are the new surface this mandate needs.
 *
 * Nothing in this file calls a real provider. Nothing in this file reads an
 * environment variable. Branching a real model later = writing a new adapter
 * and wiring it in the dispatcher (G1), no change here.
 */

/**
 * Logical purposes a Visibility function can ask the model to perform. The
 * dispatcher reads a config keyed by purpose to pick a model, a plafond and
 * a provider. Adding a purpose is a code change, not a config change: it
 * means a new feature.
 */
export type LLMPurpose =
  | "panel.reformulate"
  | "panel.suggest"
  | "facts.extract"
  | "content.write"
  | "report.review"
  | "report.summarize";

export interface LLMUsage {
  provider: string;
  model: string;
  promptHash: string;
  purpose: LLMPurpose;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface LLMResult<T> {
  data: T;
  usage: LLMUsage;
}

/** `reformulate`: one input phrasing → one output phrasing. */
export interface ReformulateRequest {
  purpose: Extract<LLMPurpose, "panel.reformulate">;
  system: string;
  input: string;
  /** Optional: target language ISO 639-1 when the phrasing must switch. */
  targetLanguage?: string;
  model?: string;
}

/** `suggest`: free-form text → list of candidate strings. */
export interface SuggestRequest {
  purpose: Extract<LLMPurpose, "panel.suggest">;
  system: string;
  input: string;
  /** Upper bound on items returned. */
  limit?: number;
  model?: string;
}

/**
 * `extract`: free-form text → structured object. The real adapter will parse
 * and validate against a caller-provided Zod schema (see `packages/providers`
 * for the same shape). Here we keep the interface deliberately generic so
 * callers can import Zod where they need it.
 */
export interface ExtractRequest<T> {
  purpose: Extract<LLMPurpose, "facts.extract">;
  schemaName: string;
  system: string;
  input: string;
  /** Parses raw provider output into T; throws on invalid. */
  parse: (raw: unknown) => T;
  model?: string;
}

/** `write`: prompt → long-form text (introductions, FAQ answers, meta descriptions). */
export interface WriteRequest {
  purpose: Extract<LLMPurpose, "content.write">;
  system: string;
  input: string;
  /** Soft target; no hard cut. */
  maxChars?: number;
  model?: string;
}

/** `review`: a full report plus a role → a list of findings. */
export interface ReviewRequest {
  purpose: Extract<LLMPurpose, "report.review">;
  system: string;
  /** The report body under review. */
  report: string;
  /** Who the reviewer is (`seo`, `aeo`, `conversion`…). */
  reviewerRole: string;
  model?: string;
}

/** `summarize`: a long structured input → a short, structured summary. */
export interface SummarizeRequest {
  purpose: Extract<LLMPurpose, "report.summarize">;
  system: string;
  input: string;
  maxChars?: number;
  model?: string;
}

/** Output types per purpose. */
export interface SuggestOutput {
  items: string[];
}
export interface ReviewOutput {
  findings: Array<{ kind: "error" | "missing-evidence" | "nuance"; text: string }>;
}
export interface TextOutput {
  text: string;
}

export interface VisibilityLLM {
  readonly name: string;
  readonly defaultModel: string;
  reformulate(req: ReformulateRequest): Promise<LLMResult<TextOutput>>;
  suggest(req: SuggestRequest): Promise<LLMResult<SuggestOutput>>;
  extract<T>(req: ExtractRequest<T>): Promise<LLMResult<T>>;
  write(req: WriteRequest): Promise<LLMResult<TextOutput>>;
  review(req: ReviewRequest): Promise<LLMResult<ReviewOutput>>;
  summarize(req: SummarizeRequest): Promise<LLMResult<TextOutput>>;
}

/**
 * Stable hash of a request. Equal requests across runs yield the exact same
 * hash; used by the fictive implementation to be deterministic without
 * holding state across calls.
 */
export function llmPromptHash(fields: {
  purpose: LLMPurpose;
  system: string;
  input: string;
  model?: string;
  extra?: string;
}): string {
  const h = createHash("sha256");
  h.update(fields.purpose);
  h.update("\n");
  h.update(fields.system);
  h.update("\n");
  h.update(fields.input);
  if (fields.model) {
    h.update("\n");
    h.update(fields.model);
  }
  if (fields.extra) {
    h.update("\n");
    h.update(fields.extra);
  }
  return h.digest("hex");
}

/**
 * Deterministic fictive implementation. A handler per purpose receives the
 * raw request and returns the payload; equal input ⇒ equal output. No
 * randomness, no network, no state. Tests supply the handlers they need;
 * missing handler ⇒ the call throws, so a test that reaches an unprepared
 * code path fails loudly rather than returning empty data.
 *
 * **Fictional data flag**: callers are expected to render any text produced
 * here under an explicit "donnée fictive" label (règle 13).
 */
export interface FakeHandlers {
  "panel.reformulate"?: (req: ReformulateRequest) => TextOutput;
  "panel.suggest"?: (req: SuggestRequest) => SuggestOutput;
  "facts.extract"?: (req: ExtractRequest<unknown>) => unknown;
  "content.write"?: (req: WriteRequest) => TextOutput;
  "report.review"?: (req: ReviewRequest) => ReviewOutput;
  "report.summarize"?: (req: SummarizeRequest) => TextOutput;
}

export function createFakeVisibilityLLM(
  handlers: FakeHandlers = {},
  opts: { name?: string; model?: string } = {},
): VisibilityLLM {
  const name = opts.name ?? "fake";
  const model = opts.model ?? "fake-model";

  function usage(purpose: LLMPurpose, system: string, input: string, callerModel?: string): LLMUsage {
    return {
      provider: name,
      model: callerModel ?? model,
      purpose,
      promptHash: llmPromptHash({ purpose, system, input, model: callerModel ?? model }),
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }

  function missing(purpose: LLMPurpose): never {
    throw new Error(`fake LLM has no handler for purpose "${purpose}"`);
  }

  return {
    name,
    defaultModel: model,
    async reformulate(req) {
      const h = handlers["panel.reformulate"];
      if (!h) missing(req.purpose);
      return { data: h(req), usage: usage(req.purpose, req.system, req.input, req.model) };
    },
    async suggest(req) {
      const h = handlers["panel.suggest"];
      if (!h) missing(req.purpose);
      const out = h(req);
      const capped = typeof req.limit === "number" ? { items: out.items.slice(0, req.limit) } : out;
      return { data: capped, usage: usage(req.purpose, req.system, req.input, req.model) };
    },
    async extract<T>(req: ExtractRequest<T>) {
      const h = handlers["facts.extract"];
      if (!h) missing(req.purpose);
      const raw = h(req as ExtractRequest<unknown>);
      const data = req.parse(raw);
      return {
        data,
        usage: usage(req.purpose, req.system, req.input, req.model),
      };
    },
    async write(req) {
      const h = handlers["content.write"];
      if (!h) missing(req.purpose);
      return { data: h(req), usage: usage(req.purpose, req.system, req.input, req.model) };
    },
    async review(req) {
      const h = handlers["report.review"];
      if (!h) missing(req.purpose);
      return {
        data: h(req),
        usage: usage(req.purpose, req.system, req.report, req.model),
      };
    },
    async summarize(req) {
      const h = handlers["report.summarize"];
      if (!h) missing(req.purpose);
      return { data: h(req), usage: usage(req.purpose, req.system, req.input, req.model) };
    },
  };
}

/**
 * Convenience: a fake that refuses every purpose. Useful in tests that want
 * to prove the surrounding code does not reach the LLM at all.
 */
export function createRefusingLLM(name = "refusing"): VisibilityLLM {
  return createFakeVisibilityLLM({}, { name });
}
