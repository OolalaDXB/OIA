import { describe, expect, it } from "vitest";
import { SOURCE_REGISTRY } from "@oia/registry";
import { scoutableSources } from "../src/scout-aid";

/**
 * Which sources an agent with a browser is allowed to visit.
 *
 * The exclusion that matters is not technical. Upwork, Malt, Comet, Acquire and
 * Flippa forbid automated collection in their terms; owning a browser that could
 * does not make it permitted, and the account at risk would be the owner's. So
 * BLOCKED is enforced in code and asserted here, rather than being a note in a
 * YAML file that a future change could quietly step over.
 */
describe("what the scout is allowed to read", () => {
  const all = SOURCE_REGISTRY.sources;

  it("never visits a BLOCKED source, whatever else is asked for", () => {
    const blocked = all.filter((s) => s.status === "BLOCKED").map((s) => s.id);
    expect(blocked.length).toBeGreaterThan(0); // the rule would be vacuous otherwise

    for (const id of blocked) {
      // Even named explicitly on the command line.
      expect(scoutableSources(all, id)).toEqual([]);
    }
    expect(scoutableSources(all).some((s) => s.status === "BLOCKED")).toBe(false);
  });

  it("covers the declared sources that were the whole point", () => {
    const ids = scoutableSources(all).map((s) => s.id);
    // The French and Emirati aid sources that sat unread in YAML.
    for (const id of ["region-bretagne", "aides-territoires", "bpifrance", "france-2030-ademe", "cir-cii-jei", "hub71", "adio"]) {
      expect(ids).toContain(id);
    }
  });

  it("leaves LIVE sources to their connector instead of browsing them", () => {
    // TED has a real API; pointing a browser at it would be strictly worse.
    expect(scoutableSources(all).map((s) => s.id)).not.toContain("ted");
  });

  it("skips a source with no URL rather than navigating to nothing", () => {
    const withoutUrl = [{ ...all[0]!, id: "no-url", status: "DECLARED" as const, url: "" }];
    expect(scoutableSources(withoutUrl)).toEqual([]);
  });

  it("honours an explicit subset", () => {
    expect(scoutableSources(all, "region-bretagne,hub71").map((s) => s.id).sort()).toEqual([
      "hub71",
      "region-bretagne",
    ]);
  });
});
