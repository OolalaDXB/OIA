/**
 * Two-stage eligibility model (Milestone 0, spec §3).
 *
 * Application eligibility  = can BAWABA submit an application TODAY?
 * Award/onboarding elig.   = what must exist before acceptance/contracting/payment?
 * Strategic route          = a DERIVED convenience, must never hide the two inputs.
 *
 * Pure functions, no I/O. The derived route is informational; consumers must
 * still read `application` and `award` separately.
 */

export type ApplicationEligibility =
  | "ELIGIBLE_TO_APPLY_NOW"
  | "ELIGIBLE_TO_APPLY_VIA_EXISTING_ENTITY"
  | "ELIGIBLE_TO_APPLY_VIA_PARTNER"
  | "ELIGIBLE_TO_APPLY_VIA_CONSORTIUM"
  | "NOT_CURRENTLY_ELIGIBLE_TO_APPLY"
  | "UNKNOWN";

export type AwardEligibility =
  | "READY_FOR_AWARD"
  | "REQUIRES_EXISTING_ENTITY_VALIDATION"
  | "REQUIRES_NEW_ENTITY"
  | "REQUIRES_RELOCATION"
  | "REQUIRES_LOCAL_PARTNER"
  | "REQUIRES_CONSORTIUM"
  | "STRUCTURALLY_INELIGIBLE"
  | "UNKNOWN";

export type StrategicRoute =
  | "ELIGIBLE_NOW"
  | "ELIGIBLE_VIA_EXISTING_ENTITY"
  | "ELIGIBLE_VIA_PARTNER"
  | "ELIGIBLE_VIA_CONSORTIUM"
  | "ELIGIBLE_AFTER_NEW_ENTITY"
  | "ELIGIBLE_AFTER_RELOCATION"
  | "STRUCTURALLY_INELIGIBLE"
  | "UNKNOWN";

export const APPLICATION_ELIGIBILITY_VALUES: ApplicationEligibility[] = [
  "ELIGIBLE_TO_APPLY_NOW",
  "ELIGIBLE_TO_APPLY_VIA_EXISTING_ENTITY",
  "ELIGIBLE_TO_APPLY_VIA_PARTNER",
  "ELIGIBLE_TO_APPLY_VIA_CONSORTIUM",
  "NOT_CURRENTLY_ELIGIBLE_TO_APPLY",
  "UNKNOWN",
];

export const AWARD_ELIGIBILITY_VALUES: AwardEligibility[] = [
  "READY_FOR_AWARD",
  "REQUIRES_EXISTING_ENTITY_VALIDATION",
  "REQUIRES_NEW_ENTITY",
  "REQUIRES_RELOCATION",
  "REQUIRES_LOCAL_PARTNER",
  "REQUIRES_CONSORTIUM",
  "STRUCTURALLY_INELIGIBLE",
  "UNKNOWN",
];

export interface EligibilityAssessmentTwoStage {
  application: ApplicationEligibility;
  award: AwardEligibility;
  strategicRoute: StrategicRoute;
}

/**
 * Derive the strategic route from the two independent assessments.
 * Order of precedence:
 *   1. Structural ineligibility (award side) dominates — never awardable.
 *   2. Any UNKNOWN on either axis → UNKNOWN (we do not guess a route).
 *   3. Otherwise the award requirement determines the "after/via" qualifier,
 *      falling back to the application route when the award side is ready.
 */
export function deriveStrategicRoute(
  application: ApplicationEligibility,
  award: AwardEligibility,
): StrategicRoute {
  // 1. Award-side structural ineligibility is terminal.
  if (award === "STRUCTURALLY_INELIGIBLE") return "STRUCTURALLY_INELIGIBLE";

  // Cannot apply at all and nothing on the award side rescues it → UNKNOWN
  // (unless a concrete award requirement gives a forward route below).
  // 2. Unknown on either axis → UNKNOWN.
  if (application === "UNKNOWN" || award === "UNKNOWN") return "UNKNOWN";

  // 3. Award requirement drives the "after/via" route.
  switch (award) {
    case "REQUIRES_NEW_ENTITY":
      return "ELIGIBLE_AFTER_NEW_ENTITY";
    case "REQUIRES_RELOCATION":
      return "ELIGIBLE_AFTER_RELOCATION";
    case "REQUIRES_LOCAL_PARTNER":
      return "ELIGIBLE_VIA_PARTNER";
    case "REQUIRES_CONSORTIUM":
      return "ELIGIBLE_VIA_CONSORTIUM";
    case "REQUIRES_EXISTING_ENTITY_VALIDATION":
      return "ELIGIBLE_VIA_EXISTING_ENTITY";
    case "READY_FOR_AWARD": {
      // Award side is clear; the application route decides.
      switch (application) {
        case "ELIGIBLE_TO_APPLY_NOW":
          return "ELIGIBLE_NOW";
        case "ELIGIBLE_TO_APPLY_VIA_EXISTING_ENTITY":
          return "ELIGIBLE_VIA_EXISTING_ENTITY";
        case "ELIGIBLE_TO_APPLY_VIA_PARTNER":
          return "ELIGIBLE_VIA_PARTNER";
        case "ELIGIBLE_TO_APPLY_VIA_CONSORTIUM":
          return "ELIGIBLE_VIA_CONSORTIUM";
        case "NOT_CURRENTLY_ELIGIBLE_TO_APPLY":
          // Awardable but cannot apply today with any known route → UNKNOWN.
          return "UNKNOWN";
      }
    }
  }
  return "UNKNOWN";
}

export function assessTwoStage(
  application: ApplicationEligibility,
  award: AwardEligibility,
): EligibilityAssessmentTwoStage {
  return { application, award, strategicRoute: deriveStrategicRoute(application, award) };
}
