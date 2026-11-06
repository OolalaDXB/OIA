import { describe, expect, it } from "vitest";
import { createMultiBudgetGuard } from "../src/seo-command/budget-multi";

describe("MultiBudgetGuard", () => {
  it("accepts a reservation that fits everywhere", () => {
    const g = createMultiBudgetGuard({
      globalUsd: 30,
      perClientUsd: { "fictive-a": 10 },
      perSiteUsd: { "site-a": 5 },
      perProviderUsd: { chatgpt: 15 },
    });
    expect(g.reserve({ missionId: "m1", amountUsd: 2, clientId: "fictive-a", siteId: "site-a", provider: "chatgpt" }))
      .toEqual({ ok: true });
  });

  it("refuses at the first cap that overflows (client here)", () => {
    const g = createMultiBudgetGuard({
      globalUsd: 100,
      perClientUsd: { "fictive-a": 10 },
    });
    expect(g.reserve({ missionId: "m1", amountUsd: 8, clientId: "fictive-a" })).toEqual({ ok: true });
    const r = g.reserve({ missionId: "m2", amountUsd: 5, clientId: "fictive-a" });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe("client");
  });

  it("refuses at the global cap when a client has no cap of its own", () => {
    const g = createMultiBudgetGuard({ globalUsd: 5 });
    expect(g.reserve({ missionId: "m1", amountUsd: 4, clientId: "fictive-a" })).toEqual({ ok: true });
    const r = g.reserve({ missionId: "m2", amountUsd: 2, clientId: "fictive-b" });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe("global");
  });

  it("settle releases the reservation and counts real spent", () => {
    const g = createMultiBudgetGuard({ globalUsd: 10, perClientUsd: { "fictive-a": 10 } });
    g.reserve({ missionId: "m1", amountUsd: 5, clientId: "fictive-a" });
    g.settle({ missionId: "m1", costUsd: 3, clientId: "fictive-a" });
    const s = g.snapshot();
    expect(s.spent.client["fictive-a"]).toBe(3);
    expect(s.reserved.client["fictive-a"] ?? 0).toBe(0);
  });

  it("is idempotent on the mission id", () => {
    const g = createMultiBudgetGuard({ globalUsd: 10, perClientUsd: { "fictive-a": 6 } });
    g.reserve({ missionId: "m1", amountUsd: 5, clientId: "fictive-a" });
    expect(g.reserve({ missionId: "m1", amountUsd: 5, clientId: "fictive-a" })).toEqual({ ok: true });
    const s = g.snapshot();
    expect(s.reserved.client["fictive-a"]).toBe(5);
  });

  it("refuses at provider level when the provider cap is reached", () => {
    const g = createMultiBudgetGuard({ globalUsd: 100, perProviderUsd: { chatgpt: 2 } });
    expect(g.reserve({ missionId: "m1", amountUsd: 1.5, clientId: "fictive-a", provider: "chatgpt" })).toEqual({ ok: true });
    const r = g.reserve({ missionId: "m2", amountUsd: 1, clientId: "fictive-b", provider: "chatgpt" });
    expect(r.ok).toBe(false);
    expect(r.blockedBy).toBe("provider");
  });
});
