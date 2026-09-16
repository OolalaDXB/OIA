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
        max_tokens: 4096,
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
        try {
          const data = req.schema.parse(JSON.parse(extractJson(text)));
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
        }
      }
      throw new Error(`Mistral extract failed to produce valid ${req.schemaName}: ${String(lastErr)}`);
    },
  };
}
