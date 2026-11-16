import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceRow } from "../src/elmo-import.js";
import { sha256Hex } from "../src/evidence-store.js";
import type { EvidenceStructured } from "../src/j0-evidence.js";
import { identifyingTerms, loadSubject, loadSubjects } from "../src/load.js";
import type { Recommendation } from "../src/recommendation.js";
import type { SubjectBundle } from "../src/schema.js";
import { compareWindows, renderComparisonMarkdown, windowRate, writeComparison, type WindowSpan } from "../src/window-compare.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const REF: WindowSpan = { startedAt: "2026-11-01T09:00:00Z", days: 5 };
const CUR: WindowSpan = { startedAt: "2026-12-01T09:00:00Z", days: 5 };

/** Sujet fictif, avec une fenêtre de suivi j1 comparée à j0 (modifiable par test). */
function bundle(j1: Record<string, unknown> = {}): SubjectBundle {
  const b = loadSubject(join(ROOT, "test/fixtures/demo-subject"));
  return {
    ...b,
    measurement: {
      ...b.measurement,
      windows: [
        { ...b.measurement.windows[0]!, status: "done", start: "2026-11-01", end: "2026-11-05" },
        { id: "j1", kind: "follow-up", days: 5, panelVersion: 1, status: "done", start: "2026-12-01", end: "2026-12-05", missingDays: [], comparesWith: "j0", ...j1 },
      ],
    },
  };
}

let n = 0;
interface RowSpec {
  window: "j0" | "j1";
  day: number;
  engine?: string;
  version?: string;
  prompt?: "en-01" | "en-02";
  mentioned: boolean | null;
  text?: string;
  citations?: string[];
  elmoCompetitors?: string[];
}
function row(o: RowSpec): EvidenceRow {
  const span = o.window === "j0" ? REF : CUR;
  const engine = o.engine ?? "chatgpt";
  const text = o.text ?? (o.mentioned ? "Demo Subject is a good choice." : "Many tools exist.");
  const structured: EvidenceStructured = {
    fromElmo: true, provider: "p", webSearch: true, brandMentioned: o.mentioned,
    competitorsMentioned: o.elmoCompetitors ?? [], usage: null, costFromUsage: true,
  };
  n++;
  return {
    id: `elmo:${o.window}-${n}`, clientId: "demo-subject", siteId: "demo-subject", subjectId: "demo-subject", windowId: o.window,
    promptId: o.prompt ?? "en-01", promptVersion: 1, promptLanguage: "en",
    engine, engineVersion: o.version ?? `${engine}-v1`, collectorName: "elmo", collectorRunId: String(n),
    receivedAt: new Date(Date.parse(span.startedAt) + (o.day - 1) * 86_400_000 + n * 1000).toISOString(),
    rawText: text, rawSha256Hex: sha256Hex(text), structured: structured as unknown as Record<string, unknown>,
    citations: (o.citations ?? []).map((url) => ({ url })), costUsd: 0,
  };
}

/** `perDay[d]` = [mentions, jugées] du jour d+1 pour un moteur. */
function windowRows(window: "j0" | "j1", perDay: [number, number][], extra: Partial<RowSpec> = {}): EvidenceRow[] {
  return perDay.flatMap(([m, j], i) => Array.from({ length: j }, (_, k) => row({ window, day: i + 1, mentioned: k < m, ...extra })));
}

describe("bloc C : comparaison de fenêtres", () => {
  it("changement net : intervalles disjoints → hausse", () => {
    const reference = windowRows("j0", [[0, 4], [1, 4], [0, 4], [1, 4], [0, 4]]);
    const current = windowRows("j1", [[3, 4], [4, 4], [3, 4], [4, 4], [3, 4]]);
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR });
    const e = c.unbranded.perEngine.find((x) => x.engine === "chatgpt")!;
    expect(e.reference!.mean).toBe(10);
    expect(e.current!.mean).toBe(85);
    expect(e.reference!.ci95[1]).toBeLessThan(e.current!.ci95[0]);
    expect(e.verdict).toBe("hausse");
    expect(e.fragile).toBe(false);
    expect(c.unbranded.total.verdict).toBe("hausse");
    // Aucune question marquée : non comparable, pas un 0.
    expect(c.branded.total).toMatchObject({ reference: null, current: null, verdict: "non comparable" });
    expect(c.referenceId).toBe("j0");
    expect(c.provenance.reference.evidenceCount).toBe(20);
  });

  it("baisse et pas de changement démontrable quand les intervalles se chevauchent", () => {
    const reference = windowRows("j0", [[1, 4], [3, 4], [2, 4], [4, 4], [0, 4]]);
    const current = windowRows("j1", [[2, 4], [1, 4], [3, 4], [2, 4], [1, 4]]);
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR });
    expect(c.unbranded.perEngine[0]!.verdict).toBe("pas de changement démontrable");
    const down = compareWindows(bundle(), "j1", { reference: windowRows("j0", [[4, 4], [4, 4], [3, 4]]), current: windowRows("j1", [[0, 4], [1, 4], [0, 4]]) }, { reference: REF, current: CUR });
    expect(down.unbranded.perEngine[0]!.verdict).toBe("baisse");
    const md = renderComparisonMarkdown(bundle(), c);
    expect(md).toContain("pas de changement démontrable");
    expect(md).toContain("Seules les questions qui ne nomment pas la marque disent sa visibilité");
  });

  it("jour manquant : un moteur sans réponse un jour n'a pas de taux ce jour-là (pas un 0)", () => {
    const reference = [...windowRows("j0", [[0, 2], [0, 2], [0, 2]]), ...windowRows("j0", [[2, 2], [2, 2], [2, 2]], { engine: "claude" })];
    // claude ne répond pas le jour 2 de j1.
    const current = [
      ...windowRows("j1", [[0, 2], [0, 2], [0, 2]]),
      ...windowRows("j1", [[2, 2], [0, 0], [2, 2]], { engine: "claude" }),
    ];
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR });
    const claude = c.unbranded.perEngine.find((x) => x.engine === "claude")!;
    expect(claude.current!.dailyRates).toEqual([{ day: 1, rate: 100 }, { day: 3, rate: 100 }]);
    expect(claude.current!.mean).toBe(100);
    expect(claude.current!.days).toBe(2);
    // Tous moteurs : le jour 2 ne compte que chatgpt.
    expect(c.unbranded.total.current!.dailyRates).toEqual([{ day: 1, rate: 50 }, { day: 2, rate: 0 }, { day: 3, rate: 50 }]);
    // Un seul jour mesuré : non comparable.
    const one = compareWindows(bundle(), "j1", { reference, current: windowRows("j1", [[1, 2]]) }, { reference: REF, current: CUR });
    expect(one.unbranded.perEngine.find((x) => x.engine === "chatgpt")!.verdict).toBe("non comparable");
    expect(one.unbranded.perEngine.find((x) => x.engine === "claude")!).toMatchObject({ current: null, verdict: "non comparable" });
  });

  it("version de modèle changée : comparaison fragile pour ce moteur", () => {
    const reference = [...windowRows("j0", [[0, 2], [0, 2]]), ...windowRows("j0", [[0, 2], [0, 2]], { engine: "claude" })];
    const current = [...windowRows("j1", [[0, 2], [0, 2]], { version: "chatgpt-v2" }), ...windowRows("j1", [[0, 2], [0, 2]], { engine: "claude" })];
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR });
    const gpt = c.unbranded.perEngine.find((x) => x.engine === "chatgpt")!;
    expect(gpt.fragile).toBe(true);
    expect(gpt.fragileReason).toContain("chatgpt-v1 → chatgpt-v2");
    expect(gpt.versions).toEqual({ reference: ["chatgpt-v1"], current: ["chatgpt-v2"] });
    expect(c.unbranded.perEngine.find((x) => x.engine === "claude")!.fragile).toBe(false);
    expect(c.unbranded.total.fragile).toBe(true);
    expect(renderComparisonMarkdown(bundle(), c)).toContain("chatgpt : comparaison fragile");
  });

  it("réponses non mesurées : hors du dénominateur, comptées par fenêtre et moteur", () => {
    const reference = [...windowRows("j0", [[1, 2], [1, 2]]), row({ window: "j0", day: 1, mentioned: false, text: "" })];
    const current = [
      ...windowRows("j1", [[1, 2], [1, 2]]),
      // Jugées par Elmo mais sans texte : non mesurées.
      row({ window: "j1", day: 1, mentioned: true, text: "" }),
      row({ window: "j1", day: 2, mentioned: false, text: "  " }),
    ];
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR });
    const e = c.unbranded.perEngine[0]!;
    expect(e.unmeasured).toEqual({ reference: 1, current: 2 });
    expect(e.reference!.dailyRates).toEqual([{ day: 1, rate: 50 }, { day: 2, rate: 50 }]);
    expect(e.current!.dailyRates).toEqual([{ day: 1, rate: 50 }, { day: 2, rate: 50 }]);
    expect(c.unbranded.total.unmeasured).toEqual({ reference: 1, current: 2 });
  });

  it("panel différent : refus sans comparisonNote, accepté et affiché avec", () => {
    const ev = { reference: windowRows("j0", [[1, 2], [1, 2]]), current: windowRows("j1", [[1, 2], [1, 2]]) };
    const spans = { reference: REF, current: CUR };
    const noNote = bundle({ panelVersion: 2 });
    expect(() => compareWindows(noNote, "j1", ev, spans)).toThrow(/comparaison refusée.*comparisonNote/);
    const withNote = bundle({ panelVersion: 2, comparisonNote: "Question en-03 ajoutée, les autres inchangées." });
    const c = compareWindows(withNote, "j1", ev, spans);
    expect(c.panel).toEqual({ reference: 1, current: 2, note: "Question en-03 ajoutée, les autres inchangées." });
    expect(renderComparisonMarkdown(withNote, c)).toContain("Note de comparaison : Question en-03 ajoutée");
  });

  it("bootstrap reproductible : deux appels donnent un résultat identique", () => {
    const daily = [12, 40, 25, 33, 8].map((rate, i) => ({ day: i + 1, rate }));
    expect(windowRate(daily)).toEqual(windowRate(daily));
    const ev = { reference: windowRows("j0", [[1, 4], [3, 4], [2, 4]]), current: windowRows("j1", [[2, 4], [4, 4], [1, 4]]) };
    const a = compareWindows(bundle(), "j1", ev, { reference: REF, current: CUR });
    const b = compareWindows(bundle(), "j1", ev, { reference: REF, current: CUR });
    expect(a).toEqual(b);
    expect(a.bootstrap).toEqual({ seed: expect.any(Number), resamples: 2000 });
    const w = windowRate(daily)!;
    expect(w.ci95[0]).toBeLessThanOrEqual(w.mean);
    expect(w.ci95[1]).toBeGreaterThanOrEqual(w.mean);
  });

  it("concurrents recomptés sur les textes avec la liste la plus récente, pas les étiquettes d'Elmo", () => {
    const reference = [
      row({ window: "j0", day: 1, mentioned: false, text: "Rival is popular.", elmoCompetitors: ["Other Co"] }),
      row({ window: "j0", day: 2, mentioned: true, text: "Demo Subject and Newcomer Ltd.", elmoCompetitors: [] }),
      // Question marquée : hors de la part de voix.
      row({ window: "j0", day: 1, mentioned: true, prompt: "en-02", text: "Demo Subject, Rival Co, Newcomer Ltd." }),
    ];
    const current = [
      row({ window: "j1", day: 1, mentioned: false, text: "Newcomer Ltd is great.", elmoCompetitors: ["Rival Co"] }),
      row({ window: "j1", day: 2, mentioned: false, text: "Nothing to say.", elmoCompetitors: ["Rival Co"] }),
      // Non mesurée : hors de la part de voix.
      row({ window: "j1", day: 2, mentioned: false, text: "" }),
    ];
    const list = [{ name: "Rival Co", aliases: ["Rival"] }, { name: "Newcomer Ltd" }];
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR }, { competitors: list });
    expect(c.competitors.list).toEqual(["Rival Co", "Newcomer Ltd"]);
    expect(c.competitors.reference).toEqual([
      { name: "Rival Co", answers: 1, sharePct: 33.3 },
      { name: "Newcomer Ltd", answers: 1, sharePct: 33.3 },
    ]);
    expect(c.competitors.current).toEqual([
      { name: "Rival Co", answers: 0, sharePct: 0 },
      { name: "Newcomer Ltd", answers: 1, sharePct: 100 },
    ]);
    expect(c.competitors.brand).toEqual({ reference: 33.3, current: 0 });
    // Par défaut : les concurrents non rejetés du sujet.
    expect(compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR }).competitors.list).toEqual(["Rival Co"]);
  });

  it("sources et recommandations exécutées entre les deux fenêtres, sans causalité", () => {
    const reference = windowRows("j0", [[1, 2], [1, 2]], { citations: ["https://demo.example/a", "https://reddit.com/r/x"] });
    const current = windowRows("j1", [[1, 2], [1, 2]], { citations: ["https://demo.example/b", "https://www.reddit.com/r/y", "https://wiki.example/"] });
    const rec = (id: string, executedAt: string, measuredBy?: string): Recommendation => ({
      id, schemaVersion: 1, type: "TECH_FIX", clientId: "demo-subject", subjectId: "demo-subject", title: `Action ${id}`,
      statement: "Une action fictive pour le test.", evidence: [{ kind: "other", ref: "x" }],
      impact: { level: "low" }, effort: { level: "XS" }, risk: "low", confidence: "low",
      decision: { status: "accepted" }, createdBy: "test", createdAt: "2026-10-01",
      execution: { executedAt, proof: { kind: "url", ref: `https://demo.example/${id}` }, declaredBy: "Owner", ...(measuredBy ? { measuredBy } : {}) },
    });
    const recommendations = [rec("rec-before1", "2026-11-03"), rec("rec-between", "2026-11-20"), rec("rec-after1", "2026-12-10"), rec("rec-tagged", "2026-11-04", "j1")];
    const c = compareWindows(bundle(), "j1", { reference, current }, { reference: REF, current: CUR }, { recommendations });
    expect(c.sources.brandSite).toEqual({ reference: 4, current: 4 });
    expect(c.sources.topDomains).toEqual([
      { domain: "reddit.com", reference: 4, current: 4 },
      { domain: "wiki.example", reference: 0, current: 4 },
    ]);
    expect(c.executedRecommendations.map((r) => r.id)).toEqual(["rec-tagged", "rec-between"]);
    const md = renderComparisonMarkdown(bundle(), c);
    expect(md).toContain("aucune causalité n'est établie");
    expect(md).toContain("Action rec-between");
  });

  it("écrit md, html et json ; le rendu ne nomme aucun autre sujet", () => {
    const b = bundle();
    const c = compareWindows(b, "j1", { reference: windowRows("j0", [[1, 2], [1, 2]]), current: windowRows("j1", [[2, 2], [2, 2]]) }, { reference: REF, current: CUR });
    const out = mkdtempSync(join(tmpdir(), "oia-vis-compare-"));
    const mdFile = writeComparison(out, b, c);
    expect(mdFile).toBe(join(out, "comparaison-j1-j0.md"));
    for (const ext of ["md", "html", "json"]) expect(existsSync(join(out, `comparaison-j1-j0.${ext}`))).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "comparaison-j1-j0.json"), "utf8"))).toEqual(c);
    const rendered = `${readFileSync(mdFile, "utf8")}\n${readFileSync(join(out, "comparaison-j1-j0.html"), "utf8")}`.toLowerCase();
    expect(rendered).toContain("demo subject");
    const others = loadSubjects(join(ROOT, "subjects")).filter((x) => x.subject.id !== b.subject.id).flatMap(identifyingTerms);
    expect(others.length).toBeGreaterThan(0);
    for (const t of others) expect(rendered, t).not.toContain(t.toLowerCase());
  });
});
