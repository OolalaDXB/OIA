import type { OpportunityKind } from "./opportunity-kinds";
import { KIND_PROFILES, normalizeKind } from "./opportunity-kinds";

/**
 * Which hard conditions apply to which kind of opportunity.
 *
 * The danger in making a gate configurable is obvious: it becomes a dial that
 * gets turned until something passes. So the split is explicit and tested.
 *
 * UNIVERSAL — true of every kind, never negotiable, because between them they
 * ARE the product rule:
 *
 *   accessiblePrimarySource   we have the source, not a rumour about it
 *   verifiedSource            a human confirmed it is what it claims to be
 *   eligibilityAssessed       someone decided whether we can actually apply
 *   hasExactNextAction        there is a specific thing to do, not "look into it"
 *   sufficientConfidence      the information is good enough to act on
 *
 * CONDITIONAL — only the deadline family, and only where a deadline exists to
 * be verified. A research tax credit has no closing date; requiring one made it
 * permanently unreachable, which is not rigour, it is a modelling error.
 *
 * Nothing here can make a blocked record pursuable. A kind either has a
 * condition or the condition is meaningless for it, and "not applicable" is
 * recorded on the report with its reason so a reader can see the difference
 * between a condition that passed and one that was never asked.
 */

export const GATE_CONDITIONS = [
  "accessiblePrimarySource",
  "verifiedSource",
  "verifiedDeadline",
  "notExpired",
  "eligibilityAssessed",
  "notAggregatorOnly",
  "notClosedCall",
  "hasExactNextAction",
  "sufficientConfidence",
] as const;
export type GateCondition = (typeof GATE_CONDITIONS)[number];

/** Required for every kind. Changing this list changes the product. */
export const UNIVERSAL_CONDITIONS: readonly GateCondition[] = [
  "accessiblePrimarySource",
  "verifiedSource",
  "eligibilityAssessed",
  "notAggregatorOnly",
  "hasExactNextAction",
  "sufficientConfidence",
];

/** Conditions that only make sense when an issuer closes a window. */
export const DEADLINE_CONDITIONS: readonly GateCondition[] = ["verifiedDeadline", "notExpired", "notClosedCall"];

export interface ConditionApplicability {
  condition: GateCondition;
  applies: boolean;
  /** Why it does not apply. Empty when it does. */
  reason: string;
}

export function conditionsFor(kind: OpportunityKind): ConditionApplicability[] {
  const profile = KIND_PROFILES[kind];
  return GATE_CONDITIONS.map((condition) => {
    if (UNIVERSAL_CONDITIONS.includes(condition)) {
      return { condition, applies: true, reason: "" };
    }
    if (DEADLINE_CONDITIONS.includes(condition)) {
      return profile.hasIssuerDeadline
        ? { condition, applies: true, reason: "" }
        : {
            condition,
            applies: false,
            reason: `${profile.label.toLowerCase()} has no issuer deadline — there is no closing date to verify`,
          };
    }
    return { condition, applies: true, reason: "" };
  });
}

export function appliesTo(kind: string | undefined, condition: GateCondition): boolean {
  return conditionsFor(normalizeKind(kind)).find((c) => c.condition === condition)?.applies ?? true;
}

/**
 * What a kind needs INSTEAD of a deadline, stated as the question a human must
 * answer. These are not automated conditions: they are what the reviewer is
 * asked for, so the console can demand something concrete rather than shrugging.
 */
export const KIND_SPECIFIC_QUESTION: Partial<Record<OpportunityKind, string>> = {
  MARKETPLACE_PROJECT:
    "Is this worth a proposal today? Nobody closes a window — it goes to whoever is credible first, so the question is speed and fit, not a date.",
  ACQUISITION:
    "What is being bought, at what price, and out of which entity? This one spends money rather than raising it — it never belongs in a funding total.",
  TAX_INCENTIVE:
    "Which accounting year, and which spending qualifies? A tax relief is claimed on a filing, not submitted to a call.",
  EQUITY:
    "Does the investor's thesis and stage actually match, and who makes the introduction? There is no deadline to miss and no queue to join.",
  DEBT_GUARANTEE: "What is the repayment or guarantee structure, and which entity carries it?",
  PRE_SOLICITATION:
    "What response does the buyer want, by when, and what would we say that shapes the specification in our favour?",
  REGULATORY: "Nothing to apply to — what changes for us if this rule lands?",
};

/** Whether this kind can ever be recommended for pursuit. */
export function isActionable(kind: string | undefined): boolean {
  return KIND_PROFILES[normalizeKind(kind)].actionable;
}
