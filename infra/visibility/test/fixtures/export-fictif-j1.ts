import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { WindowExport } from "../../src/j0-evidence";
import { loadSubject } from "../../src/load";
import type { SubjectBundle } from "../../src/schema";
import { exportFictif } from "./export-fictif";

/**
 * Deuxième fenêtre fictive (j1) du sujet fictif, pour vis-sync (mandat v13,
 * bloc F). measurement.yaml du sujet fictif n'est pas modifié : j1 est ajoutée
 * en mémoire.
 */
const here = dirname(fileURLToPath(import.meta.url));
const START = "2026-11-20T09:00:00Z";

export function sujetAvecJ1(): SubjectBundle {
  const b = loadSubject(join(here, "demo-subject"));
  b.measurement.windows.push({
    id: "j1", kind: "follow-up", comparesWith: "j0", days: 5, panelVersion: 1, status: "planned", start: "2026-11-20", missingDays: [],
  });
  return b;
}

/** L'exportation d'Elmo contient toutes les réponses de la marque : celles de J0 aussi. */
export function exportFictifJ1(): WindowExport {
  const runs: WindowExport["runs"] = [...exportFictif().runs];
  // Jours 0 et 1 : le jour 2 manque.
  for (const [day, question] of [[0, "en-01"], [1, "en-02"]] as const) {
    runs.push({
      id: `00000000-0000-4000-8000-0000000001${String(day).padStart(2, "0")}`,
      promptId: `00000000-0000-4000-9000-0000000000${question === "en-01" ? "01" : "02"}`,
      promptTags: [`oia:${question}@v1`, "panel:v1", "lang:en", `family:${question === "en-01" ? "unbranded" : "branded"}`],
      model: "chatgpt", provider: "openai-api", version: "gpt-6-luna", webSearch: true,
      createdAt: new Date(Date.parse(START) + day * 86_400_000).toISOString().replace(".000", ""),
      text: `Demo Subject, fenêtre j1, jour ${day}. See https://demo.example/`,
      usage: { input_tokens: 1000, output_tokens: 200 },
      searchItems: 1,
      citations: ["https://demo.example/"],
      brandMentioned: true,
      competitorsMentioned: [],
    });
  }
  return { exportedAt: "2026-11-23T10:00:00Z", subjectId: "demo-subject", startedAt: START, days: 5, runs, failed: [] };
}

const moteur = (engine: string, verdict: string) => ({
  engine,
  reference: { mean: 0.1, ci95: [0.05, 0.15], days: 5, dailyRates: [0.1, 0.1, 0.05, 0.15, 0.1] },
  current: { mean: 0.12, ci95: [0.06, 0.18], days: 4, dailyRates: [0.1, 0.12, 0.14, 0.12] },
  verdict, fragile: engine === "chatgpt", ...(engine === "chatgpt" ? { fragileReason: "version de modèle changée" } : {}),
  versions: { reference: ["gpt-6-luna"], current: ["gpt-6-luna", "gpt-6-luna-2"] },
  unmeasured: { reference: 0, current: 1 },
});

/** Comparaison j1 / j0 au format 1 de src/window-compare.ts (bloc C). */
export function comparaisonFictive() {
  return {
    comparisonFormat: 1,
    subjectId: "demo-subject",
    windowId: "j1",
    referenceId: "j0",
    provenance: { reference: { evidenceCount: 3, digest: "a".repeat(64) }, current: { evidenceCount: 2, digest: "b".repeat(64) } },
    panel: { reference: 1, current: 1 },
    bootstrap: { seed: 42, resamples: 2000 },
    unbranded: { perEngine: [moteur("chatgpt", "pas de changement démontrable")], total: moteur("tous", "pas de changement démontrable") },
    branded: { perEngine: [moteur("chatgpt", "hausse")], total: moteur("tous", "hausse") },
    competitors: [],
    sources: [],
    executedRecommendations: [{ id: "rec-demo-1", executedAt: "2026-11-10" }],
  };
}
