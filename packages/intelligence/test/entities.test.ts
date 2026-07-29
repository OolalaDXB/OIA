import { describe, it, expect } from "vitest";
import {
  BAWABA_ENTITIES,
  isEntityCurrentlyAvailable,
  activeEntities,
  activeEntitiesForJurisdiction,
  currentAvailabilityBlocker,
  getEntity,
  hypotheticalEntity,
} from "../src/entities";

describe("BAWABA entity inventory (spec §2)", () => {
  it("planned entity cannot produce current eligibility", () => {
    const planned = getEntity("bawaba-dedicated")!;
    expect(planned.status).toBe("PLANNED");
    expect(isEntityCurrentlyAvailable(planned)).toBe(false);
    expect(currentAvailabilityBlocker(planned)).toContain("PLANNED");
  });

  it("hypothetical entity is never currently available", () => {
    const h = hypotheticalEntity();
    expect(h.status).toBe("HYPOTHETICAL");
    expect(isEntityCurrentlyAvailable(h)).toBe(false);
  });

  it("does not hard-code ADGM as the planned entity's jurisdiction/legal form", () => {
    const planned = getEntity("bawaba-dedicated")!;
    expect(planned.jurisdiction).toBe("UNDECIDED"); // not "ADGM"
    expect(planned.legalForm).toBe("UNKNOWN");
    // The only permitted mention of ADGM is the explicit "do NOT hard-code" caveat.
    expect(planned.jurisdiction).not.toBe("ADGM");
    expect(planned.caveats.join(" ")).toContain("do NOT hard-code ADGM");
  });

  it("the active French entity must be considered before proposing a new EU entity", () => {
    // Oolala France SAS exists and is ACTIVE → an EU opportunity cannot be
    // auto-classified as REQUIRES_NEW_ENTITY on the mere absence of an entity.
    const frActive = activeEntitiesForJurisdiction((j) => j === "France");
    expect(frActive.map((e) => e.key)).toContain("oolala-france-sas");
    expect(frActive.every((e) => e.status === "ACTIVE")).toBe(true);
  });

  it("only ACTIVE entities are available now", () => {
    expect(activeEntities().map((e) => e.key).sort()).toEqual([
      "oolala-france-sas",
      "oolala-next-fz-llc",
    ]);
    for (const e of BAWABA_ENTITIES) {
      expect(isEntityCurrentlyAvailable(e)).toBe(e.status === "ACTIVE");
    }
  });
});
