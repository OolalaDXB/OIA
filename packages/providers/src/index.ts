import type { Env } from "@oia/config";
import type { LLMProvider } from "./types";
import { createAnthropicProvider } from "./anthropic";
import { createMistralProvider } from "./mistral";
import { createGeminiProvider, createOpenAIProvider, createOpenRouterProvider, createPerplexityProvider, createXaiProvider } from "./openai-compatible";

export * from "./types";
export * from "./fake";
export * from "./anthropic";
export * from "./mistral";
export * from "./openai-compatible";

/**
 * Select the configured provider.
 *
 * Secrets, un par fournisseur : MISTRAL_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY,
 * OPENROUTER_API_KEY, XAI_API_KEY (Grok), GEMINI_API_KEY (Gemini), PERPLEXITY_API_KEY
 * (Perplexity). `keyEnvFor(provider)` donne le nom ; LLM_API_KEY reste accepté. Mistral stays the default; Anthropic, OpenAI and
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
    case "xai":
      return createXaiProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
    case "gemini":
      return createGeminiProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
    case "perplexity":
      return createPerplexityProvider({ apiKey: env.LLM_API_KEY, model: env.LLM_MODEL });
    default:
      throw new Error(`unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
  }
}

/** Nom du secret de la clé de chaque fournisseur. */
export const PROVIDER_KEY_ENV = {
  mistral: "MISTRAL_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  xai: "XAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
} as const;

export function keyEnvFor(provider: keyof typeof PROVIDER_KEY_ENV): string {
  return PROVIDER_KEY_ENV[provider];
}
