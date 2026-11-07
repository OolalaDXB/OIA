import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBundle, loadSubject } from "../src/load.js";
import type { SubjectBundle } from "../src/schema.js";

const here = dirname(fileURLToPath(import.meta.url));
const T = ["alpha:openai-api:gpt-6-luna:online", "beta:mistral-api:mistral-large-4:online"];

type Win = SubjectBundle["measurement"]["windows"][number];
function withWindows(follow: Partial<Win>): string[] {
  const b = loadSubject(join(here, "fixtures", "demo-subject"));
  const base: Win = { id: "j0", kind: "baseline", days: 5, panelVersion: 1, status: "planned", missingDays: [], targets: T, runTimeUtc: "15:27" };
  const j1: Win = { id: "j1", kind: "follow-up", comparesWith: "j0", days: 5, panelVersion: 1, status: "planned", missingDays: [], targets: [...T].reverse(), runTimeUtc: "15:27", ...follow };
  b.measurement.windows = [base, j1];
  return checkBundle(b).filter((p) => p.startsWith("window j1"));
}

describe("fenêtre de remesure (bloc E)", () => {
  it("accepte une remesure identique à J0 (ordre des cibles indifférent)", () => {
    expect(withWindows({})).toEqual([]);
  });

  it("refuse une remesure dont les moteurs ou les modèles diffèrent de J0 sans le signaler", () => {
    const p = withWindows({ targets: ["alpha:openai-api:gpt-6-sol:online", "beta:mistral-api:mistral-large-4:online"] });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/differs from j0 without comparisonNote/);
    expect(p[0]).toMatch(/gpt-6-sol/);
    expect(withWindows({ targets: [...T, "grok:openrouter:x-ai/grok-4.5:online"] })[0]).toMatch(/cibles/);
  });

  it("refuse aussi un autre panel, une autre durée ou une autre heure", () => {
    expect(withWindows({ runTimeUtc: "09:00" })[0]).toMatch(/heure 09:00 ≠ 15:27/);
    expect(withWindows({ days: 3 })[0]).toMatch(/3 jours ≠ 5/);
  });

  it("accepte un écart quand il est signalé par une note de comparaison", () => {
    expect(withWindows({ runTimeUtc: "09:00", comparisonNote: "Heure avancée pour une contrainte d'Elmo ; comparaison à lire avec réserve." })).toEqual([]);
  });

  it("refuse une fenêtre de suivi sans référence, ou avec une référence inconnue", () => {
    expect(withWindows({ comparesWith: undefined })[0]).toMatch(/without comparesWith/);
    expect(withWindows({ comparesWith: "j9" })[0]).toMatch(/unknown window "j9"/);
  });
});
