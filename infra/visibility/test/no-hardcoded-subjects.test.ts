import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { identifyingTerms, loadSubjects } from "../src/load";
import { findTerms, listTextFiles } from "../src/scan";

const toolRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Not code: the subject definitions themselves, and run reports about them. */
const EXCLUDED = ["subjects", "reports"];

describe("genericity: no subject is named in the tool", () => {
  it("no identifying term of any defined subject appears outside subjects/ and reports/", () => {
    const subjects = loadSubjects(join(toolRoot, "subjects"));
    expect(subjects.length).toBeGreaterThan(0);
    const terms = subjects.flatMap(identifyingTerms);
    const hits = findTerms(listTextFiles(toolRoot, EXCLUDED), terms, toolRoot);
    expect(hits, hits.map((h) => `${h.file}:${h.line} names "${h.term}"`).join("\n")).toEqual([]);
  });

  it("the scan does detect a hard-coded subject (self-test, with accents and case changed)", () => {
    const root = mkdtempSync(join(tmpdir(), "oia-vis-scan-"));
    mkdirSync(join(root, "subjects", "x"), { recursive: true });
    writeFileSync(join(root, "subjects", "x", "note.md"), "Café Zébulon is fine here");
    mkdirSync(join(root, "scripts"));
    writeFileSync(join(root, "scripts", "run.sh"), 'URL="https://cafe-zebulon.example"\necho "CAFE ZEBULON"\n');
    writeFileSync(join(root, "ok.ts"), "const zebulonish = 1; // a longer word is not a hit\n");
    const hits = findTerms(listTextFiles(root, ["subjects"]), ["Café Zébulon", "cafe-zebulon.example"], root);
    expect(hits.map((h) => `${h.file}:${h.line}:${h.term}`)).toEqual([
      "scripts/run.sh:1:cafe-zebulon.example",
      "scripts/run.sh:2:Café Zébulon",
    ]);
  });
});
