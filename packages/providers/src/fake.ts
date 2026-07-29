import type { LLMProvider, ExtractRequest, LLMResult } from "./types";
import { promptHash } from "./types";

/**
 * Deterministic provider for tests and dry runs. You supply a handler per
 * `purpose` that returns raw data; it is validated against the request schema
 * exactly like a real provider's output.
 */
export function createFakeProvider(
  handlers: Record<string, (input: string) => unknown>,
  opts: { name?: string; model?: string } = {},
): LLMProvider {
  const name = opts.name ?? "fake";
  const model = opts.model ?? "fake-model";
  return {
    name,
    defaultModel: model,
    async extract<T>(req: ExtractRequest<T>): Promise<LLMResult<T>> {
      const handler = handlers[req.purpose];
      if (!handler) throw new Error(`fake provider has no handler for purpose "${req.purpose}"`);
      const data = req.schema.parse(handler(req.input));
      return {
        data,
        run: {
          provider: name,
          model: req.model ?? model,
          promptHash: promptHash(req.system, req.input, req.schemaName),
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
        },
      };
    },
  };
}
