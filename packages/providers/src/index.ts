import type { Env } from "@oia/config";
import type { LLMProvider } from "./types";
import { createAnthropicProvider } from "./anthropic";
import { createMistralProvider } from "./mistral";
import { createOpenAIProvider, createOpenRouterProvider } from "./openai-compatible";

export * from "./types";
export * from "./fake";
export * from "./anthropic";
export * from "./mistral";
export * from "./openai-compatible";

/**
 * Select the configured provider. Mistral stays the default; Anthropic, OpenAI and
 * OpenRouter (Gemini, Perplexity, Grok) are available too (decision of Mickaël,
 * 16 November 2026). One provider per process; no routing.
 */
export function createProviderFromEnv(env: Env): LLMProvider {
  if (!env.LLM_API_KEY) {
    throw new Error("LLM_API_KEY is required to create a provider");
  }
  switch (env.LLM_PROVIDER) {
    case "mistral":
      return createMistralProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
    case "anthropic":
      return createAnthropicProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
    case "openai":
      return createOpenAIProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
    case "openrouter":
      // Gemini, Perplexity, Grok… : LLM_MODEL names the model, e.g. "google/gemini-3-flash-preview".
      return createOpenRouterProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL, appTitle: "OIA" });
    default:
      throw new Error(`unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
  }
}
