import { describe, expect, it } from "vitest";
import { buildImport, COLLECTOR, importSql, inventory, JUGE } from "../src/elmo-import-final.js";
import { sha256Hex } from "../src/evidence-store.js";
import { uuidStable } from "../src/vis-sync.js";
import { exportElmo, HORS, sujet } from "./fixtures/elmo-export-fictif.js";

describe("import final d'Elmo (v14, bloc B)", () => {
  const rows = buildImport([sujet()], exportElmo());
  const byRun = (n: number) => rows.find((r) => r.collector_run_id.endsWith(String(n)))!;

  it("toutes les réponses, avec l'identifiant de vis-sync et l'empreinte du texte d'Elmo", () => {
    expect(rows).toHaveLength(4);
    const r = byRun(1);
    expect(r).toMatchObject({ id: uuidStable("elmo:00000000-0000-4000-8000-000000000001"), collector_name: COLLECTOR, window_id: "demo-subject-j0", prompt_id: "en-01", prompt_version: 1, received_at: "2026-01-01T10:00:05Z", raw_text: "Demo Subject is great.", sha: sha256Hex("Demo Subject is great.") });
    expect(r.citations.map((c) => c.url)).toEqual(["https://a.example/", "https://b.example/"]);
    expect(r.structured).toMatchObject({ brandMentioned: true, jugement: JUGE, coutEstimeElmoUsd: 0.009, webQueries: ["demo tools"], localEvidenceId: "elmo:00000000-0000-4000-8000-000000000001" });
    expect((r.structured.rawOutput as { usage: unknown }).usage).toBeTruthy();
  });

  it("réponse sans texte : texte vide, non mesurée, jugement d'Elmo seulement sous jev", () => {
    const r = byRun(2);
    expect(r.raw_text).toBe("");
    expect(r.structured).toMatchObject({ non_mesuree: true, brandMentioned: null, competitorsMentioned: [], jev: { statut: JUGE, brandMentioned: false, competitorsMentioned: ["Rival Co"] } });
  });

  it("hors panel et hors fenêtre : importées, rangées à part et marquées", () => {
    expect(byRun(3)).toMatchObject({ window_id: "demo-subject-j0-hors-panel", prompt_id: HORS, scope: "hors-panel" });
    expect(byRun(3).structured).toMatchObject({ hors_panel: true, questionElmo: "Ajoutée à la main" });
    expect(byRun(4)).toMatchObject({ window_id: "demo-subject-hors-fenetre", scope: "hors-fenetre" });
    expect(inventory(rows).bySubject["demo-subject"]).toMatchObject({ runs: 4, panel: 2, horsPanel: 1, horsFenetre: 1, nonMesurees: 1 });
  });

  it("SQL : une transaction, ajout seul, contrôles d'empreinte et de fenêtre, fenêtres annexes notées", () => {
    const sql = importSql([sujet()], rows, "test");
    expect(sql).toMatch(/^-- Import final d'Elmo/);
    expect(sql).toMatch(/\nbegin;[\s\S]*\ncommit;\n$/);
    expect(sql).toMatch(/on conflict \(id\) do nothing/);
    expect(sql).toMatch(/ne correspondent pas au texte d''Elmo/);
    expect(sql).toMatch(/'demo-subject-j0-hors-panel'.*'Réponses d''Elmo aux questions hors panel/);
    expect(sql).not.toMatch(/\b(update|delete)\s+(from\s+)?vis\./i);
  });

  it("refuse une marque sans sujet OIA", () => {
    const exp = exportElmo();
    exp.prompt_runs[0]!.brand_id = "inconnu";
    expect(() => buildImport([sujet()], exp)).toThrow(/marque « inconnu » sans sujet OIA/);
  });
});
