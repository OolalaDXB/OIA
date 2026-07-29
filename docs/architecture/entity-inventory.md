# Corrected confirmed BAWABA entity inventory

Source of truth for entity facts used by the qualification engine (spec §2).
Implemented in `packages/intelligence/src/entities.ts` and enforced by tests
(`entities.test.ts`). The engine **must never** treat PLANNED or HYPOTHETICAL
entities as active.

| Entity | Status | Jurisdiction | Legal form | Relationship to BAWABA |
|---|---|---|---|---|
| **Oolala Next FZ-LLC** | `ACTIVE` | UAE | FZ-LLC | Possible applicant or operating vehicle — subject to programme-specific eligibility and IP review. Does **not** automatically qualify for every UAE programme. |
| **Oolala France SAS** | `ACTIVE` | France | SAS | Possible EU/French applicant vehicle — subject to programme-specific eligibility, activity, ownership, IP and SME requirements. Do **not** auto-classify EU opportunities as requiring a new EU entity. |
| **Dedicated BAWABA entity** | `PLANNED` | UNDECIDED | UNKNOWN | Future BAWABA operating and IP-holding entity. Do **not** hard-code ADGM. **Not currently available.** |
| **Other entities** | `HYPOTHETICAL` | programme-dependent | UNKNOWN | Never currently available. |

## Rules enforced in code

- `isEntityCurrentlyAvailable(e)` is true **only** for `ACTIVE`.
- `activeEntities()` returns exactly Oolala Next FZ-LLC and Oolala France SAS.
- `currentAvailabilityBlocker(e)` returns a reason string for any non-active entity.
- Because **Oolala France SAS already exists**, an EU/FR opportunity may **not**
  be auto-routed to `ELIGIBLE_AFTER_NEW_ENTITY` on the mere absence of an entity;
  the existing FR entity must be considered first, and the answer is `UNKNOWN`
  where evidence is insufficient (see EIC Accelerator, spec §10).

## What this inventory does NOT assert

- It does not claim any entity qualifies for any specific programme.
- It does not decide the dedicated entity's jurisdiction (explicitly `UNDECIDED`).
- It does not treat the planned entity as a usable applicant today.
