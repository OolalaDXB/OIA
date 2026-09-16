import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ScoutResultSchema, anchorViolations, type ScoutPage } from "../src/scout";

/**
 * A real Mistral response, captured from a real run against
 * aides-territoires.beta.gouv.fr/programmes/.
 *
 * It contains SIXTY-FIVE French funding programmes, correctly named, with real
 * URLs and quotes copied from the page. Four consecutive runs reported "0 calls
 * found" and threw every one of them away, because the model wrapped its answer
 * in {"ScoutResult": …} — obeying the provider's own instruction to return "a
 * single JSON object for ScoutResult" — and named its fields `name`, `amount`
 * and `deadline` instead of `title`, `amountText` and `deadlineText`.
 *
 * The model was never wrong. This fixture exists so that can never again be
 * discovered by spending another run.
 */
const RAW = JSON.parse(
  readFileSync(join(__dirname, "fixtures", "mistral-aides-territoires.json"), "utf8"),
) as unknown;

describe("the real response that four runs discarded", () => {
  it("parses all 65 programmes instead of none", () => {
    const parsed = ScoutResultSchema.parse(RAW);
    expect(parsed.calls).toHaveLength(65);
  });

  it("maps the model's field names onto ours", () => {
    const first = ScoutResultSchema.parse(RAW).calls[0]!;
    expect(first.title).toBe("4ème Programme d’investissements d’avenir - PIA 4");
    expect(first.amountText).toBe("20 milliards d’euros");
    expect(first.sourceUrl).toContain("aides-territoires.beta.gouv.fr/programmes/");
    expect(first.quote).toContain("20 milliards d’euros pour l’innovation");
  });

  it("keeps a programme with no deadline — the whole point of widening the prompt", () => {
    const parsed = ScoutResultSchema.parse(RAW);
    const openEnded = parsed.calls.filter((c) => c.deadlineText === "");
    expect(openEnded.length).toBeGreaterThan(0);
    // Permanently open schemes are opportunities, not noise to be filtered out.
    expect(openEnded[0]!.title.length).toBeGreaterThan(3);
  });

  it("survives the anchor guard when the links are really on the page", () => {
    const parsed = ScoutResultSchema.parse(RAW);
    const page: ScoutPage = {
      url: "https://aides-territoires.beta.gouv.fr/programmes/",
      text: parsed.calls.map((c) => c.quote).join("\n"),
      links: parsed.calls.map((c) => c.sourceUrl),
    };
    const { kept, dropped } = anchorViolations(page, parsed.calls);
    expect(kept.length).toBe(65);
    expect(dropped).toHaveLength(0);
  });

  it("still drops one of those programmes if its link is not on the page", () => {
    // The guard must not have been loosened by the alias mapping.
    const parsed = ScoutResultSchema.parse(RAW);
    const page: ScoutPage = {
      // Same text as the passing case, so ONLY the missing link differs and the
      // test cannot pass for the wrong reason.
      url: "https://aides-territoires.beta.gouv.fr/programmes/",
      text: parsed.calls.map((c) => c.quote).join("\n"),
      links: parsed.calls.slice(1).map((c) => c.sourceUrl),
    };
    const { kept, dropped } = anchorViolations(page, parsed.calls);
    expect(kept).toHaveLength(64);
    expect(dropped[0]!.reason).toMatch(/not on the page/);
  });
});
