import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ElmoExport } from "../../src/elmo-import-final.js";
import { loadSubject } from "../../src/load.js";
import type { SubjectBundle } from "../../src/schema.js";

/** Export d'Elmo fictif (forme de json_agg) pour l'import final : panel, sans texte, hors panel, hors fenêtre. */
const here = dirname(fileURLToPath(import.meta.url));
export const P1 = "11111111-1111-4111-8111-111111111111";
export const HORS = "99999999-9999-4999-8999-999999999999";

/** Sujet fictif avec une fenêtre j0 du 1er au 3 janvier 2026, une question exclue. */
export function sujet(): SubjectBundle {
  const b = loadSubject(join(here, "demo-subject"));
  b.measurement.windows = [{ id: "j0", kind: "baseline", days: 3, panelVersion: 1, status: "done", start: "2026-01-01", end: "2026-01-03", runTimeUtc: "10:00", missingDays: [], excludedPromptIds: [HORS] }];
  return b;
}

export function exportElmo(): ElmoExport {
  const run = (id: string, prompt: string, at: string, model = "chatgpt") => ({
    id, prompt_id: prompt, model, version: "gpt-6-luna", web_search_enabled: true, provider: "openai-api", brand_id: "demo-subject", created_at: at,
    raw_output: { output: [{ type: "web_search_call" }], usage: { input_tokens: 1000, output_tokens: 200 } }, web_queries: ["demo tools"],
  });
  return {
    brands: [{ id: "demo-subject", name: "Demo Subject" }],
    prompts: [
      { id: P1, brand_id: "demo-subject", value: "Which demo tools are best?", enabled: true, tags: ["oia:en-01@v1", "panel:v1", "lang:en"], created_at: "2026-01-01T00:00:00Z" },
      { id: HORS, brand_id: "demo-subject", value: "Ajoutée à la main", enabled: false, tags: ["panel:v1", "lang:en"], created_at: "2026-01-01T00:00:00Z" },
    ],
    prompt_runs: [
      run("00000000-0000-4000-8000-000000000001", P1, "2026-01-01T10:00:05.123456+00:00"),
      run("00000000-0000-4000-8000-000000000002", P1, "2026-01-02T10:00:05+00:00", "mistral"),
      run("00000000-0000-4000-8000-000000000003", HORS, "2026-01-02T11:00:00+00:00"),
      run("00000000-0000-4000-8000-000000000004", P1, "2025-12-20T10:00:00+00:00"),
    ],
    run_extractions: [
      { run_id: "00000000-0000-4000-8000-000000000001", text_content: "Demo Subject is great.", stamp: "s1" },
      { run_id: "00000000-0000-4000-8000-000000000002", text_content: null, stamp: "s2" },
      { run_id: "00000000-0000-4000-8000-000000000003", text_content: "Rival Co.", stamp: "s3" },
      { run_id: "00000000-0000-4000-8000-000000000004", text_content: "Avant la fenêtre.", stamp: "s4" },
    ],
    run_mentions: [
      { run_id: "00000000-0000-4000-8000-000000000001", brand_mentioned: true, competitors_mentioned: [], stamp: "jev", assessments: { judged: {} } },
      { run_id: "00000000-0000-4000-8000-000000000002", brand_mentioned: false, competitors_mentioned: ["Rival Co"], stamp: "jev", assessments: null },
    ],
    citations: [
      { prompt_run_id: "00000000-0000-4000-8000-000000000001", url: "https://b.example/", domain: "b.example", title: "B", citation_index: 1 },
      { prompt_run_id: "00000000-0000-4000-8000-000000000001", url: "https://a.example/", domain: "a.example", title: "A", citation_index: 0 },
      { prompt_run_id: "00000000-0000-4000-8000-000000000001", url: "https://a.example/", domain: "a.example", title: "A", citation_index: 2 },
    ],
    usage_events: [{ brand_id: "demo-subject", prompt_id: P1, event_type: "prompt_run", model: "chatgpt", estimated_cost_usd: "0.0090", created_at: "2026-01-01T10:00:06Z" }],
  };
}

