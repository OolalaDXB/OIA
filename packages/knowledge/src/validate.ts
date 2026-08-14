import type { KnowledgeBase } from "./load";

/**
 * Referential validation of the canonical tree (§32, item 10 of Phase A).
 * Schema validation already happened at load (Zod). This checks the graph:
 * broken references and honesty rules become errors, not surprises in a deck.
 */
export interface ValidationIssue {
  level: "ERROR" | "WARNING";
  where: string;
  message: string;
}

export function validateKnowledge(kb: KnowledgeBase): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const err = (where: string, message: string) => issues.push({ level: "ERROR", where, message });
  const warn = (where: string, message: string) => issues.push({ level: "WARNING", where, message });

  const factIds = new Set(kb.facts.map((f) => f.id));
  const capIds = new Set(kb.capabilities.map((c) => c.id));
  const entityIds = new Set(kb.entities.map((e) => e.id));
  const evidenceIds = new Set(kb.evidence.map((e) => e.id));
  const productSlugs = new Set(kb.products.map((p) => p.slug));
  // Products referenced before their dossier exists (Phase B) — known, allowed with warning.
  const knownFutureProducts = new Set(["sillon", "beau", "myoolala", "maisons-co", "oia"]);

  for (const p of kb.products) {
    for (const c of p.capabilities) if (!capIds.has(c)) err(`product:${p.slug}`, `unknown capability "${c}"`);
    for (const e of p.entityRoutes) if (!entityIds.has(e)) err(`product:${p.slug}`, `unknown entity "${e}"`);
    for (const f of p.factIds) if (!factIds.has(f)) err(`product:${p.slug}`, `unknown fact "${f}"`);
  }

  for (const c of kb.capabilities) {
    for (const e of c.evidenceIds) if (!evidenceIds.has(e)) err(`capability:${c.id}`, `unknown evidence "${e}"`);
    for (const f of c.internalOnlyFactIds) if (!factIds.has(f)) err(`capability:${c.id}`, `unknown fact "${f}"`);
    for (const p of c.usedBy) {
      if (!productSlugs.has(p) && !knownFutureProducts.has(p)) {
        err(`capability:${c.id}`, `usedBy unknown product "${p}"`);
      } else if (!productSlugs.has(p)) {
        warn(`capability:${c.id}`, `usedBy "${p}" has no canonical dossier yet (Phase B)`);
      }
    }
    // Honesty: DECLARED maturity must carry a limitation saying it is not demonstrated.
    if (c.maturity === "DECLARED" && c.limitations.length === 0) {
      err(`capability:${c.id}`, `DECLARED maturity requires an explicit limitation (never present as demonstrated)`);
    }
    if (["PROVEN", "PRODUCTIZED", "SUBMISSION_READY"].includes(c.status) && c.evidenceIds.length === 0) {
      err(`capability:${c.id}`, `status ${c.status} requires evidence`);
    }
  }

  for (const e of kb.entities) {
    for (const f of e.internalOnlyFactIds) {
      if (!factIds.has(f)) err(`entity:${e.id}`, `unknown fact "${f}"`);
      else if (kb.facts.find((x) => x.id === f)!.disclosure === "EXTERNAL_OK") {
        err(`entity:${e.id}`, `fact "${f}" is listed internal-only but marked EXTERNAL_OK`);
      }
    }
    if (e.status === "PLANNED" && e.jurisdiction) {
      err(`entity:${e.id}`, `PLANNED entity must not carry a jurisdiction (location follows money)`);
    }
  }

  for (const f of kb.facts) {
    if (f.lifecycle === "SUPERSEDED" && !f.supersededBy) {
      err(`fact:${f.id}`, `SUPERSEDED fact must reference its successor (supersededBy)`);
    }
    if (f.lifecycle === "CANONICAL" && f.provenance.sourceType === "INFERRED") {
      err(`fact:${f.id}`, `an INFERRED fact can never be CANONICAL (§18)`);
    }
    if (f.lifecycle === "CANONICAL" && !f.provenance.approvedBy) {
      err(`fact:${f.id}`, `CANONICAL requires approvedBy (human approval)`);
    }
  }

  // Forbidden names must not leak into external-safe wording anywhere.
  const externalSurfaces: [string, string][] = [
    ...kb.products.map((p): [string, string] => [`product:${p.slug}.oneLine`, p.oneLine]),
    ...kb.capabilities.map((c): [string, string] => [`capability:${c.id}.description`, c.description]),
    ...kb.capabilities.flatMap((c) =>
      c.externalSafeClaims.map((s, i): [string, string] => [`capability:${c.id}.externalSafeClaims[${i}]`, s]),
    ),
    ...kb.facts.filter((f) => f.disclosure === "EXTERNAL_OK").map((f): [string, string] => [`fact:${f.id}`, f.statement]),
  ];
  for (const [where, text] of externalSurfaces) {
    for (const name of kb.policy.forbiddenExternalNames) {
      if (text.toLowerCase().includes(name.toLowerCase())) {
        err(where, `forbidden external name "${name}" appears in external-safe content`);
      }
    }
  }

  return issues;
}
