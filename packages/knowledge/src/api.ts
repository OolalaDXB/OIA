import type {
  Capability,
  Entity,
  EvidenceItem,
  Fact,
  Product,
} from "./schemas";
import type { KnowledgeBase } from "./load";

/**
 * Deterministic read API over the canonical knowledge (§22, §26): functions
 * before agents — if a function is not reliable when a human calls it, an
 * agent will not make it reliable. No LLM here; LLMs are never the authority
 * of truth (§25).
 */

export function getProduct(kb: KnowledgeBase, slug: string): Product | undefined {
  return kb.products.find((p) => p.slug === slug);
}

export function getCapability(kb: KnowledgeBase, id: string): Capability | undefined {
  return kb.capabilities.find((c) => c.id === id);
}

export function getCapabilities(kb: KnowledgeBase, productSlug: string): Capability[] {
  return kb.capabilities.filter((c) => c.usedBy.includes(productSlug));
}

export function getEvidence(kb: KnowledgeBase, id: string): EvidenceItem | undefined {
  return kb.evidence.find((e) => e.id === id);
}

export function getEvidenceForCapability(kb: KnowledgeBase, capabilityId: string): EvidenceItem[] {
  const cap = getCapability(kb, capabilityId);
  if (!cap) return [];
  return cap.evidenceIds
    .map((id) => getEvidence(kb, id))
    .filter((e): e is EvidenceItem => !!e);
}

/** Entities whose eligible geographies intersect the requested ones (ACTIVE only). */
export function getEligibleEntities(kb: KnowledgeBase, geographies: string[]): Entity[] {
  const wanted = geographies.map((g) => g.toUpperCase());
  return kb.entities.filter(
    (e) => e.status === "ACTIVE" && e.eligibleGeographies.some((g) => wanted.includes(g.toUpperCase())),
  );
}

/**
 * External-safe facts only: CANONICAL lifecycle + EXTERNAL_OK disclosure.
 * SUPERSEDED, DRAFT and internal-only facts never come out of here (§19, §32).
 */
export function getExternalSafeFacts(kb: KnowledgeBase, subject?: string): Fact[] {
  return kb.facts.filter(
    (f) =>
      f.lifecycle === "CANONICAL" &&
      f.disclosure === "EXTERNAL_OK" &&
      (!subject || f.subject === subject),
  );
}

/** Capability matching for a tender criterion list (keyword/synonym overlap). */
export function getTenderCapabilities(kb: KnowledgeBase, criteria: string[]): Map<string, Capability[]> {
  const out = new Map<string, Capability[]>();
  for (const criterion of criteria) {
    const c = criterion.toLowerCase();
    const matches = kb.capabilities.filter((cap) =>
      [cap.name, cap.category, ...cap.keywords, ...cap.synonyms, ...cap.technicalCapabilities, ...cap.businessCapabilities]
        .some((k) => c.includes(k.toLowerCase()) || k.toLowerCase().includes(c)),
    );
    out.set(criterion, matches);
  }
  return out;
}

// ── Disclosure gate (§9-10, §26) ────────────────────────────────────────────
export interface DisclosureViolation {
  kind: "FORBIDDEN_NAME" | "INTERNAL_ONLY_PATTERN" | "FORBIDDEN_CLAIM";
  match: string;
  detail: string;
}

/** Check a draft EXTERNAL output. Any violation = the document must not ship. */
export function checkDisclosure(kb: KnowledgeBase, externalText: string): DisclosureViolation[] {
  const violations: DisclosureViolation[] = [];
  for (const name of kb.policy.forbiddenExternalNames) {
    if (externalText.toLowerCase().includes(name.toLowerCase())) {
      violations.push({
        kind: "FORBIDDEN_NAME",
        match: name,
        detail: `"${name}" is forbidden in external outputs (no override path).`,
      });
    }
  }
  for (const pattern of kb.policy.internalOnlyPatterns) {
    const re = new RegExp(pattern, "i");
    const m = externalText.match(re);
    if (m) {
      violations.push({
        kind: "INTERNAL_ONLY_PATTERN",
        match: m[0],
        detail: `Matches internal-only pattern /${pattern}/ — requires explicit human override.`,
      });
    }
  }
  for (const claim of kb.policy.forbiddenClaims) {
    const re = new RegExp(claim, "i");
    const m = externalText.match(re);
    if (m) {
      violations.push({
        kind: "FORBIDDEN_CLAIM",
        match: m[0],
        detail: `No canonical fact establishes this claim (CONFLICTING_CLAIM).`,
      });
    }
  }
  return violations;
}

// ── Claim check (§20, §26) ──────────────────────────────────────────────────
export interface ClaimCheck {
  status: "SUPPORTED" | "UNSUPPORTED" | "FORBIDDEN";
  supportingFacts: Fact[];
  detail: string;
}

/**
 * Word-overlap support check against CANONICAL facts. Deliberately
 * conservative: an unsupported claim is flagged, never silently accepted.
 */
export function checkClaim(kb: KnowledgeBase, claim: string): ClaimCheck {
  const forbidden = kb.policy.forbiddenClaims.find((c) => new RegExp(c, "i").test(claim));
  if (forbidden) {
    return { status: "FORBIDDEN", supportingFacts: [], detail: `Matches forbidden claim /${forbidden}/.` };
  }
  const words = claim.toLowerCase().split(/[^a-z0-9+]+/).filter((w) => w.length > 3);
  const canonical = kb.facts.filter((f) => f.lifecycle === "CANONICAL");
  const supporting = canonical.filter((f) => {
    const s = f.statement.toLowerCase();
    const hits = words.filter((w) => s.includes(w)).length;
    return words.length > 0 && hits / words.length >= 0.5;
  });
  return supporting.length > 0
    ? { status: "SUPPORTED", supportingFacts: supporting, detail: `${supporting.length} canonical fact(s) overlap.` }
    : { status: "UNSUPPORTED", supportingFacts: [], detail: "No canonical fact supports this claim — do not use it." };
}

// ── Solution composition (§13, §37) ─────────────────────────────────────────
export interface ComposedSolution {
  criteria: string[];
  products: Product[];
  capabilities: { criterion: string; capability: Capability; evidence: EvidenceItem[] }[];
  entityRoutes: Entity[];
  deliveryCapacity: Entity[];
  /** Criteria covered not by a registry brick but by a partner entity's
      mobilisable delivery footprint (stated as partnership, never in-house). */
  partnerCoverage: { criterion: string; entity: Entity; note: string }[];
  externalSafeFacts: Fact[];
  gaps: string[];
}

/**
 * §37 success criterion: given tender criteria + target geographies, answer
 * "what can we REALLY propose" from canonical data — sources, evidence,
 * maturity, limits, external-safe info, gaps. Assembles what exists; never
 * generates a plausible story.
 */
export function composeSolution(
  kb: KnowledgeBase,
  criteria: string[],
  geographies: string[],
): ComposedSolution {
  const matched = getTenderCapabilities(kb, criteria);
  const capabilities: ComposedSolution["capabilities"] = [];
  const partnerCoverage: ComposedSolution["partnerCoverage"] = [];
  const gaps: string[] = [];
  const productSlugs = new Set<string>();

  const wanted = geographies.map((g) => g.toUpperCase());
  const mobilisable = kb.entities.filter((e) => e.deliveryCapacity?.type === "MOBILISABLE");

  for (const [criterion, caps] of matched) {
    if (caps.length === 0) {
      // A delivery-capability criterion can be honestly covered by a partner
      // entity whose footprint spans the requested geographies — stated as a
      // partnership route, never as an in-house brick.
      const isDelivery = /deliver|delivery|livraison|execution capacity/i.test(criterion);
      const covering = isDelivery
        ? mobilisable.filter((e) => e.eligibleGeographies.some((g) => wanted.includes(g.toUpperCase())))
        : [];
      if (covering.length > 0) {
        for (const entity of covering) {
          partnerCoverage.push({
            criterion,
            entity,
            note: `Covered via partnership: ${entity.name} — ${entity.deliveryCapacity!.description} Footprint: ${entity.eligibleGeographies.join(", ")}.`,
          });
        }
        continue;
      }
      gaps.push(`No registry capability matches "${criterion}" — do not claim it.`);
      continue;
    }
    for (const cap of caps) {
      capabilities.push({ criterion, capability: cap, evidence: getEvidenceForCapability(kb, cap.id) });
      for (const p of cap.usedBy) productSlugs.add(p);
    }
  }

  const products = [...productSlugs]
    .map((slug) => getProduct(kb, slug))
    .filter((p): p is Product => !!p);

  const entityRoutes = getEligibleEntities(kb, geographies);
  const deliveryCapacity = kb.entities.filter((e) => e.deliveryCapacity?.type === "MOBILISABLE");

  for (const cap of capabilities) {
    if (cap.evidence.length === 0 && cap.capability.maturity === "DECLARED") {
      gaps.push(
        `"${cap.capability.name}" is DECLARED with no evidence — a submission needs at least an implemented demo.`,
      );
    }
  }

  return {
    criteria,
    products,
    capabilities,
    entityRoutes,
    deliveryCapacity,
    partnerCoverage,
    externalSafeFacts: getExternalSafeFacts(kb),
    gaps: [...new Set(gaps)],
  };
}
