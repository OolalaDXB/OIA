import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CostUnreadableError, evidencePath, failuresPath } from "../src/collect-day";
import { parseTarget, targetWorstCaseUsd } from "../src/collector-oia-direct";
import { estimateStudy, estimateWindow, referenceCosts, subjectMonthSpend, windowRealCost, type ReferenceFigures } from "../src/cost-estimate";
import { judgeWorstCaseUsd } from "../src/judge";
import { loadSubject } from "../src/load";
import { MeasurementSchema } from "../src/schema";

const T = {
  chatgpt: "chatgpt:openai-api:gpt-6-luna:online",
  claude: "claude:anthropic-api:claude-sonnet-5-5:online",
  gemini: "gemini:openrouter:google/gemini-3-flash-preview:online",
  perplexity: "perplexity:openrouter:perplexity/sonar:online",
  mistral: "mistral:mistral-api:mistral-large-4:online",
};

/** Figures fictives d'une référence de 5 jours, 10 questions, 5 moteurs (50 réponses chacun). */
const REF: ReferenceFigures = {
  windowId: "j0",
  perEngine: [
    { engine: "chatgpt", versions: ["gpt-6-luna"], responses: 50, estimatedCostUsd: 1.5 },
    { engine: "claude", versions: ["claude-sonnet-5-5"], responses: 50, estimatedCostUsd: 2.5 },
    { engine: "gemini", versions: ["google/gemini-3-flash-preview"], responses: 50, estimatedCostUsd: 3 },
    { engine: "perplexity", versions: ["perplexity/sonar"], responses: 50, estimatedCostUsd: 0.5 },
    { engine: "mistral", versions: ["mistral-large-4"], responses: 50, estimatedCostUsd: 15 },
  ],
};

function makeSubject(o: { languages: string[]; perLanguage: number; targets: string[]; mistralLanguages?: string[]; days?: number }) {
  const root = mkdtempSync(join(tmpdir(), "oia-cost-estimate-"));
  const dir = join(root, "sujet-fictif");
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "subject.yaml"),
    `schemaVersion: 1
id: sujet-fictif
displayName: Sujet Fictif
status: draft
ownership: external
urls: { primary: https://sujet-fictif.example }
languages: [${o.languages.join(", ")}]
markets:
  - { country: FR, label: France, languages: [${o.languages.join(", ")}], status: confirmed }
aliases:
  - { value: Sujet Fictif, kind: name, status: confirmed }
sources:
  - { id: owner, kind: owner-statement, ref: kickoff, description: Brief, addedAt: "2026-01-01" }
`,
  );
  writeFileSync(join(dir, "facts.yaml"), "schemaVersion: 1\nfacts: []\n");
  const prompts = o.languages.flatMap((l) =>
    Array.from({ length: o.perLanguage }, (_, i) => `  - { id: ${l}-${String(i + 1).padStart(2, "0")}, version: 1, family: unbranded, language: ${l}, markets: [FR], text: "Question fictive numéro ${i + 1}", origin: claude, status: active, createdAt: "2026-01-01" }`),
  );
  writeFileSync(
    join(dir, "panel.yaml"),
    `schemaVersion: 1\npanelVersion: 1\nstatus: draft\nlimits: { maxPerLanguage: 20, minBrandedPerLanguage: 0 }\nprompts:\n${prompts.join("\n")}\n`,
  );
  const engines = o.targets.map((t) => parseTarget(t).engine);
  writeFileSync(
    join(dir, "measurement.yaml"),
    `schemaVersion: 1
engines:
${engines.map((e) => `  - { model: ${e}${e === "mistral" && o.mistralLanguages ? `, languages: [${o.mistralLanguages.join(", ")}]` : ""} }`).join("\n")}
windows:
  - id: j0
    kind: baseline
    days: ${o.days ?? 5}
    panelVersion: 1
    status: planned
    targets: [${o.targets.join(", ")}]
`,
  );
  return { root, b: loadSubject(dir) };
}

describe("coût d'une étude (bloc G)", () => {
  it("coût moyen d'un appel par moteur ; Mistral non repris d'une référence sans français", () => {
    const { costs, excluded } = referenceCosts(REF, ["en"]);
    expect(costs.map((c) => [c.engine, c.usdPerCall])).toEqual([["chatgpt", 0.03], ["claude", 0.05], ["gemini", 0.06], ["perplexity", 0.01]]);
    expect(excluded.map((e) => e.engine)).toEqual(["mistral"]);
    expect(referenceCosts(REF, ["fr"]).costs.map((c) => c.engine)).toContain("mistral");
    // Langues inconnues : traitées comme sans français.
    expect(referenceCosts(REF, null).excluded.map((e) => e.engine)).toEqual(["mistral"]);
  });

  it("même fenêtre que la référence (5 jours, 10 questions, 4 moteurs hors Mistral) : le total de la référence, plus le juge", () => {
    const { b } = makeSubject({ languages: ["en"], perLanguage: 10, targets: [T.chatgpt, T.claude, T.gemini, T.perplexity] });
    const e = estimateWindow(b, "j0", { reference: { figures: REF, languages: ["en"] }, judge: "aucun" });
    // Σ des quatre moteurs de la référence : 1,5 + 2,5 + 3 + 0,5.
    expect(e.answersUsd).toBe(7.5);
    expect(e.totalUsd).toBe(7.5);
    expect(e.perEngine.every((x) => x.source === "référence" && x.calls === 50)).toBe(true);
    const withJev = estimateWindow(b, "j0", { reference: { figures: REF, languages: ["en"] }, judge: "jev" });
    expect(withJev.judge.usd).toBeCloseTo(200 * judgeWorstCaseUsd("jev"), 6);
    expect(withJev.totalUsd).toBeCloseTo(7.5 + 200 * judgeWorstCaseUsd("jev"), 4);
  });

  it("se multiplie par langues, questions, moteurs et jours", () => {
    const usdPerCall = { chatgpt: 0.03, claude: 0.05, gemini: 0.06, perplexity: 0.01 };
    const one = estimateStudy({ usdPerCall, questionsPerLanguage: 10, languages: 1, days: 5, judgePerAnswerUsd: 0 });
    expect(one.answersUsd).toBe(7.5);
    expect(estimateStudy({ usdPerCall, questionsPerLanguage: 10, languages: 2, days: 5, judgePerAnswerUsd: 0 }).answersUsd).toBe(15);
    expect(estimateStudy({ usdPerCall, questionsPerLanguage: 20, languages: 1, days: 5, judgePerAnswerUsd: 0 }).answersUsd).toBe(15);
    expect(estimateStudy({ usdPerCall: { chatgpt: 0.03, claude: 0.05 }, questionsPerLanguage: 10, languages: 1, days: 5, judgePerAnswerUsd: 0 }).answersUsd).toBe(4);
    expect(estimateStudy({ usdPerCall, questionsPerLanguage: 10, languages: 1, days: 2, judgePerAnswerUsd: 0.01 })).toMatchObject({ answers: 80, answersUsd: 3, judgeUsd: 0.8, totalUsd: 3.8 });
    // estimateWindow suit la même règle : deux langues, deux fois le coût.
    const { b } = makeSubject({ languages: ["en", "fr"], perLanguage: 10, targets: [T.chatgpt, T.claude, T.gemini, T.perplexity] });
    expect(estimateWindow(b, "j0", { reference: { figures: REF, languages: ["en"] }, judge: "aucun" }).answersUsd).toBe(15);
  });

  it("Mistral sur un panel français : grille (majorant), questions françaises seulement", () => {
    const { b } = makeSubject({ languages: ["en", "fr"], perLanguage: 10, targets: [T.chatgpt, T.mistral], mistralLanguages: ["fr"] });
    const e = estimateWindow(b, "j0", { reference: { figures: REF, languages: ["en"] }, judge: "aucun" });
    const m = e.perEngine.find((x) => x.engine === "mistral")!;
    expect(m).toMatchObject({ source: "grille", questions: 10, calls: 50 });
    expect(m.usdPerCall).toBeCloseTo(targetWorstCaseUsd(parseTarget(T.mistral))!, 6);
    expect(e.perEngine.find((x) => x.engine === "chatgpt")).toMatchObject({ source: "référence", questions: 20, calls: 100 });
  });

  it("sans référence : repli sur la grille ; version servie différente : grille aussi", () => {
    const { b } = makeSubject({ languages: ["en"], perLanguage: 10, targets: [T.chatgpt, T.perplexity] });
    const grid = estimateWindow(b, "j0", { reference: null, judge: "aucun" });
    expect(grid.referenceId).toBeNull();
    expect(grid.perEngine.every((x) => x.source === "grille")).toBe(true);
    expect(grid.answersUsd).toBeCloseTo(50 * (targetWorstCaseUsd(parseTarget(T.chatgpt))! + targetWorstCaseUsd(parseTarget(T.perplexity))!), 4);
    const other: ReferenceFigures = { windowId: "j0", perEngine: [{ engine: "chatgpt", versions: ["gpt-5-autre"], responses: 50, estimatedCostUsd: 1 }] };
    expect(estimateWindow(b, "j0", { reference: { figures: other, languages: ["en"] }, judge: "aucun" }).perEngine[0]!.source).toBe("grille");
  });

  it("modèle hors grille : majorant du fournisseur ; fenêtre sans cible : coût illisible", () => {
    const { b } = makeSubject({ languages: ["en"], perLanguage: 2, targets: [T.chatgpt] });
    const w = { ...b.measurement.windows[0]!, targets: ["chatgpt:openai-api:modele-inconnu:online"] };
    expect(estimateWindow(b, w, { reference: null }).perEngine[0]!.source).toBe("grille");
    expect(() => estimateWindow(b, { ...w, targets: [] }, { reference: null })).toThrow(CostUnreadableError);
  });

  it("coût réel d'une fenêtre et dépense du mois d'un sujet", () => {
    const { root } = makeSubject({ languages: ["en"], perLanguage: 1, targets: [T.chatgpt] });
    const data = join(root, "data");
    mkdirSync(join(data, "sujet-fictif", "evidence"), { recursive: true });
    const row = (id: string, at: string, cost: number, judge?: number, collectorName = "oia-direct") =>
      JSON.stringify({ id, collectorName, receivedAt: at, costUsd: cost, structured: { cost: { readable: true }, mentions: judge === undefined ? undefined : { judge: { cost: { usd: judge } } } } });
    writeFileSync(evidencePath(data, "sujet-fictif", "j0"), [row("a", "2026-12-01T10:00:00Z", 0.02, 0.001), row("b", "2026-11-30T10:00:00Z", 0.03), row("c", "2026-12-01T10:00:00Z", 5, undefined, "elmo")].join("\n") + "\n");
    writeFileSync(failuresPath(data, "sujet-fictif", "j0"), `${JSON.stringify({ id: "f", collectorName: "oia-direct", at: "2026-12-01T11:00:00Z", worstCaseUsd: 0.026 })}\n`);
    expect(windowRealCost(data, "sujet-fictif", "j0")).toMatchObject({ usd: 0.077, answersUsd: 0.05, judgeUsd: 0.001, failuresUsd: 0.026, answers: 2, failures: 1, otherCollectorRows: 1 });
    expect(subjectMonthSpend(data, "sujet-fictif", "2026-12").usd).toBe(0.047);
    writeFileSync(evidencePath(data, "sujet-fictif", "j1"), `${row("d", "2026-12-02T10:00:00Z", Number.NaN)}\n`);
    expect(() => subjectMonthSpend(data, "sujet-fictif", "2026-12")).toThrow(CostUnreadableError);
  });
});

describe("budget du client dans measurement.yaml", () => {
  const base = { schemaVersion: 1, engines: [{ model: "chatgpt" }], windows: [{ id: "j0", kind: "baseline", days: 5, panelVersion: 1, status: "planned" }] };
  it("facultatif ; plafond et seuil d'alerte", () => {
    expect(MeasurementSchema.parse(base).budget).toBeUndefined();
    expect(MeasurementSchema.parse({ ...base, budget: { monthlyCapUsd: 20, alertUsd: 15 } }).budget).toEqual({ monthlyCapUsd: 20, alertUsd: 15 });
    expect(MeasurementSchema.parse({ ...base, budget: { monthlyCapUsd: 20 } }).budget).toEqual({ monthlyCapUsd: 20 });
  });
  it("refuse un seuil au-dessus du plafond, un plafond négatif, un champ inconnu", () => {
    expect(MeasurementSchema.safeParse({ ...base, budget: { monthlyCapUsd: 10, alertUsd: 12 } }).success).toBe(false);
    expect(MeasurementSchema.safeParse({ ...base, budget: { monthlyCapUsd: -1 } }).success).toBe(false);
    expect(MeasurementSchema.safeParse({ ...base, budget: { monthlyCapUsd: 10, capUsd: 3 } }).success).toBe(false);
    expect(MeasurementSchema.safeParse({ ...base, budget: {} }).success).toBe(false);
  });
});
