import { describe, it, expect } from "vitest";
import { createPolicy, DEFAULT_POLICY } from "../src/policy";

describe("policy.canFetch (fail-closed)", () => {
  const policy = createPolicy();

  it("allows allow-listed EU hosts", async () => {
    expect((await policy.canFetch("https://api.tech.ec.europa.eu/x")).allowed).toBe(true);
    expect((await policy.canFetch("https://ec.europa.eu/info")).allowed).toBe(true);
  });

  it("denies hosts not on the allow-list", async () => {
    const d = await policy.canFetch("https://random-aggregator.example/list");
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("allow-list");
  });

  it("denies invalid URLs", async () => {
    expect((await policy.canFetch("not a url")).allowed).toBe(false);
  });

  it("denies everything when the allow-list is empty (fail-closed)", async () => {
    const strict = createPolicy({ ...DEFAULT_POLICY, fetchAllowlist: [] });
    expect((await strict.canFetch("https://ec.europa.eu")).allowed).toBe(false);
  });
});

describe("policy.canAutoRecommend", () => {
  const policy = createPolicy();

  it("permits CONSIDER / MONITOR / DISCARD autonomously", async () => {
    for (const a of ["CONSIDER", "MONITOR", "DISCARD"]) {
      expect((await policy.canAutoRecommend(a)).allowed).toBe(true);
    }
  });

  it("requires human sign-off for PURSUE (OD-6)", async () => {
    const d = await policy.canAutoRecommend("PURSUE");
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain("human sign-off");
  });
});
