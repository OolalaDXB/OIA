import { loadEnv, requireWorkerEnv } from "@oia/config";
import {
  createServiceClient,
  ProjectProfileSchema,
  type SourceKind,
} from "@oia/database";
import { createDbAuditSink, createPolicy } from "@oia/audit";
import { createProviderFromEnv } from "@oia/providers";
import { createConnectorContext } from "@oia/connectors";
import { runPipeline, type PipelineSource } from "./pipeline";
import { createSupabasePersistence } from "./persistence.supabase";

/**
 * CLI entry: `pnpm --filter @oia/workers start -- --project bawaba`
 * Loads the project profile + enabled sources from Supabase and runs the
 * discover→fetch→qualify→persist pipeline.
 */
async function main(): Promise<void> {
  const slug = argValue("--project") ?? "bawaba";
  const env = loadEnv();
  requireWorkerEnv(env);

  const client = createServiceClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

  // Load project profile.
  const { data: projectRow, error: projErr } = await client
    .from("projects")
    .select("id, profile")
    .eq("slug", slug)
    .eq("is_active", true)
    .single();
  if (projErr || !projectRow) {
    throw new Error(`project "${slug}" not found or inactive: ${projErr?.message ?? "no row"}`);
  }
  const project = ProjectProfileSchema.parse((projectRow as { profile: unknown }).profile);
  const projectId = (projectRow as { id: string }).id;

  // Load enabled sources.
  const { data: sourceRows, error: srcErr } = await client
    .from("sources")
    .select("id, connector_key, kind")
    .eq("is_enabled", true);
  if (srcErr) throw new Error(`failed to load sources: ${srcErr.message}`);
  const sources: PipelineSource[] = (sourceRows ?? []).map((s) => {
    const row = s as { id: string; connector_key: string; kind: SourceKind };
    return { id: row.id, connectorKey: row.connector_key, kind: row.kind };
  });

  const audit = createDbAuditSink(client);
  const policy = createPolicy();
  const ctx = createConnectorContext({
    policy,
    log: (event, data) => console.log(`[connector] ${event}`, data ?? ""),
    env: {
      euFtApiKey: env.EU_FT_API_KEY,
      euFtBaseUrl: env.EU_FT_BASE_URL,
      userAgent: env.FETCH_USER_AGENT,
      timeoutMs: env.FETCH_TIMEOUT_MS,
    },
  });
  const provider = createProviderFromEnv(env);
  const persistence = createSupabasePersistence(client);

  console.log(`Running funding pipeline for "${slug}" across ${sources.length} source(s)…`);
  const summary = await runPipeline({
    project,
    projectId,
    sources,
    ctx,
    provider,
    policy,
    audit,
    persistence,
    confidenceFloor: env.CONFIDENCE_FLOOR,
  });
  console.log("Pipeline summary:", JSON.stringify(summary, null, 2));
}

function argValue(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 ? process.argv[idx + 1] : undefined;
}

main().catch((err) => {
  console.error("Pipeline failed:", err);
  process.exitCode = 1;
});
