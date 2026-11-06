import { describe, expect, it } from "vitest";
import type { Recommendation } from "../src/recommendation";
import { renderHtml, renderMarkdown, type ClientReportInput } from "../src/report-template";

const fictiveReport: ClientReportInput = {
  clientName: "Fictive Client (donnée fictive)",
  siteUrl: "https://fictive-site.example.test/",
  subjectId: "fictive-subject",
  windowId: "fictive-j0",
  perEngine: [
    {
      engine: "chatgpt",
      stats: {
        windowDays: ["2026-11-08", "2026-11-09"],
        provider: "chatgpt",
        meanBrandMentions: 4,
        rangeBrandMentions: { min: 3, max: 5 },
        meanBrandCitations: 2,
        rangeBrandCitations: { min: 1, max: 3 },
        demonstrableChange: true,
        modelVersionChanged: false,
        totalCostUsd: 0.5,
      },
    },
  ],
  citations: [{ engine: "chatgpt", url: "https://fictive-source.example.test/a", promptId: "fr-01" }],
  factualErrors: [{ factId: "f-price", engine: "claude", detail: "Dit 50 € au lieu de 42 €" }],
  recommendations: [
    {
      id: "rec-fictive-report-1",
      schemaVersion: 1,
      type: "FIX_FACT",
      clientId: "fictive-client",
      subjectId: "fictive-subject",
      title: "Claude dit 50 € au lieu de 42 €",
      statement: "Donnée fictive : erreur factuelle à corriger.",
      evidence: [{ kind: "evidence-row", ref: "fictive-id" }],
      impact: { level: "medium" },
      effort: { level: "S" },
      risk: "medium",
      confidence: "high",
      decision: { status: "pending" },
      createdBy: "seo-command-aeo",
      createdAt: "2026-11-08",
    } as Recommendation,
  ],
  limit: { note: "Donnée fictive. Aucune donnée réelle n'a été collectée cette nuit." },
};

describe("report-template", () => {
  it("renders a Markdown report with every section", () => {
    const md = renderMarkdown(fictiveReport);
    expect(md).toMatch(/^# Rapport OIA Visibility · Fictive Client/);
    expect(md).toMatch(/\| chatgpt \|/);
    expect(md).toMatch(/fictive-source\.example\.test/);
    expect(md).toMatch(/f-price/);
    expect(md).toMatch(/Claude dit 50 €/);
    expect(md).toMatch(/Limites de mesure/);
  });

  it("renders HTML with escaped content", () => {
    const html = renderHtml(fictiveReport);
    expect(html).toMatch(/<!DOCTYPE html>/);
    expect(html).toMatch(/Rapport OIA Visibility · Fictive Client/);
    expect(html).not.toMatch(/<h1>/); // naive conversion keeps <pre>, no real HTML headers.
  });

  it("handles empty sections gracefully", () => {
    const md = renderMarkdown({
      ...fictiveReport,
      citations: [],
      factualErrors: [],
      recommendations: [],
    });
    expect(md).toMatch(/_Aucune citation sur la fenêtre\._/);
    expect(md).toMatch(/_Aucune erreur factuelle détectée\._/);
    expect(md).toMatch(/_Aucune recommandation sur cette fenêtre\._/);
  });
});
