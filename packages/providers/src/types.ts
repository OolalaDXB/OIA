import { createHash } from "node:crypto";
import type { ZodType, ZodTypeDef } from "zod";

/**
 * Provider-neutral LLM contract. The pipeline asks for structured extraction
 * against a Zod schema; the adapter handles the model-specific mechanics.
 * The model EXTRACTS and PROPOSES only — it never certifies a fact (that is the
 * job of deterministic corroboration in @oia/intelligence).
 */

export interface LLMRunMeta {
  provider: string;
  model: string;
  promptHash: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface LLMResult<T> {
  data: T;
  run: LLMRunMeta;
}

export interface ExtractRequest<T> {
  /** Output type is T; input may differ (schemas with defaults/transforms). */
  schema: ZodType<T, ZodTypeDef, unknown>;
  /** JSON-schema-ish description or field guide for the model. */
  schemaName: string;
  system: string;
  input: string;
  model?: string;
  purpose: string; // logged to llm_runs.purpose
}

export interface LLMProvider {
  readonly name: string;
  readonly defaultModel: string;
  extract<T>(req: ExtractRequest<T>): Promise<LLMResult<T>>;
}

export function promptHash(system: string, input: string, schemaName: string): string {
  return createHash("sha256")
    .update(`${schemaName}\n${system}\n${input}`, "utf8")
    .digest("hex");
}
