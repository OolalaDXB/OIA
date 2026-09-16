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
    for (const id of ["aides-territoires", "france-2030-ademe", "cir-cii-jei", "hub71", "adio"]) {
      expect(ids).toContain(id);
    }
  });

  /**
   * Région Bretagne and Bpifrance answer an automated browser with a security
   * challenge. They were DECLARED and scoutable until the first real run showed
   * the refusal; they are BLOCKED now, and this asserts the scout respects that
   * rather than a future change quietly deciding to push through it.
   */
  it("stays out of sources that answered with a security challenge", () => {
    const ids = scoutableSources(all).map((s) => s.id);
    expect(ids).not.toContain("region-bretagne");
    expect(ids).not.toContain("bpifrance");
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
    expect(scoutableSources(all, "adio,hub71").map((s) => s.id).sort()).toEqual(["adio", "hub71"]);
  });
});
