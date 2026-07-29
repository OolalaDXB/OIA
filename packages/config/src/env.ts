import { z } from "zod";

/**
 * Single validated source of truth for environment configuration.
 * Fail-closed: `loadEnv()` throws if required vars are missing/invalid.
 *
 * Web and workers both call this; workers additionally require the service role
 * key. Keep secrets out of the repo — see .env.example.
 */

const numericString = (fallback: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? fallback : Number(v)))
    .pipe(z.number().finite());

export const EnvSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  // Optional in web context; required by workers (checked separately).
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  LLM_PROVIDER: z.enum(["anthropic", "openai"]).default("anthropic"),
  LLM_MODEL: z.string().min(1).default("claude-sonnet-5"),
  LLM_API_KEY: z.string().min(1).optional(),

  EU_FT_API_KEY: z.string().min(1).default("SEDIA"),
  EU_FT_BASE_URL: z
    .string()
    .url()
    .default("https://api.tech.ec.europa.eu/search-api/prod/rest/search"),

  CONFIDENCE_FLOOR: numericString(70),
  FETCH_USER_AGENT: z
    .string()
    .default("OIA-Funding/0.0 (internal research; contact ops)"),
  FETCH_TIMEOUT_MS: numericString(30_000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

/** Assert the extra vars a worker needs (service role key, LLM key). */
export function requireWorkerEnv(env: Env): asserts env is Env & {
  SUPABASE_SERVICE_ROLE_KEY: string;
  LLM_API_KEY: string;
} {
  if (!env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Worker requires SUPABASE_SERVICE_ROLE_KEY");
  }
  if (!env.LLM_API_KEY) {
    throw new Error("Worker requires LLM_API_KEY");
  }
}
