import type { LLMProvider, ExtractRequest, LLMResult } from "./types";
import { promptHash } from "./types";
import { unwrapEnvelope } from "./mistral";

/**
 * Adapter for the OpenAI chat-completions protocol, shared by two providers:
 *
 *  - **openai**: OpenAI itself (ChatGPT models);
 *  - **openrouter**: OpenRouter, which serves Gemini (`google/…`), Perplexity
 *    (`perplexity/…`), Grok (`x-ai/…`) and others behind the same protocol and one key.
 *
 * Decision of Mickaël (16 November 2026): the LLMs used by OIA Visibility are also
 * available to OIA's other functions, through this package, as before for Mistral.
 * The contract from `types.ts` is unchanged: the model EXTRACTS and PROPOSES; it never
 * certifies a fact.
 *
 * Same safeguards as Mistral: native JSON mode, temperature 0, a hard call budget per
 * process, bounded retries on 429/5xx, one repair retry on unparseable output, and a
 * clear message when the output was cut off by the token ceiling.
 *
 * NOTE: live calls are exercised only at runtime, not in CI.
 */
export interface OpenAICompatibleConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Hard ceiling on calls for one process. Exceeded → throws rather than spends. */
  maxCalls?: number;
  maxOutputTokens?: number;
  retryBaseMs?: number;
  onRawResponse?: (raw: { purpose: string; text: string }) => void;
  /** OpenRouter only: attribution headers it recommends. Never personal data. */
  appTitle?: string;
}

export interface ProviderUsage {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  /** Cost reported by the provider itself (OpenRouter returns it), when it does. */
  costUsd: number;
}

export interface MeteredProvider extends LLMProvider {
  usage(): ProviderUsage;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? text).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  return start >= 0 && end > start ? candidate.slice(start, end + 1) : candidate;
}

const DEFAULT_URL = {
  openai: "https://api.openai.com/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  xai: "https://api.x.ai/v1/chat/completions",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  perplexity: "https://api.perplexity.ai/chat/completions",
} as const;

type CompatibleName = keyof typeof DEFAULT_URL;
const LABEL: Record<CompatibleName, string> = { openai: "OpenAI", openrouter: "OpenRouter", xai: "xAI", gemini: "Gemini", perplexity: "Perplexity" };

function createOpenAICompatibleProvider(name: CompatibleName, config: OpenAICompatibleConfig): MeteredProvider {
  const baseUrl = config.baseUrl ?? DEFAULT_URL[name];
  const doFetch = config.fetchImpl ?? fetch;
  const maxCalls = config.maxCalls ?? Number.POSITIVE_INFINITY;
  const label = LABEL[name];
  const spent: ProviderUsage = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };

  type Usage = { prompt_tokens?: number; completion_tokens?: number; cost?: number };

  async function call(system: string, user: string, model: string, attempt = 0): Promise<{ text: string; usage?: Usage }> {
    if (attempt === 0 && spent.calls >= maxCalls) {
      throw new Error(`${name}: call budget of ${maxCalls} exhausted — stopping rather than spending more`);
    }
    if (attempt === 0) spent.calls += 1;

    const headers: Record<string, string> = {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${config.apiKey}`,
    };
    if (name === "openrouter" && config.appTitle) headers["x-title"] = config.appTitle;

    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      // Perplexity n'accepte pas json_object (seulement json_schema) : JSON demandé par le prompt,
      // puis extrait et validé comme pour les autres.
      ...(name === "perplexity" ? {} : { response_format: { type: "json_object" } }),
      temperature: 0,
      max_tokens: config.maxOutputTokens ?? 16_000,
    };
    // OpenRouter reports the real cost of the call when asked.
    if (name === "openrouter") body.usage = { include: true };

    const res = await doFetch(baseUrl, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const text = (await res.text()).slice(0, 300);
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < 3) {
        const header = res.headers.get("retry-after");
        const fromHeader = header !== null && header.trim() !== "" ? Number(header) : Number.NaN;
        const waitMs = Number.isFinite(fromHeader)
          ? Math.max(0, fromHeader) * 1000
          : (config.retryBaseMs ?? 2000) * 2 ** attempt;
        await new Promise((r) => setTimeout(r, waitMs));
        return call(system, user, model, attempt + 1);
      }
      throw new Error(`${label} API error ${res.status}: ${text}`);
    }
    const json = (await res.json()) as { choices: Array<{ message?: { content?: string } }>; usage?: Usage };
    spent.inputTokens += json.usage?.prompt_tokens ?? 0;
    spent.outputTokens += json.usage?.completion_tokens ?? 0;
    spent.costUsd += json.usage?.cost ?? 0;
    return { text: json.choices[0]?.message?.content ?? "", usage: json.usage };
  }

  return {
    name,
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
              provider: name,
              model,
              promptHash: promptHash(system, req.input, req.schemaName),
              inputTokens: usage?.prompt_tokens,
              outputTokens: usage?.completion_tokens,
              ...(usage?.cost !== undefined ? { costUsd: usage.cost } : {}),
            },
          };
        } catch (err) {
          lastErr = err;
          if (err instanceof Error && err.message.includes("call budget")) throw err;
          const looksTruncated = text.trimStart().startsWith("{") && !text.trimEnd().endsWith("}");
          if (err instanceof SyntaxError && looksTruncated) {
            throw new Error(
              `${label} output was cut off at ${text.length} characters — raise maxOutputTokens (currently ${config.maxOutputTokens ?? 16_000}).`,
            );
          }
        }
      }
      throw new Error(`${label} extract failed to produce valid ${req.schemaName}: ${String(lastErr)}`);
    },
  };
}

/** OpenAI (ChatGPT models). */
export function createOpenAIProvider(config: OpenAICompatibleConfig): MeteredProvider {
  return createOpenAICompatibleProvider("openai", config);
}

/** OpenRouter: Gemini (`google/…`), Perplexity (`perplexity/…`), Grok (`x-ai/…`) and others, one key. */
export function createOpenRouterProvider(config: OpenAICompatibleConfig): MeteredProvider {
  return createOpenAICompatibleProvider("openrouter", config);
}

/** xAI en direct (Grok), clé XAI_API_KEY. */
export function createXaiProvider(config: OpenAICompatibleConfig): MeteredProvider {
  return createOpenAICompatibleProvider("xai", config);
}

/** Google en direct (Gemini, interface compatible OpenAI), clé GEMINI_API_KEY. */
export function createGeminiProvider(config: OpenAICompatibleConfig): MeteredProvider {
  return createOpenAICompatibleProvider("gemini", config);
}

/** Perplexity en direct (Sonar), clé PERPLEXITY_API_KEY. */
export function createPerplexityProvider(config: OpenAICompatibleConfig): MeteredProvider {
  return createOpenAICompatibleProvider("perplexity", config);
}
