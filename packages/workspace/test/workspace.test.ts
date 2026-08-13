import { describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  latestReviewStatus,
  opportunityToRecord,
  stubDigestService,
  stubSuggestionService,
  type AuditEvent,
} from "../src/index";
import type { ConsoleRecord } from "@oia/ingestion";

const minimalOpportunity = {
  id: "283014-2016",
  title: "Test notice",
  issuer: "TED",
  linkedBy: "officialUrl",
  officialUrl: "https://ted.europa.eu/en/notice/283014-2016/html",
  verificationStatus: "MANUAL_REVIEW_REQUIRED",
  verificationEvidence: [],
  application: "UNKNOWN",
  award: "UNKNOWN",
  strategicRoute: "UNKNOWN",
  scores: { relevance: null, winPotential: null, infoConfidence: 30 },
  recommendation: "INVESTIGATE",
  humanReview: "PENDING",
  facts: [],
  deadlines: [],
  conflicts: [],
  discrepancies: [],
  expected: {},
  unresolvedQuestions: [],
  warnings: [],
} as unknown as ConsoleRecord;

const ev = (n: number, action: AuditEvent["action"], recordId = "283014-2016"): AuditEvent => ({
  id: `e${n}`,
  recordId,
  action,
  comment: "",
  at: `2026-08-13T00:0${n}:00Z`,
  actor: "test",
  gatePursueEligibleAtDecision: false,
});

describe("workspace record envelope", () => {
  it("wraps a ConsoleRecord without redefining it", () => {
    const r = opportunityToRecord(minimalOpportunity);
    expect(r.kind).toBe("OPPORTUNITY");
    expect(r.id).toBe(minimalOpportunity.id);
    expect(r.payload).toBe(minimalOpportunity); // same object, no copy/DTO
  });
});

describe("append-only audit", () => {
  it("appends without mutating the existing log", () => {
    const log: AuditEvent[] = [ev(1, "APPROVE")];
    const next = appendAuditEvent(log, ev(2, "REJECT"));
    expect(log).toHaveLength(1); // untouched
    expect(next).toHaveLength(2);
    expect(next[0]).toBe(log[0]);
  });

  it("derives the latest review status, ignoring COMMENT events", () => {
    const log = [ev(1, "APPROVE"), ev(2, "COMMENT"), ev(3, "REJECT"), ev(4, "COMMENT")];
    expect(latestReviewStatus(log, "283014-2016")).toBe("REJECT");
    expect(latestReviewStatus(log, "unknown")).toBe("PENDING");
    expect(latestReviewStatus([], "283014-2016")).toBe("PENDING");
  });
});

describe("phase stubs are honest", () => {
  it("suggestion stub returns no fabricated suggestions", async () => {
    await expect(stubSuggestionService.suggestProjects(minimalOpportunity)).resolves.toEqual([]);
  });

  it("digest stub flags itself unimplemented", async () => {
    const d = await stubDigestService.buildDailyDigest("2026-08-13");
    expect(d.implemented).toBe(false);
    expect(d.entries).toEqual([]);
  });
});
