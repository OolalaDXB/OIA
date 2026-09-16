import { describe, expect, it } from "vitest";
import type { ConsoleRecord } from "@oia/ingestion/console";
import { fingerprint, isInScope, reconcile, toLedgerRow, type LedgerRow } from "../src/ledger";

const NOW = "2026-09-16T00:00:00.000Z";
const LATER = "2026-09-23T00:00:00.000Z";

function record(over: Partial<ConsoleRecord> & { id: string }): ConsoleRecord {
  return {
    title: "AI platform services",
    issuer: "European Commission",
    linkedBy: "officialUrl",
    verificationStatus: "MANUAL_REVIEW_REQUIRED",
    verificationEvidence: [],
    application: "UNKNOWN",
    award: "UNKNOWN",
    strategicRoute: "UNKNOWN",
    scores: { relevance: null, winPotential: null, infoConfidence: 40 },
    recommendation: "INVESTIGATE",
    humanReview: "PENDING",
    facts: [],
    deadlines: [],
    conflicts: [],
    discrepancies: [],
    expected: {},
    unresolvedQuestions: [],
    warnings: [],
    ...over,
  } as ConsoleRecord;
}

const deadline = (iso: string) => [
  {
    normalized: iso,
    originalSourceString: iso,
    deadlineType: "APPLICATION" as const,
    isConfirmPending: false,
    locator: { type: "JSON_PATH" as const, value: "$.deadline" },
    conflicts: [],
  },
];

const scope = (...projects: string[]) => ({ projects });

describe("fingerprint", () => {
  it("ignores churn that is not a change", () => {
    const a = record({ id: "x", warnings: ["noise"], facts: [] });
    const b = record({ id: "x-rerun", warnings: [], facts: [] });
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it("moves when something material moves", () => {
    const before = record({ id: "x", deadlines: deadline("2026-12-01") });
    const after = record({ id: "x", deadlines: deadline("2026-12-15") });
    expect(fingerprint(before)).not.toBe(fingerprint(after));
  });
});

describe("reconcile — the memory between runs", () => {
  it("first run: everything is new and gets a DISCOVERED event", () => {
    const out = reconcile({
      existing: [],
      observed: [record({ id: "a", discoveredFor: ["sillon"] })],
      scope: scope("sillon"),
      now: NOW,
    });
    expect(out.summary).toEqual({ new: 1, updated: 0, unchanged: 0, disappeared: 0 });
    expect(out.events.map((e) => e.type)).toEqual(["DISCOVERED"]);
    expect(out.inserts[0]!.firstSeenAt).toBe(NOW);
  });

  it("second run, nothing changed: no event, no alert fodder, just a sighting", () => {
    const first = toLedgerRow(record({ id: "a", discoveredFor: ["sillon"] }), NOW);
    const out = reconcile({
      existing: [first],
      observed: [record({ id: "a", discoveredFor: ["sillon"] })],
      scope: scope("sillon"),
      now: LATER,
    });
    expect(out.summary).toEqual({ new: 0, updated: 0, unchanged: 1, disappeared: 0 });
    expect(out.events).toEqual([]);
    expect(out.touched[0]!.timesSeen).toBe(2);
    expect(out.touched[0]!.firstSeenAt).toBe(NOW); // identity survives
    expect(out.touched[0]!.lastSeenAt).toBe(LATER);
  });

  it("names WHAT changed rather than reporting a generic update", () => {
    const first = toLedgerRow(record({ id: "a", discoveredFor: ["sillon"], deadlines: deadline("2026-12-01") }), NOW);
    const out = reconcile({
      existing: [first],
      observed: [
        record({
          id: "a",
          discoveredFor: ["sillon"],
          deadlines: deadline("2026-12-20"),
          recommendation: "REJECT",
        }),
      ],
      scope: scope("sillon"),
      now: LATER,
    });
    expect(out.events.map((e) => e.type).sort()).toEqual(["DEADLINE_CHANGED", "RECOMMENDATION_CHANGED"]);
    expect(out.events.find((e) => e.type === "DEADLINE_CHANGED")!.detail).toMatchObject({
      from: "2026-12-01",
      to: "2026-12-20",
    });
  });

  it("marks a record gone when the run that covered it stopped returning it", () => {
    const first = toLedgerRow(record({ id: "a", discoveredFor: ["sillon"] }), NOW);
    const out = reconcile({ existing: [first], observed: [], scope: scope("sillon"), now: LATER });
    expect(out.summary.disappeared).toBe(1);
    expect(out.disappeared[0]!.disappearedAt).toBe(LATER);
    expect(out.events.map((e) => e.type)).toEqual(["DISAPPEARED"]);
  });

  it("does NOT declare a record gone when the run did not cover all its projects", () => {
    // Surfaced by two projects; only one was queried. bawaba's query was never
    // asked, so silence about it is not evidence of absence.
    const row = toLedgerRow(record({ id: "a", discoveredFor: ["sillon", "bawaba"] }), NOW);
    const out = reconcile({ existing: [row], observed: [], scope: scope("sillon"), now: LATER });
    expect(out.summary.disappeared).toBe(0);
    expect(out.events).toEqual([]);
  });

  it("never lets an automated run bury a manually seeded record", () => {
    const manual = toLedgerRow(record({ id: "m", discoveredFor: [] }), NOW);
    expect(isInScope(manual, scope("sillon", "bawaba"))).toBe(false);
    const out = reconcile({ existing: [manual], observed: [], scope: scope("sillon", "bawaba"), now: LATER });
    expect(out.summary.disappeared).toBe(0);
  });

  it("reports a record that comes back, rather than silently resurrecting it", () => {
    const gone: LedgerRow = {
      ...toLedgerRow(record({ id: "a", discoveredFor: ["sillon"] }), NOW),
      disappearedAt: "2026-09-20T00:00:00.000Z",
    };
    const out = reconcile({
      existing: [gone],
      observed: [record({ id: "a", discoveredFor: ["sillon"] })],
      scope: scope("sillon"),
      now: LATER,
    });
    expect(out.events.map((e) => e.type)).toEqual(["REAPPEARED"]);
    expect(out.updates[0]!.disappearedAt).toBeNull();
  });

  it("accumulates discovery provenance across runs instead of overwriting it", () => {
    const first = toLedgerRow(record({ id: "a", discoveredFor: ["bawaba"] }), NOW);
    const out = reconcile({
      existing: [first],
      observed: [record({ id: "a", discoveredFor: ["sillon"], recommendation: "MONITOR" })],
      scope: scope("sillon"),
      now: LATER,
    });
    expect(out.updates[0]!.discoveredFor.sort()).toEqual(["bawaba", "sillon"]);
  });

  it("recognises the same call arriving from another source as the same row", () => {
    const fromTed = toLedgerRow(record({ id: "ted-1", discoveredFor: ["sillon"] }), NOW);
    const out = reconcile({
      existing: [fromTed],
      observed: [record({ id: "portal-99", discoveredFor: ["sillon"] })], // different id, same call
      scope: scope("sillon"),
      now: LATER,
    });
    expect(out.summary.new).toBe(0);
    expect(out.summary.unchanged).toBe(1);
  });
});
