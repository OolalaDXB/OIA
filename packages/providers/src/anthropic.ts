import type { LLMProvider, ExtractRequest, LLMResult } from "./types";
import { promptHash } from "./types";

/**
 * Anthropic adapter (default provider, OD-2). Uses the Messages API and asks the
 * model to return a single JSON object matching the requested schema; the result
 * is Zod-validated with one repair retry. This keeps the integration
 * provider-neutral (no vendor-specific tool schema conversion leaks upward).
 *
 * NOTE: live calls are exercised only at runtime, not in CI.
 */
export interface AnthropicConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

export function createAnthropicProvider(config: AnthropicConfig): LLMProvider {
  const baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1/messages";
  const doFetch = config.fetchImpl ?? fetch;

  async function call(system: string, user: string, model: string) {
    const res = await doFetch(baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": config.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system,
        messages: [{ role: "user", content: user }],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic API error ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = json.content.find((c) => c.type === "text")?.text ?? "";
    return { text, usage: json.usage };
  }

  return {
    name: "anthropic",
    defaultModel: config.model,
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
              provider: "anthropic",
              model,
              promptHash: promptHash(system, req.input, req.schemaName),
              inputTokens: usage?.input_tokens,
              outputTokens: usage?.output_tokens,
            },
          };
        } catch (err) {
          lastErr = err;
        }
      }
      throw new Error(
        `Anthropic extract failed to produce valid ${req.schemaName}: ${String(lastErr)}`,
      );
    },
  };
}
