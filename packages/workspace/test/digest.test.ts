import { describe, expect, it } from "vitest";
import type { ConsoleRecord } from "@oia/ingestion";
import { buildDigest, createDigestService, digestToMarkdown } from "../src/digest";
import { computeMetrics } from "../src/metrics";
import { recordsToCsv, recordsToMarkdown } from "../src/exports";
import type { AuditEvent } from "../src/audit";
import type { TaskItem } from "../src/items";

const NOW = "2026-09-16";

function record(over: Partial<ConsoleRecord> & { id: string }): ConsoleRecord {
  return {
    title: "A call",
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

const approve = (recordId: string): AuditEvent => ({
  id: `a-${recordId}`,
  recordId,
  action: "APPROVE",
  comment: "",
  at: "2026-09-10T00:00:00Z",
  actor: "mickael",
  gatePursueEligibleAtDecision: false,
});

describe("digest", () => {
  it("is empty — and says so honestly — when nothing needs attention", () => {
    const digest = buildDigest(NOW, {
      records: [record({ id: "quiet", deadlines: deadline("2027-06-01") })],
      tasks: [],
      auditLog: [approve("quiet")],
      tags: {},
    });
    expect(digest.implemented).toBe(true);
    expect(digest.entries).toEqual([]);
    expect(digestToMarkdown(digest)).toContain("Nothing needs you today");
  });

  it("puts overdue tasks before everything else and closing calls before triage", () => {
    const tasks: TaskItem[] = [
      { id: "t1", at: "2026-09-01T00:00:00Z", actor: "mickael", status: "OPEN", title: "Send the dossier", due: "2026-09-10" },
    ];
    const digest = buildDigest(NOW, {
      records: [
        record({ id: "closing", title: "Closing call", deadlines: deadline("2026-09-20") }),
        record({ id: "fresh", title: "Untriaged call", deadlines: deadline("2027-01-01") }),
      ],
      tasks,
      auditLog: [],
      tags: { closing: "sillon" },
    });
    expect(digest.entries.map((e) => e.reason)).toEqual(["TASK_OVERDUE", "CLOSING_SOON", "UNREVIEWED"]);
    expect(digest.entries[1]!.projectSlug).toBe("sillon");
    expect(digest.counts.CLOSING_SOON).toBe(1);
  });

  it("surfaces the approved-but-gate-blocked gap, and never promotes it", () => {
    const digest = buildDigest(NOW, {
      records: [record({ id: "blocked", gate: blockedGate, deadlines: deadline("2027-01-01") })],
      tasks: [],
      auditLog: [approve("blocked")],
      tags: {},
    });
    const entry = digest.entries.find((e) => e.reason === "APPROVED_BUT_BLOCKED");
    expect(entry).toBeDefined();
    expect(entry!.nextAction).toContain("source not human-VERIFIED");
    expect(digestToMarkdown(digest)).toContain("Approved but gate-blocked");
  });

  it("reports a call that closed under an engaged reviewer", () => {
    const digest = buildDigest(NOW, {
      records: [record({ id: "gone", deadlines: deadline("2026-09-01") })],
      tasks: [],
      auditLog: [approve("gone")],
      tags: {},
    });
    expect(digest.entries.map((e) => e.reason)).toContain("JUST_EXPIRED");
  });

  it("is reachable through the DigestService interface the skeleton declared", async () => {
    const service = createDigestService({ records: [], tasks: [], auditLog: [], tags: {} });
    const digest = await service.buildDailyDigest(NOW);
    expect(digest.implemented).toBe(true); // no longer the Phase 1 stub
  });
});

describe("metrics", () => {
  it("counts the gate's own failure reasons — the evidence backlog", () => {
    const m = computeMetrics(
      [record({ id: "a", gate: blockedGate }), record({ id: "b", gate: blockedGate })],
      [],
      { a: "sillon" },
      `${NOW}T00:00:00Z`,
    );
    expect(m.total).toBe(2);
    expect(m.pursueEligible).toBe(0);
    expect(m.gateFailures[0]).toEqual({ reason: "eligibility not assessed", count: 2 });
    expect(m.byProject).toEqual({ sillon: 1 });
    expect(m.untagged).toBe(1);
    expect(m.confidenceBuckets.find((b) => b.label === "40–59")!.count).toBe(2);
  });
});

describe("shortlist export", () => {
  const ctx = {
    auditLog: [approve("a")],
    tags: { a: "sillon" },
    projectName: (s: string) => (s === "sillon" ? "SILLON" : s),
    nowIso: `${NOW}T00:00:00Z`,
  };
  const records = [
    record({ id: "a", title: 'Call, with "quotes"', gate: blockedGate, deadlines: deadline("2026-09-20") }),
  ];

  it("carries the gate verdict and its reasons into the CSV", () => {
    const csv = recordsToCsv(records, ctx);
    const [header, row] = csv.trim().split("\n");
    expect(header).toContain("gate_failed_reasons");
    expect(row).toContain('"Call, with ""quotes"""'); // properly escaped
    expect(row).toContain("source not human-VERIFIED");
    expect(row).toContain("SILLON");
    expect(row).toContain("CLOSING_SOON");
  });

  it("never exports a blocked record as pursuable in the Markdown", () => {
    const md = recordsToMarkdown(records, ctx);
    expect(md).toContain("**Gate**: BLOCKED");
    expect(md).not.toContain("would make this PURSUE");
  });
});
