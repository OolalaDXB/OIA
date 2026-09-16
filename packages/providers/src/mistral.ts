import type { LLMProvider, ExtractRequest, LLMResult } from "./types";
import { promptHash } from "./types";

/**
 * Mistral adapter — the default provider for OIA.
 *
 * Chosen deliberately rather than by habit: OIA works for a studio whose own
 * positioning is European sovereignty (BAWABA is a sovereign AI control plane),
 * so the model reading French and Emirati funding pages runs on a European
 * provider. It is also the provider the studio has already exercised live.
 *
 * Mistral's chat API takes a `response_format: {type: "json_object"}` which is
 * a real constraint rather than a request in the prompt, so the JSON comes back
 * parseable far more often than with prose-fenced output. The fence-stripping
 * fallback stays anyway, because "far more often" is not "always".
 *
 * The contract from `types.ts` holds here and is the whole point: the model
 * EXTRACTS and PROPOSES. It never certifies a fact. Everything it returns is
 * carried into the pipeline as a claim with its source, and the deterministic
 * gate decides what that claim is worth.
 */
export interface MistralConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Hard ceiling on calls for one process. Exceeded → throws rather than spends. */
  maxCalls?: number;
  /** Output ceiling per call. Too low truncates JSON mid-array; see below. */
  maxOutputTokens?: number;
  /**
   * Called with the model's raw text for every call, before any parsing.
   *
   * Exists because a schema silently turned 36,823 tokens of real output into
   * an empty result and reported success. Whatever the parse then does, the
   * answer to "what did the model actually say" has to be recoverable.
   */
  onRawResponse?: (raw: { purpose: string; text: string }) => void;
}

/**
 * Unwrap the schema-name envelope.
 *
 * The system suffix below literally says 'a single JSON object for "X"', and
 * models obey it exactly: they return {"X": {...}}. This cost a full run on the
 * scout and another on the analyst before it was recognised as one problem
 * rather than two — it is a quirk of how we ASK, so it belongs here, next to the
 * asking, rather than being re-solved in every schema that meets it.
 *
 * Only a lone object-valued key is unwrapped. A response with real content
 * beside the wrapper is left exactly as it came.
 */
export function unwrapEnvelope(value: unknown, schemaName: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length !== 1) return value;
  const inner = obj[keys[0]!];
  if (typeof inner !== "object" || inner === null || Array.isArray(inner)) return value;
  // Unwrap whether or not the key matches the schema name: a model that wrapped
  // in "result" or "response" made the same move for the same reason.
  void schemaName;
  return inner;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

/** What one process has spent, so a run can report it instead of guessing. */
export interface MistralUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
}

export interface MistralProvider extends LLMProvider {
  usage(): MistralUsage;
}

export function createMistralProvider(config: MistralConfig): MistralProvider {
  const baseUrl = config.baseUrl ?? "https://api.mistral.ai/v1/chat/completions";
  const doFetch = config.fetchImpl ?? fetch;
  const maxCalls = config.maxCalls ?? Number.POSITIVE_INFINITY;
  const spent: MistralUsage = { calls: 0, inputTokens: 0, outputTokens: 0 };

  async function call(system: string, user: string, model: string) {
    if (spent.calls >= maxCalls) {
      // A budget that is only advisory is not a budget. Stopping mid-run is the
      // point: an unbounded agent loop against a paid API is exactly the failure
      // nobody notices until the invoice.
      throw new Error(`mistral: call budget of ${maxCalls} exhausted — stopping rather than spending more`);
    }
    spent.calls += 1;

    const res = await doFetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Native JSON mode: a constraint, not a polite request in the prompt.
        response_format: { type: "json_object" },
        temperature: 0,
        // A listing page with twenty programmes does not fit in 4096 tokens.
        // It did not fail loudly either: the JSON came back cut off mid-array
        // and surfaced as a generic parse error ("Expected ',' or ']' at
        // position 12035"), which reads like a model problem and is a ceiling
        // problem.
        max_tokens: config.maxOutputTokens ?? 16_000,
      }),
    });
    if (!res.ok) {
      throw new Error(`Mistral API error ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }
    const json = (await res.json()) as {
      choices: Array<{ message?: { content?: string } }>;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    spent.inputTokens += json.usage?.prompt_tokens ?? 0;
    spent.outputTokens += json.usage?.completion_tokens ?? 0;
    return { text: json.choices[0]?.message?.content ?? "", usage: json.usage };
  }

  return {
    name: "mistral",
    defaultModel: config.model,
    usage: () => ({ ...spent }),

    async extract<T>(req: ExtractRequest<T>): Promise<LLMResult<T>> {
      const model = req.model ?? config.model;
      const system = `${req.system}\n\nReturn ONLY a single JSON object for "${req.schemaName}". No prose, no markdown.`;

      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        const { text, usage } = await call(system, req.input, model);
        config.onRawResponse?.({ purpose: req.purpose, text });
        try {
          const data = req.schema.parse(unwrapEnvelope(JSON.parse(extractJson(text)), req.schemaName));
          return {
            data,
            run: {
              provider: "mistral",
              model,
              promptHash: promptHash(system, req.input, req.schemaName),
              inputTokens: usage?.prompt_tokens,
              outputTokens: usage?.completion_tokens,
            },
          };
        } catch (err) {
          lastErr = err;
          // A budget stop is final: retrying would be the one thing the cap exists
          // to prevent.
          if (err instanceof Error && err.message.includes("call budget")) throw err;
          // Truncated output is not a model failing to follow instructions; it
          // is our ceiling cutting it off. Retrying identically would truncate
          // identically, so say what happened instead of burning another call.
          // Truncation looks like JSON that STARTS and never finishes. Output
          // that never looked like JSON at all is a different failure and is
          // still worth one retry.
          const looksTruncated = text.trimStart().startsWith("{") && !text.trimEnd().endsWith("}");
          if (err instanceof SyntaxError && looksTruncated) {
            throw new Error(
              `Mistral output was cut off at ${text.length} characters — raise maxOutputTokens (currently ${config.maxOutputTokens ?? 16_000}).`,
            );
          }
        }
      }
      throw new Error(`Mistral extract failed to produce valid ${req.schemaName}: ${String(lastErr)}`);
    },
  };
}
