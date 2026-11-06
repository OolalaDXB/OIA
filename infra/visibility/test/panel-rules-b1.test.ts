import { readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { checkBundle, listSubjectDirs, loadSubject } from "../src/load";
import type { SubjectBundle } from "../src/schema";
import { PanelSchema } from "../src/schema";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = () => loadSubject(join(here, "fixtures", "demo-subject"));
const clone = (b: SubjectBundle): SubjectBundle => structuredClone(b);

describe("B1 panel rules — branded vs unbranded", () => {
  it("an unbranded prompt that mentions the subject's name is rejected", () => {
    const b = clone(fixture());
    // The fixture subject has `displayName: Demo Subject`; inject it into an unbranded prompt.
    const unbranded = b.panel.prompts.find((p) => p.family === "unbranded")!;
    b.panel.prompts = b.panel.prompts.map((p) =>
      p.id === unbranded.id
        ? { ...p, text: p.text + " Also, is Demo Subject a good choice?" }
        : p,
    );
    const problems = checkBundle(b);
    expect(problems.some((x) => x.includes("unbranded prompt contains brand term"))).toBe(true);
  });

  it("a branded prompt that forgets to mention the subject is rejected", () => {
    const b = clone(fixture());
    const branded = b.panel.prompts.find((p) => p.family === "branded")!;
    b.panel.prompts = b.panel.prompts.map((p) =>
      p.id === branded.id ? { ...p, text: "Generic question with no brand name here" } : p,
    );
    const problems = checkBundle(b);
    expect(problems.some((x) => x.includes("branded prompt does not mention any alias of the subject"))).toBe(true);
  });

  it("intent `marquee` requires family `branded`", () => {
    const b = clone(fixture());
    const unbranded = b.panel.prompts.find((p) => p.family === "unbranded")!;
    b.panel.prompts = b.panel.prompts.map((p) =>
      p.id === unbranded.id ? { ...p, intent: "marquee" as const } : p,
    );
    const problems = checkBundle(b);
    expect(problems.some((x) => x.includes('intent "marquee" must have family "branded"'))).toBe(true);
  });

  it("a branded prompt with intent other than `marquee` is rejected", () => {
    const b = clone(fixture());
    const branded = b.panel.prompts.find((p) => p.family === "branded")!;
    b.panel.prompts = b.panel.prompts.map((p) =>
      p.id === branded.id ? { ...p, intent: "comparaison" as const } : p,
    );
    const problems = checkBundle(b);
    expect(problems.some((x) => x.includes("branded prompt has intent"))).toBe(true);
  });
});

describe("B1 compatibility — live panels load unchanged with the extended schema", () => {
  const subjectsDir = join(here, "..", "subjects");
  const dirs = listSubjectDirs(subjectsDir);

  it("at least one subject is under subjects/ (prevents silent empty loop)", () => {
    expect(dirs.length).toBeGreaterThan(0);
  });

  for (const dir of dirs) {
    const id = basename(dir);
    it(`[${id}] panel.yaml re-loads with the extended schema (no field conversion)`, () => {
      const raw = readFileSync(join(dir, "panel.yaml"), "utf8");
      const parsed = PanelSchema.parse(parse(raw));
      for (const p of parsed.prompts) {
        // Neither of the two new optional fields must be injected as a default.
        expect(p.intent).toBeUndefined();
        expect(p.targetOffer).toBeUndefined();
      }
      expect(parsed.schemaVersion).toBe(1);
    });
    it(`[${id}] checkBundle does not raise on the live subject`, () => {
      expect(() => loadSubject(dir)).not.toThrow();
    });
  }

  it("at least one subject carries a validated panel (regression guard)", () => {
    const validatedIds = dirs.filter((d) => {
      const raw = readFileSync(join(d, "panel.yaml"), "utf8");
      const parsed = PanelSchema.parse(parse(raw));
      return parsed.status === "validated" && !!parsed.validatedBy && !!parsed.validatedAt;
    });
    expect(validatedIds.length).toBeGreaterThan(0);
  });
});
