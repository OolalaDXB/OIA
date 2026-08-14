# Knowledge Layer — canonical source of truth (TheStudio MT / Oolala)

Docs-as-code knowledge, evidence and capability layer for BAWABA and,
progressively, all TheStudio MT / Oolala Starter capabilities. **Git is the
canonical machine-readable truth; decks, PDFs, applications and one-pagers
are OUTPUTS** — they never become their own diverging truth.

```
Canonical facts + Capabilities + Evidence + Entities + Disclosure policies
    → Canonical documents → Generated outputs → OIA / agents / tenders / grants / VC
```

Hierarchy (final principle): **Truth → Capability → Evidence → Match →
Composition → Draft → Human approval.** Never: prompt → plausible story →
assumed truth.

## Layout

- `products/<slug>/` — canonical dossier per product: `product.yaml` (index),
  `facts.yaml` (machine facts with provenance/lifecycle/disclosure), Level-1
  markdown docs. BAWABA is complete; SILLON/BEAU/myOolala/Maisons.co are
  Phase B.
- `capabilities/capabilities.yaml` — the Capability/Brick Registry, transverse
  to all products. Status (EXPERIMENTAL→SUBMISSION_READY) and evidence
  maturity (DECLARED→INDEPENDENTLY_VERIFIED) are explicit: "we have this
  capability in several solutions" ≠ "independently deployable package".
- `entities/entities.yaml` — legal entities & delivery routes. product ≠
  entity; location follows money; PLANNED entities carry NO jurisdiction.
- `evidence/evidence.yaml` — proof inventory (repository, tests, runs,
  customer references) with maturity and disclosure.
- `policies/disclosure.yaml` — machine-readable disclosure rules (forbidden
  external names, internal-only patterns, forbidden claims).
- `people/` — Phase B. `source-documents/` — registry of external documents
  (Drive = attachments/evidence, never business truth). `generated/` —
  rendered outputs, each stamped with the commit it was generated from.

## Code

`packages/knowledge` (`@oia/knowledge`): Zod schemas, loader, deterministic
read API (`getProduct`, `getCapabilities`, `getEvidence`,
`getEligibleEntities`, `getExternalSafeFacts`, `getTenderCapabilities`,
`checkClaim`, `checkDisclosure`, `composeSolution`) and referential
validation. Functions before agents (§26): agents come later (Phase C), on
top of functions that are already reliable when a human calls them.

- Validate: `pnpm --filter @oia/knowledge validate`
- Test: `pnpm --filter @oia/knowledge test`
- Ask "what can we really propose?" (§37):
  `pnpm --filter @oia/workers exec tsx src/qualify-with-knowledge.ts "ai governance" "audit trail" ...`

## Editing rules

1. One canonical source per fact. Change the YAML, not a deck.
2. `main` = latest approved version; changes go through commits/PRs.
3. Lifecycle: DRAFT → REVIEWED → CANONICAL → SUPERSEDED. An INFERRED fact is
   never auto-promoted CANONICAL; CANONICAL requires `approvedBy`.
4. Disclosure is machine-readable (`EXTERNAL_OK` / `INTERNAL_ONLY` /
   `FORBIDDEN_EXTERNAL`), never the writer's memory.
5. A planned capability is never presented as demonstrated.
