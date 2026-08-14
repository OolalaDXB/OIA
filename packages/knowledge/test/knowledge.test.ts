import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  checkClaim,
  checkDisclosure,
  composeSolution,
  getCapabilities,
  getCapability,
  getEligibleEntities,
  getExternalSafeFacts,
  loadKnowledge,
  validateKnowledge,
} from "../src/index";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../knowledge");
const kb = loadKnowledge(root);

describe("[§32] canonical knowledge", () => {
  it("loads and validates with zero errors", () => {
    const errors = validateKnowledge(kb).filter((i) => i.level === "ERROR");
    expect(errors).toEqual([]);
  });

  it("every fact carries provenance (source type + confidence + dates)", () => {
    for (const f of kb.facts) {
      expect(f.provenance.sourceType).toBeTruthy();
      expect(f.provenance.confidence).toBeGreaterThan(0);
      expect(f.provenance.createdAt).toBeTruthy();
    }
  });

  it("a SUPERSEDED or non-canonical fact is never served as external-safe", () => {
    const safe = getExternalSafeFacts(kb);
    for (const f of safe) {
      expect(f.lifecycle).toBe("CANONICAL");
      expect(f.disclosure).toBe("EXTERNAL_OK");
    }
  });

  it("an internal-only fact does not appear in external-safe output", () => {
    const safe = getExternalSafeFacts(kb, "bawaba");
    expect(safe.find((f) => f.id === "fact-km-shareholding")).toBeUndefined();
    expect(safe.find((f) => f.id === "fact-bawaba-team-reality")).toBeUndefined();
  });
});

describe("[§32] capabilities", () => {
  it("a capability can be used by several products", () => {
    const rls = getCapability(kb, "tenant-isolation-rls-guard")!;
    expect(rls.usedBy.length).toBeGreaterThan(1);
  });

  it("a capability can exist independently of any product", () => {
    const payments = getCapability(kb, "payments-integration")!;
    expect(payments.usedBy).toEqual([]);
  });

  it("several capabilities can compose a tender answer", () => {
    const s = composeSolution(kb, ["ai governance", "identity", "audit trail", "payment"], ["EU"]);
    const ids = new Set(s.capabilities.map((c) => c.capability.id));
    expect(ids.size).toBeGreaterThanOrEqual(3);
  });

  it("BAWABA capabilities resolve from the product dossier", () => {
    expect(getCapabilities(kb, "bawaba").map((c) => c.id)).toContain("decision-api");
  });
});

describe("[§32] KM Openpay", () => {
  it("KM is modelled as REAL mobilisable capacity, 70+, distinct from a dedicated team", () => {
    const km = kb.entities.find((e) => e.id === "km-openpay")!;
    expect(km.deliveryCapacity?.type).toBe("MOBILISABLE");
    expect(km.deliveryCapacity?.headcount).toBe("70+");
  });

  it("70+ is externally usable (canonical + external-safe fact)", () => {
    const f = getExternalSafeFacts(kb, "bawaba").find((x) => x.id === "fact-km-delivery-capacity");
    expect(f?.statement).toContain("70+");
  });

  it("the shareholding never reaches an external output", () => {
    const draft = "Our delivery partner KM Openpay (70+ people). Mickael holds a 30% participation in KM Projets.";
    const violations = checkDisclosure(kb, draft);
    expect(violations.some((v) => v.kind === "INTERNAL_ONLY_PATTERN")).toBe(true);
  });
});

describe("[§32] jurisdiction & forbidden claims", () => {
  it("no canonical fact supports 'BAWABA is an ADGM company' — claim is FORBIDDEN", () => {
    expect(checkClaim(kb, "BAWABA is an ADGM company").status).toBe("FORBIDDEN");
  });

  it("an external draft claiming incorporation is blocked", () => {
    const violations = checkDisclosure(kb, "BAWABA is an ADGM company delivering AI governance.");
    expect(violations.some((v) => v.kind === "FORBIDDEN_CLAIM")).toBe(true);
  });

  it("the PLANNED BAWABA entity carries no jurisdiction", () => {
    const e = kb.entities.find((x) => x.id === "bawaba-entity")!;
    expect(e.status).toBe("PLANNED");
    expect(e.jurisdiction).toBeUndefined();
  });

  it("the approved positioning IS supported by canonical facts", () => {
    const check = checkClaim(kb, "BAWABA is a control and evidence plane for AI gateways and enterprise AI agents");
    expect(check.status).toBe("SUPPORTED");
    expect(check.supportingFacts.map((f) => f.id)).toContain("fact-bawaba-positioning");
  });
});

describe("[§32] Dixio", () => {
  it("the name is blocked in any external output, no override path", () => {
    const violations = checkDisclosure(kb, "Our previous venture Dixio demonstrated this expertise.");
    expect(violations.some((v) => v.kind === "FORBIDDEN_NAME" && v.match === "Dixio")).toBe(true);
  });
});

describe("[§37] success criterion — compose from what really exists", () => {
  it("AI governance + identity + audit + payment + EU delivery → real assembly with gaps", () => {
    const s = composeSolution(
      kb,
      ["AI governance", "identity", "audit trail", "payment integration", "EU delivery capability"],
      ["EU", "FR"],
    );
    // Real capabilities matched, each carrying status/maturity:
    const ids = s.capabilities.map((c) => c.capability.id);
    expect(ids).toContain("decision-api");
    expect(ids).toContain("identity-and-permissions");
    expect(ids).toContain("payments-integration");
    // EU route resolves to the real French entity:
    expect(s.entityRoutes.map((e) => e.id)).toContain("oolala-france");
    // KM mobilisable capacity surfaces:
    expect(s.deliveryCapacity.map((e) => e.id)).toContain("km-openpay");
    // "EU delivery capability" is not an in-house brick: it is honestly
    // covered via the KM partnership (footprint MA/AE/FR → EU via France),
    // stated as a partnership — no longer a blind gap, never an in-house claim.
    expect(s.partnerCoverage.some((pc) => pc.criterion === "EU delivery capability" && pc.entity.id === "km-openpay")).toBe(true);
    expect(s.gaps.some((g) => g.includes("EU delivery capability"))).toBe(false);
  });
});
