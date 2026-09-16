import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { planDiscovery, settleDiscovery } from "../src/process-requests";

/**
 * The console can ask for a search; only the workflow can run one. These two
 * functions are the handshake between them, and the property under test is the
 * one that matters to a user: a request is never reported as done unless a run
 * that covered it actually happened.
 */

interface Row {
  id: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
  requested_by: string;
  error?: string;
  result?: unknown;
}

/** A Supabase table that behaves like the two chains these functions use. */
function fakeClient(rows: Row[]) {
  const updates: { patch: Record<string, unknown>; ids: string[] }[] = [];

  function builder() {
    const filters: [string, unknown][] = [];
    let patch: Record<string, unknown> | null = null;
    let idIn: string[] | null = null;

    const settleNow = () => {
      let matched = rows.filter((r) => filters.every(([k, v]) => (r as unknown as Record<string, unknown>)[k] === v));
      if (idIn) matched = matched.filter((r) => idIn!.includes(r.id));
      if (patch) {
        for (const row of matched) Object.assign(row, patch);
        updates.push({ patch, ids: matched.map((r) => r.id) });
        return { data: null, error: null };
      }
      return { data: matched.map((r) => ({ ...r })), error: null };
    };

    const self: Record<string, unknown> = {
      select: () => self,
      order: () => self,
      limit: () => self,
      update: (p: Record<string, unknown>) => {
        patch = p;
        return self;
      },
      eq: (column: string, value: unknown) => {
        filters.push([column, value]);
        return self;
      },
      neq: () => self,
      in: (_column: string, values: string[]) => {
        idIn = values;
        return self;
      },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(settleNow()).then(resolve),
    };
    return self;
  }

  return { client: { from: () => builder() } as unknown as SupabaseClient, rows, updates };
}

function request(id: string, projects: unknown[], status = "QUEUED"): Row {
  return { id, kind: "DISCOVERY", status, payload: { projects }, requested_by: "mickael" };
}

describe("discovery requests", () => {
  it("claims queued requests and reports the union of the projects they name", async () => {
    const { client, rows } = fakeClient([request("a", ["sillon"]), request("b", ["bawaba", "sillon"])]);
    const plan = await planDiscovery(client);

    expect(plan.projects).toEqual(["bawaba", "sillon"]); // union, deduplicated, stable
    expect(plan.claimed).toBe(2);
    // Claimed means RUNNING: a second workflow run must not cover them again.
    expect(rows.every((r) => r.status === "RUNNING")).toBe(true);
  });

  it("fails one typo instead of sinking every other queued search", async () => {
    const { client, rows } = fakeClient([request("a", ["does-not-exist"]), request("b", ["sillon"])]);
    const plan = await planDiscovery(client);

    // discover:ted throws on an unknown slug, so a bad one must never reach it.
    expect(plan.projects).toEqual(["sillon"]);
    expect(rows.find((r) => r.id === "a")!.status).toBe("FAILED");
    expect(rows.find((r) => r.id === "a")!.error).toMatch(/no such project/);
    expect(rows.find((r) => r.id === "b")!.status).toBe("RUNNING");
  });

  it("keeps the good slugs of a partly-wrong request", async () => {
    const { client, rows } = fakeClient([request("a", ["sillon", "nope"])]);
    expect((await planDiscovery(client)).projects).toEqual(["sillon"]);
    expect(rows[0]!.status).toBe("RUNNING");
  });

  it("does not report a run that never happened as done", async () => {
    const { client, rows } = fakeClient([request("a", ["sillon"], "RUNNING")]);
    const closed = await settleDiscovery(client, "failure");

    expect(closed).toBe(1);
    expect(rows[0]!.status).toBe("FAILED");
    expect(rows[0]!.error).toMatch(/did not complete/);
  });

  it("closes claimed requests once the run succeeds", async () => {
    const { client, rows } = fakeClient([request("a", ["sillon"], "RUNNING"), request("b", ["bawaba"], "QUEUED")]);
    expect(await settleDiscovery(client, "success")).toBe(1);

    expect(rows.find((r) => r.id === "a")!.status).toBe("DONE");
    // Never claimed, so never closed — it waits for the next plan.
    expect(rows.find((r) => r.id === "b")!.status).toBe("QUEUED");
  });
});
