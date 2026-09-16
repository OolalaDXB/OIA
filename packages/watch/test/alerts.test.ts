import { describe, expect, it } from "vitest";
import type { ConsoleRecord } from "@oia/ingestion/console";
import { evaluateAlerts, newAlertsOnly } from "../src/alerts";
import { reconcile, toLedgerRow } from "../src/ledger";

const NOW = "2026-09-16T00:00:00.000Z";

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

const blockedGate = {
  accessiblePrimarySource: true,
  verifiedSource: false,
  verifiedDeadline: true,
  notExpired: true,
  eligibilityAssessed: false,
  notAggregatorOnly: true,
  notClosedCall: true,
  hasExactNextAction: false,
  sufficientConfidence: false,
  pursueEligible: false,
  failedReasons: ["source not human-VERIFIED", "eligibility not assessed"],
};

const noReview = () => "PENDING" as const;
const noTag = () => undefined;

describe("alert rules", () => {
  it("raises a new-match alert only when the record is attached to a project", () => {
    const attached = reconcile({
      existing: [],
      observed: [record({ id: "a", discoveredFor: ["sillon"] })],
      scope: { projects: ["sillon"] },
      now: NOW,
    });
    const orphan = reconcile({
      existing: [],
      observed: [record({ id: "b", discoveredFor: [] })],
      scope: { projects: [] },
      now: NOW,
    });

    const withProject = evaluateAlerts({
      rows: attached.inserts,
      events: attached.events,
      reviewOf: noReview,
      tagOf: noTag,
      now: NOW,
    });
    const without = evaluateAlerts({
      rows: orphan.inserts,
      events: orphan.events,
      reviewOf: noReview,
      tagOf: noTag,
      now: NOW,
    });

    expect(withProject.map((a) => a.kind)).toEqual(["NEW_MATCH"]);
    expect(withProject[0]!.projectSlug).toBe("sillon");
    // Unattached records belong in the triage queue, not in an interruption.
    expect(without).toEqual([]);
  });

  it("is idempotent: the same closing call does not re-alert on every run", () => {
    const row = toLedgerRow(record({ id: "a", discoveredFor: ["sillon"], deadlines: deadline("2026-09-20") }), NOW);
    const first = evaluateAlerts({ rows: [row], events: [], reviewOf: noReview, tagOf: noTag, now: NOW });
    expect(first.map((a) => a.kind)).toEqual(["CLOSING_SOON"]);

    // A week of daily evaluations produces the same hash every time.
    const later = evaluateAlerts({
      rows: [row],
      events: [],
      reviewOf: noReview,
      tagOf: noTag,
      now: "2026-09-18T00:00:00.000Z",
    });
    expect(later[0]!.dedupHash).toBe(first[0]!.dedupHash);
    expect(newAlertsOnly(later, new Set([first[0]!.dedupHash]))).toEqual([]);
  });

  it("but a deadline that MOVES is a new thing to know", () => {
    const before = toLedgerRow(record({ id: "a", discoveredFor: ["s"], deadlines: deadline("2026-09-20") }), NOW);
    const after = toLedgerRow(record({ id: "a", discoveredFor: ["s"], deadlines: deadline("2026-09-25") }), NOW);
    const a = evaluateAlerts({ rows: [before], events: [], reviewOf: noReview, tagOf: noTag, now: NOW });
    const b = evaluateAlerts({ rows: [after], events: [], reviewOf: noReview, tagOf: noTag, now: NOW });
    expect(a[0]!.dedupHash).not.toBe(b[0]!.dedupHash);
  });

  it("orders the urgent first: expired before closing before new", () => {
    const rows = [
      toLedgerRow(record({ id: "new", title: "New one", discoveredFor: ["s"] }), NOW),
      toLedgerRow(record({ id: "closing", title: "Closing one", discoveredFor: ["s"], deadlines: deadline("2026-09-20") }), NOW),
      toLedgerRow(record({ id: "gone", title: "Gone one", discoveredFor: ["s"], deadlines: deadline("2026-09-01") }), NOW),
    ];
    const alerts = evaluateAlerts({
      rows,
      events: [{ watchKey: rows[0]!.watchKey, type: "DISCOVERED", at: NOW, detail: {} }],
      reviewOf: (id) => (id === "gone" ? "APPROVE" : "PENDING"),
      tagOf: noTag,
      now: NOW,
    });
    expect(alerts.map((a) => a.kind)).toEqual(["JUST_EXPIRED", "CLOSING_SOON", "NEW_MATCH"]);
  });

  it("stays quiet about an expired call nobody had engaged with", () => {
    const row = toLedgerRow(record({ id: "a", discoveredFor: ["s"], deadlines: deadline("2026-09-01") }), NOW);
    const alerts = evaluateAlerts({ rows: [row], events: [], reviewOf: noReview, tagOf: noTag, now: NOW });
    expect(alerts).toEqual([]);
  });

  it("surfaces approved-but-blocked with the exact conditions to clear, and never promotes", () => {
    const row = toLedgerRow(
      record({ id: "a", discoveredFor: ["s"], gate: blockedGate, deadlines: deadline("2027-01-01") }),
      NOW,
    );
    const alerts = evaluateAlerts({
      rows: [row],
      events: [],
      reviewOf: () => "APPROVE",
      tagOf: noTag,
      now: NOW,
    });
    const blocked = alerts.find((a) => a.kind === "APPROVED_BUT_BLOCKED")!;
    expect(blocked.nextAction).toContain("source not human-VERIFIED");
    expect(row.gatePursueEligible).toBe(false); // the alert changed nothing
  });

  it("prefers the human's project tag over discovery provenance", () => {
    const row = toLedgerRow(record({ id: "a", discoveredFor: ["bawaba"], deadlines: deadline("2026-09-20") }), NOW);
    const alerts = evaluateAlerts({
      rows: [row],
      events: [],
      reviewOf: noReview,
      tagOf: () => "maisons-co",
      now: NOW,
    });
    expect(alerts[0]!.projectSlug).toBe("maisons-co");
  });

  it("reports a withdrawal only to someone who had engaged with the call", () => {
    const row = toLedgerRow(record({ id: "a", discoveredFor: ["s"] }), NOW);
    const event = { watchKey: row.watchKey, type: "DISAPPEARED" as const, at: NOW, detail: {} };
    const ignored = evaluateAlerts({ rows: [row], events: [event], reviewOf: noReview, tagOf: noTag, now: NOW });
    const engaged = evaluateAlerts({
      rows: [row],
      events: [event],
      reviewOf: () => "NEEDS_VERIFICATION",
      tagOf: noTag,
      now: NOW,
    });
    expect(ignored.find((a) => a.kind === "DISAPPEARED")).toBeUndefined();
    expect(engaged.find((a) => a.kind === "DISAPPEARED")).toBeDefined();
  });
});
