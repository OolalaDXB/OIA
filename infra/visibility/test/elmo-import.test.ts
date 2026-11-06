import { describe, expect, it } from "vitest";
import { importElmoBatch, importElmoRow, type ElmoImportContext, type ElmoRunRow } from "../src/elmo-import";

const ctx: ElmoImportContext = {
  clientId: "fictive-client",
  siteId: "fictive-site",
  subjectId: "fictive-subject",
  windowId: "fictive-j0",
  promptIndex: {
    "elmo-q-01": { id: "fr-01", version: 1, language: "fr" },
    "elmo-q-02": { id: "en-02", version: 1, language: "en" },
  },
};

function row(overrides: Partial<ElmoRunRow> = {}): ElmoRunRow {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    collected_day: "2026-11-08",
    collected_at: "2026-11-08T12:00:00Z",
    provider: "mistral",
    provider_model: "mistral-medium-latest",
    prompt_id: "elmo-q-01",
    raw_answer: "[donnée fictive] une réponse générée par le fournisseur",
    citations: [{ url: "https://fictive-source.example.test/a", label: "Fictive source A" }],
    estimated_cost_usd: 0.03,
    ...overrides,
  };
}

describe("importElmoRow", () => {
  it("maps a row to an EvidenceRow with a stable SHA-256 of raw_text", () => {
    const e = importElmoRow(row(), ctx);
    expect(e.engine).toBe("mistral");
    expect(e.engineVersion).toBe("mistral-medium-latest");
    expect(e.collectorName).toBe("elmo");
    expect(e.rawSha256Hex).toHaveLength(64);
    expect(e.promptId).toBe("fr-01");
    expect(e.promptLanguage).toBe("fr");
    expect(e.costUsd).toBe(0.03);
  });

  it("is deterministic (same input → same OIA id)", () => {
    const a = importElmoRow(row(), ctx);
    const b = importElmoRow(row(), ctx);
    expect(a.id).toBe(b.id);
    expect(a.rawSha256Hex).toBe(b.rawSha256Hex);
  });

  it("refuses an unknown prompt_id", () => {
    expect(() => importElmoRow(row({ prompt_id: "ghost" }), ctx)).toThrow(/not in promptIndex/);
  });

  it("imports a batch", () => {
    const r1 = row({ id: "11111111-1111-1111-1111-111111111111" });
    const r2 = row({ id: "22222222-2222-2222-2222-222222222222", prompt_id: "elmo-q-02", provider: "claude", provider_model: "claude-haiku-5-5" });
    const out = importElmoBatch([r1, r2], ctx);
    expect(out).toHaveLength(2);
    expect(out[0]!.id).not.toBe(out[1]!.id);
    expect(out[1]!.promptLanguage).toBe("en");
  });

  it("propagates tenancy fields", () => {
    const e = importElmoRow(row(), ctx);
    expect(e.clientId).toBe("fictive-client");
    expect(e.subjectId).toBe("fictive-subject");
    expect(e.siteId).toBe("fictive-site");
  });
});
