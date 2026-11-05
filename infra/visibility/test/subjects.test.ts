import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { activeFreezes, checkBundle, loadSubject, loadSubjects } from "../src/load";
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

  it("exactly one non-retired version per prompt id", () => {
    const b = clone(fixture());
    const p = b.panel.prompts[0]!;
    b.panel.prompts.push({ ...p, version: 2, text: `${p.text} (reworded)` });
    expect(checkBundle(b)).toContain(`prompt ${p.id}: 2 non-retired versions (exactly 1 expected)`);
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

describe("candidates and provenance", () => {
  it("a candidate is a valid current version and is not counted as active", () => {
    const b = clone(fixture());
    b.panel.prompts.push({ ...b.panel.prompts[0]!, id: "en-99", status: "candidate" });
    expect(checkBundle(b)).toEqual([]);
  });

  it("a prompt taken from a document must name a declared source", () => {
    const b = clone(fixture());
    b.panel.prompts[0] = { ...b.panel.prompts[0]!, origin: "document" };
    expect(checkBundle(b)).toContain("prompt en-01@1: origin document without sourceId");
    b.panel.prompts[0] = { ...b.panel.prompts[0]!, sourceId: "nope" };
    expect(checkBundle(b)).toContain('prompt en-01@1: unknown sourceId "nope"');
  });
});

describe("measurement plan", () => {
  it("a window cannot run on a draft panel", () => {
    const b = clone(fixture());
    b.measurement.windows[0] = { ...b.measurement.windows[0]!, status: "running", start: "2026-01-02" };
    expect(checkBundle(b)).toContain("window j0: running while panel v1 is not validated");
  });

  it("a freeze must name an existing window", () => {
    const b = clone(fixture());
    b.measurement.freezes[0] = { ...b.measurement.freezes[0]!, untilEndOfWindow: "j9" };
    expect(checkBundle(b)).toContain('freeze freeze-j0: unknown window "j9"');
  });

  it("a freeze is in force until its window is done", () => {
    const b = clone(fixture());
    expect(activeFreezes(b).map((f) => f.id)).toEqual(["freeze-j0"]);
    b.panel.status = "validated";
    b.panel.validatedBy = "Owner";
    b.panel.validatedAt = "2026-01-01";
    b.measurement.windows[0] = { ...b.measurement.windows[0]!, status: "done", start: "2026-01-02", end: "2026-01-06" };
    expect(checkBundle(b)).toEqual([]);
    expect(activeFreezes(b)).toEqual([]);
  });
});
