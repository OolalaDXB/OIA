import { describe, it, expect } from "vitest";
import { extractDeadlines, evaluateDeadlineGate, annotateConflicts } from "../src/deadline";
import type { SourceLocator } from "../src/models";

const LOC: SourceLocator = { type: "CSS_SELECTOR", value: "body" };

describe("[UNIT] deadline extraction + rules (spec §9)", () => {
  it("flags a 'to be confirmed' deadline as confirm-pending (cannot be verified)", () => {
    const recs = extractDeadlines("Application deadline: 2026-09-15 (to be confirmed).", LOC);
    const app = recs.find((r) => r.normalized === "2026-09-15");
    expect(app?.isConfirmPending).toBe(true);
    const gate = evaluateDeadlineGate({ deadlines: recs, today: "2026-07-29", rollingStated: false });
    expect(gate.hasVerifiableDeadline).toBe(false);
    expect(gate.blocksPursue).toBe(true);
    expect(gate.reasons.join(" ")).toMatch(/confirm/i);
  });

  it("a clean future application deadline is verifiable and does not block", () => {
    const recs = extractDeadlines("The application deadline is 2026-09-15.", LOC);
    const gate = evaluateDeadlineGate({ deadlines: recs, today: "2026-07-29", rollingStated: false });
    expect(gate.hasVerifiableDeadline).toBe(true);
    expect(gate.blocksPursue).toBe(false);
  });

  it("an expired deadline blocks PURSUE", () => {
    const recs = extractDeadlines("Application deadline: 2024-01-10.", LOC);
    const gate = evaluateDeadlineGate({ deadlines: recs, today: "2026-07-29", rollingStated: false });
    expect(gate.isExpired).toBe(true);
    expect(gate.blocksPursue).toBe(true);
  });

  it("a missing deadline blocks PURSUE unless the source states rolling", () => {
    const none = evaluateDeadlineGate({ deadlines: [], today: "2026-07-29", rollingStated: false });
    expect(none.blocksPursue).toBe(true);
    const rolling = evaluateDeadlineGate({ deadlines: [], today: "2026-07-29", rollingStated: true });
    expect(rolling.blocksPursue).toBe(false);
  });

  it("conflicting official application dates require human review and block PURSUE", () => {
    const recs = annotateConflicts([
      ...extractDeadlines("Application deadline is 2026-09-15.", LOC),
      ...extractDeadlines("The application deadline is 2026-10-01.", LOC),
    ]);
    const gate = evaluateDeadlineGate({ deadlines: recs, today: "2026-07-29", rollingStated: false });
    expect(gate.hasConflict).toBe(true);
    expect(gate.blocksPursue).toBe(true);
  });
});
