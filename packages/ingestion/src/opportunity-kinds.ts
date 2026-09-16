/**
 * What kind of thing is this, really?
 *
 * The model used to know four kinds and, underneath them, made one assumption:
 * that every opportunity is "an official call with a deadline". The gate
 * therefore demanded a verified deadline for everything.
 *
 * That assumption quietly made two whole categories unreachable. A research tax
 * credit has no deadline — it is a status, not a call. An equity round has no
 * issuer closing a window. Neither could ever reach PURSUE, whatever the
 * evidence, and no amount of tuning would have fixed it because it was not a
 * setting: it was the shape of the model.
 *
 * So the kind now decides which hard conditions apply. What does NOT vary is
 * the product rule itself — see `UNIVERSAL_CONDITIONS` in gate.ts.
 */

export const OPPORTUNITY_KINDS = [
  /** Competitive award with a submission deadline (RFP, ITT, RFQ). */
  "TENDER",
  /**
   * Upstream of a tender: RFI, sources sought, prior information notice.
   * The highest-value category for a studio — the specification is not written
   * yet, so there is still something to influence.
   */
  "PRE_SOLICITATION",
  /** Subsidy or call for projects: non-dilutive, with a closing date. */
  "GRANT",
  /**
   * A fiscal status, not a call: research tax credit, innovation tax credit,
   * young innovative company. No issuer, no deadline, an accounting year.
   */
  "TAX_INCENTIVE",
  /** Dilutive funding: VC, business angel, accelerator, equity programme. */
  "EQUITY",
  /** Loan, guarantee, repayable advance. */
  "DEBT_GUARANTEE",
  /** Prize or competition. */
  "PRIZE",
  /** A call for partners rather than for money. */
  "CONSORTIUM_CALL",
  /**
   * A client posting work on a marketplace — Upwork, Malt, Comet. No issuer
   * deadline: it closes when someone is hired, which is a race rather than a
   * date.
   */
  "MARKETPLACE_PROJECT",
  /**
   * An asset for sale: a company, a product, a module (Acquire, Flippa).
   *
   * The odd one out, and the reason `direction` exists. Every other kind brings
   * money or a contract IN. This one is capital going OUT. Summing it with the
   * rest in a pipeline total would produce a number that means nothing.
   */
  "ACQUISITION",
  /** Watch only: a rule change that matters, with nothing to apply to. */
  "REGULATORY",
] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

/**
 * Records produced before this taxonomy existed carry the old four values.
 * They are mapped rather than migrated: rewriting a stored run's output to fit
 * a newer model would falsify the record of what the pipeline actually said.
 */
const LEGACY: Record<string, OpportunityKind> = {
  TENDER_RFP: "TENDER",
  VC_INVESTOR: "EQUITY",
  GRANT: "GRANT",
  REGULATORY: "REGULATORY",
};

export function normalizeKind(value: string | undefined): OpportunityKind {
  if (!value) return "GRANT"; // the historical default for unlabelled records
  if ((OPPORTUNITY_KINDS as readonly string[]).includes(value)) return value as OpportunityKind;
  return LEGACY[value] ?? "GRANT";
}

export interface KindProfile {
  label: string;
  /** Plain language, for the console — the operator is not a procurement lawyer. */
  description: string;
  /** Does the ISSUER close a window? Decides whether a deadline can be required. */
  hasIssuerDeadline: boolean;
  /** Does money come back as equity, debt, or not at all? */
  fundingShape: "NON_DILUTIVE" | "DILUTIVE" | "REPAYABLE" | "CONTRACT" | "NONE" | "PURCHASE";
  /**
   * Which way value moves. INBOUND is money or a contract won; OUTBOUND is
   * money deployed to acquire something. Totals must never mix the two.
   */
  direction: "INBOUND" | "OUTBOUND" | "NEUTRAL";
  /** Can this become a PURSUE at all, or is it watch-only? */
  actionable: boolean;
}

export const KIND_PROFILES: Record<OpportunityKind, KindProfile> = {
  TENDER: {
    label: "Tender",
    description: "A public contract to bid for, with a submission deadline.",
    hasIssuerDeadline: true,
    fundingShape: "CONTRACT",
    direction: "INBOUND",
    actionable: true,
  },
  PRE_SOLICITATION: {
    label: "Early signal",
    description:
      "A buyer describing a need before the tender exists — an RFI, a sources-sought notice, a prior information notice. Nothing to bid on yet, and the last moment when the specification can still be shaped.",
    hasIssuerDeadline: false,
    fundingShape: "CONTRACT",
    direction: "INBOUND",
    actionable: true,
  },
  GRANT: {
    label: "Grant",
    description: "Money that does not have to be paid back, awarded on a call with a closing date.",
    hasIssuerDeadline: true,
    fundingShape: "NON_DILUTIVE",
    direction: "INBOUND",
    actionable: true,
  },
  TAX_INCENTIVE: {
    label: "Tax relief",
    description:
      "A fiscal status rather than a call: research and innovation tax credits, young innovative company. No deadline — what matters is the accounting year and whether the spending qualifies.",
    hasIssuerDeadline: false,
    fundingShape: "NON_DILUTIVE",
    direction: "INBOUND",
    actionable: true,
  },
  EQUITY: {
    label: "Equity",
    description: "Investment against shares: funds, business angels, accelerators. No issuer deadline.",
    hasIssuerDeadline: false,
    fundingShape: "DILUTIVE",
    direction: "INBOUND",
    actionable: true,
  },
  DEBT_GUARANTEE: {
    label: "Loan or guarantee",
    description: "Repayable money, or a guarantee that unlocks it elsewhere.",
    hasIssuerDeadline: false,
    fundingShape: "REPAYABLE",
    direction: "INBOUND",
    actionable: true,
  },
  PRIZE: {
    label: "Prize",
    description: "A competition with an entry deadline.",
    hasIssuerDeadline: true,
    fundingShape: "NON_DILUTIVE",
    direction: "INBOUND",
    actionable: true,
  },
  CONSORTIUM_CALL: {
    label: "Partner search",
    description: "Someone looking for partners for a bid. The prize is a place in a consortium, not a cheque.",
    hasIssuerDeadline: true,
    fundingShape: "NONE",
    direction: "NEUTRAL",
    actionable: true,
  },
  MARKETPLACE_PROJECT: {
    label: "Marketplace project",
    description:
      "A client posting paid work on a marketplace. Nobody closes a window — it goes to whoever is credible first, so speed matters more than a deadline.",
    hasIssuerDeadline: false,
    fundingShape: "CONTRACT",
    direction: "INBOUND",
    actionable: true,
  },
  ACQUISITION: {
    label: "Acquisition",
    description:
      "A company, product or module for sale. Money goes OUT, not in — it never belongs in the same total as a grant or a contract.",
    hasIssuerDeadline: false,
    fundingShape: "PURCHASE",
    direction: "OUTBOUND",
    actionable: true,
  },
  REGULATORY: {
    label: "Regulatory watch",
    description: "A rule change worth knowing about. There is nothing to apply to, so it is never pursued.",
    hasIssuerDeadline: false,
    fundingShape: "NONE",
    direction: "NEUTRAL",
    actionable: false,
  },
};

export function kindLabel(kind: string | undefined): string {
  return KIND_PROFILES[normalizeKind(kind)].label;
}
