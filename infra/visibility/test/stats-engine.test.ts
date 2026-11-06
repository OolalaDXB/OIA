import { describe, expect, it } from "vitest";
import { aggregateWindow, missingDays, type DailySample } from "../src/stats/engine";

function sample(overrides: Partial<DailySample>): DailySample {
  return {
    day: "2026-11-08",
    provider: "chatgpt",
    modelVersion: "v1",
    prompts: 10,
    brandMentions: 5,
    brandCitations: 3,
    costUsd: 0.1,
    ...overrides,
  };
}

describe("aggregateWindow", () => {
  it("returns null on empty input", () => {
    expect(aggregateWindow([])).toBeNull();
  });

  it("refuses to mix providers", () => {
    expect(() =>
      aggregateWindow([sample({}), sample({ provider: "claude" })]),
    ).toThrow(/more than one provider/);
  });

  it("averages mentions and reports the range", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", brandMentions: 5 }),
      sample({ day: "2026-11-09", brandMentions: 6 }),
      sample({ day: "2026-11-10", brandMentions: 4 }),
    ])!;
    expect(stats.meanBrandMentions).toBeCloseTo(5, 5);
    expect(stats.rangeBrandMentions).toEqual({ min: 4, max: 6 });
  });

  it("detects a model version change", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", modelVersion: "v1" }),
      sample({ day: "2026-11-09", modelVersion: "v2" }),
    ])!;
    expect(stats.modelVersionChanged).toBe(true);
  });

  it("monotonic rise is demonstrable", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", brandMentions: 1 }),
      sample({ day: "2026-11-09", brandMentions: 3 }),
      sample({ day: "2026-11-10", brandMentions: 5 }),
    ])!;
    expect(stats.demonstrableChange).toBe(true);
  });

  it("monotonic fall is demonstrable", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", brandMentions: 5 }),
      sample({ day: "2026-11-09", brandMentions: 3 }),
      sample({ day: "2026-11-10", brandMentions: 1 }),
    ])!;
    expect(stats.demonstrableChange).toBe(true);
  });

  it("a dip anywhere turns it into noise (not demonstrable)", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", brandMentions: 1 }),
      sample({ day: "2026-11-09", brandMentions: 5 }),
      sample({ day: "2026-11-10", brandMentions: 3 }),
    ])!;
    expect(stats.demonstrableChange).toBe(false);
  });

  it("flat series is not demonstrable (no change at all)", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", brandMentions: 5 }),
      sample({ day: "2026-11-09", brandMentions: 5 }),
      sample({ day: "2026-11-10", brandMentions: 5 }),
    ])!;
    expect(stats.demonstrableChange).toBe(false);
  });

  it("sums costs across the window", () => {
    const stats = aggregateWindow([
      sample({ day: "2026-11-08", costUsd: 1.5 }),
      sample({ day: "2026-11-09", costUsd: 2.5 }),
    ])!;
    expect(stats.totalCostUsd).toBeCloseTo(4, 5);
  });
});

describe("missingDays", () => {
  it("returns the delta between the theoretical window and what was observed", () => {
    expect(
      missingDays(["2026-11-08", "2026-11-09", "2026-11-10"], ["2026-11-08", "2026-11-10"]),
    ).toEqual(["2026-11-09"]);
  });
});
