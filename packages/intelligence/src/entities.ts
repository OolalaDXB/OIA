/**
 * Corrected confirmed BAWABA entity inventory (Milestone 0, spec §2).
 *
 * The qualification engine must NEVER treat PLANNED or HYPOTHETICAL entities as
 * active. Only ACTIVE entities can support *current* application eligibility via
 * an existing entity. Nothing here hard-codes ADGM or assumes automatic
 * qualification for any programme.
 */

export type EntityStatus = "ACTIVE" | "PLANNED" | "HYPOTHETICAL";

export interface ConfirmedEntity {
  key: string;
  name: string;
  status: EntityStatus;
  /** May be "UNDECIDED" / "programme-dependent" for non-active entities. */
  jurisdiction: string;
  /** May be "UNKNOWN" for non-active entities. */
  legalForm: string;
  role: string;
  /** Caveats that must travel with the entity — never dropped. */
  caveats: string[];
}

export const BAWABA_ENTITIES: readonly ConfirmedEntity[] = [
  {
    key: "oolala-next-fz-llc",
    name: "Oolala Next FZ-LLC",
    status: "ACTIVE",
    jurisdiction: "UAE",
    legalForm: "FZ-LLC",
    role: "possible applicant or operating vehicle",
    caveats: [
      "subject to programme-specific eligibility and IP review",
      "does NOT automatically qualify for every UAE programme",
    ],
  },
  {
    key: "oolala-france-sas",
    name: "Oolala France SAS",
    status: "ACTIVE",
    jurisdiction: "France",
    legalForm: "SAS",
    role: "possible EU/French applicant vehicle",
    caveats: [
      "subject to programme-specific eligibility, activity, ownership, IP and SME requirements",
      "do NOT automatically classify EU opportunities as requiring a new EU entity",
    ],
  },
  {
    key: "bawaba-dedicated",
    name: "Dedicated BAWABA entity",
    status: "PLANNED",
    jurisdiction: "UNDECIDED",
    legalForm: "UNKNOWN",
    role: "future BAWABA operating and IP-holding entity",
    caveats: [
      "do NOT hard-code ADGM",
      "not currently available — cannot support current eligibility",
    ],
  },
] as const;

/** A programme-dependent hypothetical entity (never currently available). */
export function hypotheticalEntity(jurisdiction = "programme-dependent"): ConfirmedEntity {
  return {
    key: "hypothetical",
    name: "Other (hypothetical) entity",
    status: "HYPOTHETICAL",
    jurisdiction,
    legalForm: "UNKNOWN",
    role: "programme-dependent hypothetical vehicle",
    caveats: ["hypothetical — never currently available"],
  };
}

/** True only for ACTIVE entities. PLANNED/HYPOTHETICAL are never available now. */
export function isEntityCurrentlyAvailable(entity: Pick<ConfirmedEntity, "status">): boolean {
  return entity.status === "ACTIVE";
}

/** The entities that may support current application eligibility. */
export function activeEntities(): ConfirmedEntity[] {
  return BAWABA_ENTITIES.filter((e) => e.status === "ACTIVE");
}

export function getEntity(key: string): ConfirmedEntity | undefined {
  return BAWABA_ENTITIES.find((e) => e.key === key);
}

/** Active entities that could plausibly apply in a given jurisdiction/region. */
export function activeEntitiesForJurisdiction(pred: (juris: string) => boolean): ConfirmedEntity[] {
  return activeEntities().filter((e) => pred(e.jurisdiction));
}

/**
 * Guard used by the qualification engine: attempting to use a non-active entity
 * for CURRENT eligibility is a hard error in reasoning. Returns the reason a
 * non-active entity cannot be used now, or null when the entity is available.
 */
export function currentAvailabilityBlocker(entity: ConfirmedEntity): string | null {
  if (entity.status === "ACTIVE") return null;
  return `${entity.name} is ${entity.status}; it cannot support current eligibility`;
}
