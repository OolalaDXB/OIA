import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RecommendationSchema } from "../src/recommendation";

const here = dirname(fileURLToPath(import.meta.url));
const subjectsDir = join(here, "..", "subjects");

// Chaque recommandation posée sous subjects/<id>/audits/*/recommendations/
// doit parser contre le schéma E2. Un oubli d'un champ, une clé mal nommée,
// ou un risque "high" passé à "accepted" fait tomber ce test.

function allRecommendationFiles(): string[] {
  const out: string[] = [];
  for (const sub of readdirSync(subjectsDir)) {
    const auditRoot = join(subjectsDir, sub, "audits");
    let auditDates: string[];
    try {
      auditDates = readdirSync(auditRoot);
    } catch {
      continue;
    }
    for (const d of auditDates) {
      const recDir = join(auditRoot, d, "recommendations");
      let files: string[];
      try {
        files = readdirSync(recDir);
      } catch {
        continue;
      }
      for (const f of files) if (f.endsWith(".json")) out.push(join(recDir, f));
    }
  }
  return out;
}

describe("E4 recommendations load against the E2 schema", () => {
  const files = allRecommendationFiles();
  it("at least one recommendation file exists (prevents a silent empty loop)", () => {
    expect(files.length).toBeGreaterThan(0);
  });
  for (const file of files) {
    it(file.replace(subjectsDir, ""), () => {
      const raw = JSON.parse(readFileSync(file, "utf8"));
      expect(() => RecommendationSchema.parse(raw)).not.toThrow();
      expect(raw.decision.status).toBe("pending");
    });
  }
});
