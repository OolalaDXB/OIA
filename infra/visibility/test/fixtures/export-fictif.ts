import type { WindowExport } from "../../src/j0-evidence";

/** Exportation fictive d'une fenêtre pour vis-sync (mandat v9, bloc C). */
const START = "2026-11-01T09:00:00Z";
const REDIRECTION = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123";

export function exportFictif(): WindowExport {
  const runs: WindowExport["runs"] = [];
  let n = 0;
  // Jours 0 et 2 : le jour 1 manque.
  for (const day of [0, 2]) {
    for (const [model, provider, version] of [["chatgpt", "openai-api", "gpt-6-luna"], ["claude", "anthropic-api", "claude-sonnet-5-5"]] as const) {
      n++;
      runs.push({
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        promptTags: ["oia:en-02@v1", "panel:v1", "lang:en", "family:branded"],
        model, provider, version, webSearch: true,
        createdAt: new Date(Date.parse(START) + day * 86_400_000 + n * 1000).toISOString().replace(".000", ""),
        // Une réponse sans texte : écartée, jamais inventée.
        text: n === 4 ? null : `Demo Subject réponse ${n}. See https://demo.example/`,
        usage: { input_tokens: 1000, output_tokens: 200 },
        searchItems: provider === "openai-api" ? 1 : 0,
        citations: n === 1 ? [REDIRECTION, "https://demo.example/", "https://demo.example/"] : ["https://rival.example/"],
        brandMentioned: n % 2 === 1,
        competitorsMentioned: [],
      });
    }
  }
  return { exportedAt: "2026-11-04T10:00:00Z", subjectId: "demo-subject", startedAt: START, days: 5, runs, failed: [] };
}
