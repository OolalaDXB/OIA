import type { Env } from "@oia/config";
import type { LLMProvider } from "./types";
import { createAnthropicProvider } from "./anthropic";
import { createMistralProvider } from "./mistral";

export * from "./types";
export * from "./fake";
export * from "./anthropic";
export * from "./mistral";

/** Select the configured provider (OD-2). One default in V0; no routing. */
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
      throw new Error("openai provider not implemented in V0 (see OD-2)");
    default:
      throw new Error(`unknown LLM_PROVIDER: ${env.LLM_PROVIDER}`);
  }
}
