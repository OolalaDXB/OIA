import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** [UI_INTEGRATION] The web app must reuse @oia domain types, not redefine DTOs (spec §18.12). */
const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("[UI_INTEGRATION] web imports domain types, does not redefine DTOs", () => {
  const consoleTsx = read("../src/app/(console)/Console.tsx");
  const loadData = read("../src/lib/loadData.ts");

  it("imports ConsoleData/ConsoleRecord from @oia/ingestion", () => {
    expect(consoleTsx).toContain('from "@oia/ingestion/console"');
    expect(loadData).toContain('from "@oia/ingestion/console"');
  });

  it("does not declare its own ConsoleRecord/ConsoleData interfaces", () => {
    for (const src of [consoleTsx, loadData]) {
      expect(src).not.toMatch(/interface\s+ConsoleRecord\b/);
      expect(src).not.toMatch(/interface\s+ConsoleData\b/);
    }
  });
});
