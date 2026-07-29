import { describe, it, expect } from "vitest";
import { deriveStrategicRoute, assessTwoStage } from "../src/eligibility-stages";

describe("deriveStrategicRoute — two-stage eligibility (spec §3)", () => {
  it("application and onboarding may differ: apply-now + requires-new-entity → after-new-entity", () => {
    // The canonical example from the spec.
    const route = deriveStrategicRoute("ELIGIBLE_TO_APPLY_NOW", "REQUIRES_NEW_ENTITY");
    expect(route).toBe("ELIGIBLE_AFTER_NEW_ENTITY");
  });

  it("does not collapse into a misleading binary — the two inputs are preserved", () => {
    const a = assessTwoStage("ELIGIBLE_TO_APPLY_NOW", "REQUIRES_NEW_ENTITY");
    expect(a.application).toBe("ELIGIBLE_TO_APPLY_NOW");
    expect(a.award).toBe("REQUIRES_NEW_ENTITY");
    expect(a.strategicRoute).toBe("ELIGIBLE_AFTER_NEW_ENTITY");
  });

  it("apply-now + ready-for-award → eligible-now", () => {
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_NOW", "READY_FOR_AWARD")).toBe("ELIGIBLE_NOW");
  });

  it("structural ineligibility on the award side is terminal", () => {
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_NOW", "STRUCTURALLY_INELIGIBLE")).toBe(
      "STRUCTURALLY_INELIGIBLE",
    );
  });

  it("UNKNOWN on either axis yields UNKNOWN (no guessing)", () => {
    expect(deriveStrategicRoute("UNKNOWN", "READY_FOR_AWARD")).toBe("UNKNOWN");
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_NOW", "UNKNOWN")).toBe("UNKNOWN");
  });

  it("maps award requirements to their forward routes", () => {
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_NOW", "REQUIRES_RELOCATION")).toBe("ELIGIBLE_AFTER_RELOCATION");
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_VIA_PARTNER", "REQUIRES_LOCAL_PARTNER")).toBe("ELIGIBLE_VIA_PARTNER");
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_VIA_CONSORTIUM", "REQUIRES_CONSORTIUM")).toBe("ELIGIBLE_VIA_CONSORTIUM");
    expect(deriveStrategicRoute("ELIGIBLE_TO_APPLY_VIA_EXISTING_ENTITY", "REQUIRES_EXISTING_ENTITY_VALIDATION")).toBe("ELIGIBLE_VIA_EXISTING_ENTITY");
  });
});
