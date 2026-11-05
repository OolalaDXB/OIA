import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkBundle, loadSubject, loadSubjects } from "../src/load";
import { renderReview } from "../src/render";
import type { SubjectBundle } from "../src/schema";

const here = dirname(fileURLToPath(import.meta.url));
const subjectsDir = join(here, "..", "subjects");
const fixture = () => loadSubject(join(here, "fixtures", "demo-subject"));
const clone = (b: SubjectBundle): SubjectBundle => structuredClone(b);

describe("subject definitions", () => {
  it("every subject in subjects/ is valid", () => {
    expect(() => loadSubjects(subjectsDir)).not.toThrow();
  });

  it("every REVIEW.md is regenerated from its YAML", () => {
    for (const b of loadSubjects(subjectsDir)) {
      expect(readFileSync(join(b.dir, "REVIEW.md"), "utf8"), `${b.subject.id}: run "subjects review ${b.subject.id} --write"`).toBe(renderReview(b));
    }
  });
});

describe("panel rules", () => {
  it("the fixture is valid", () => {
    expect(checkBundle(fixture())).toEqual([]);
  });

  it("a reworded prompt keeps its old version (never overwritten)", () => {
    const b = clone(fixture());
    const p = b.panel.prompts[0]!;
    b.panel.prompts[0] = { ...p, version: 2 }; // v1 silently replaced
    expect(checkBundle(b)).toContain(`prompt ${p.id}: version 1 missing (old versions are never deleted)`);
  });

  it("exactly one active version per prompt id", () => {
    const b = clone(fixture());
    const p = b.panel.prompts[0]!;
    b.panel.prompts.push({ ...p, version: 2, text: `${p.text} (reworded)` });
    expect(checkBundle(b)).toContain(`prompt ${p.id}: 2 active versions (exactly 1 expected)`);
  });

  it("each language needs its minimum of branded prompts", () => {
    const b = clone(fixture());
    b.panel.prompts = b.panel.prompts.map((p) => ({ ...p, family: "unbranded" as const }));
    expect(checkBundle(b).some((x) => x.includes("branded prompts < minBrandedPerLanguage"))).toBe(true);
  });

  it("a validated fact needs who and when; facts cite a declared source", () => {
    const b = clone(fixture());
    b.facts.facts.push({ id: "f-x", statement: "Something stated", language: "en", category: "other", sourceId: "nope", status: "validated" });
    const problems = checkBundle(b);
    expect(problems).toContain('fact f-x: unknown sourceId "nope"');
    expect(problems).toContain("fact f-x: validated without validatedBy / validatedAt");
  });
});
