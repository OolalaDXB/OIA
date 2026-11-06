import { describe, expect, it } from "vitest";
import { createFakeVisibilityLLM } from "../src/llm";
import {
  DEFAULT_MIX,
  diffPanels,
  proposePanel,
  resolveHumanValidator,
  type HumanIdentity,
} from "../src/panel-generator";
import { PanelSchema, SubjectSchema, type Subject } from "../src/schema";

function sampleSubject(languages: Array<"fr" | "en"> = ["en"]): Subject {
  return SubjectSchema.parse({
    schemaVersion: 1,
    id: "fictive-subject",
    displayName: "Fictive Subject",
    status: "draft",
    ownership: "external",
    urls: { primary: "https://fictive-subject.example.test/", additional: [] },
    languages,
    markets: languages.map((l) =>
      l === "fr"
        ? { country: "FR" as const, label: "Paris", languages: ["fr" as const], status: "confirmed" as const }
        : { country: "GB" as const, label: "London", languages: ["en" as const], status: "confirmed" as const },
    ),
    aliases: [
      { value: "Fictive Subject", kind: "name", status: "confirmed" },
      { value: "fictive-subject.example.test", kind: "domain", status: "confirmed" },
      { value: "the fictive service", kind: "offer", status: "confirmed" },
    ],
    competitors: [],
    sources: [],
  });
}

describe("proposePanel — deterministic", () => {
  it("produces a draft panel with DEFAULT_MIX per language", async () => {
    const subject = sampleSubject(["en"]);
    const panel = await proposePanel(subject, { today: "2026-11-08" });
    expect(panel.status).toBe("draft");
    const total = Object.values(DEFAULT_MIX).reduce((a, b) => a + b, 0);
    expect(panel.prompts).toHaveLength(total);
    expect(panel.prompts.filter((p) => p.family === "branded")).toHaveLength(DEFAULT_MIX.marquee);
    // Each prompt is at `status: proposed`, never `active`, never `validated`.
    for (const p of panel.prompts) {
      expect(p.status).toBe("proposed");
      expect(p.origin).toBe("generator");
      expect(p.createdAt).toBe("2026-11-08");
    }
  });

  it("is deterministic (same input → same output)", async () => {
    const subject = sampleSubject(["en"]);
    const a = await proposePanel(subject, { today: "2026-11-08" });
    const b = await proposePanel(subject, { today: "2026-11-08" });
    expect(a.prompts.map((p) => p.text)).toEqual(b.prompts.map((p) => p.text));
    expect(a.prompts.map((p) => p.id)).toEqual(b.prompts.map((p) => p.id));
  });

  it("bilingual subject gets 10 FR + 10 EN", async () => {
    const subject = sampleSubject(["fr", "en"]);
    const panel = await proposePanel(subject, { today: "2026-11-08" });
    const byLang = { fr: 0, en: 0 } as Record<string, number>;
    for (const p of panel.prompts) byLang[p.language] = (byLang[p.language] ?? 0) + 1;
    expect(byLang.fr).toBe(10);
    expect(byLang.en).toBe(10);
  });

  it("branded prompts carry the subject name; unbranded never do (B1 rule holds)", async () => {
    const subject = sampleSubject(["en"]);
    const panel = await proposePanel(subject, { today: "2026-11-08" });
    for (const p of panel.prompts) {
      const mentions = p.text.toLowerCase().includes(subject.displayName.toLowerCase());
      if (p.family === "branded") expect(mentions).toBe(true);
      else expect(mentions).toBe(false);
    }
  });

  it("optional LLM reformulation goes through VisibilityLLM.reformulate", async () => {
    const subject = sampleSubject(["en"]);
    const llm = createFakeVisibilityLLM({
      "panel.reformulate": ({ input }) => ({ text: `[fictive LLM] ${input}` }),
    });
    const panel = await proposePanel(subject, { today: "2026-11-08", llm });
    for (const p of panel.prompts) {
      expect(p.text.startsWith("[fictive LLM]")).toBe(true);
    }
  });

  it("the parsed output passes PanelSchema", async () => {
    const subject = sampleSubject(["en"]);
    const panel = await proposePanel(subject, { today: "2026-11-08" });
    expect(() => PanelSchema.parse(panel)).not.toThrow();
  });
});

describe("diffPanels", () => {
  it("reports added, removed and changed prompts", async () => {
    const subject = sampleSubject(["en"]);
    const a = await proposePanel(subject, { today: "2026-11-08" });
    const b = structuredClone(a);
    b.prompts[0] = { ...b.prompts[0]!, text: "Totally different wording about the fictive service." };
    b.prompts.pop();
    const lines = diffPanels(a, b);
    expect(lines.some((l) => l.startsWith("~"))).toBe(true);
    expect(lines.some((l) => l.startsWith("-"))).toBe(true);
  });
});

describe("resolveHumanValidator — rule 16", () => {
  const humans: HumanIdentity[] = [
    { id: "mt", email: "mt@example.test", role: "owner" },
    { id: "member", email: "member@example.test", role: "member" },
  ];

  it("refuses when OIA_SEO_IS_AGENT=1 (agent executors never validate)", () => {
    expect(() =>
      resolveHumanValidator(humans, { OIA_SEO_IS_AGENT: "1", OIA_SEO_HUMAN_IDENTITY: "mt" }),
    ).toThrow(/agent/);
  });

  it("refuses when OIA_SEO_HUMAN_IDENTITY is missing", () => {
    expect(() => resolveHumanValidator(humans, {})).toThrow(/OIA_SEO_HUMAN_IDENTITY is not set/);
  });

  it("refuses an identity absent from humans.yaml", () => {
    expect(() =>
      resolveHumanValidator(humans, { OIA_SEO_HUMAN_IDENTITY: "ghost" }),
    ).toThrow(/not found in humans.yaml/);
  });

  it("refuses a member identity (only owner can validate)", () => {
    expect(() =>
      resolveHumanValidator(humans, { OIA_SEO_HUMAN_IDENTITY: "member" }),
    ).toThrow(/does not have the "owner" role/);
  });

  it("accepts an owner identity", () => {
    const who = resolveHumanValidator(humans, { OIA_SEO_HUMAN_IDENTITY: "mt" });
    expect(who.id).toBe("mt");
    expect(who.role).toBe("owner");
  });
});
