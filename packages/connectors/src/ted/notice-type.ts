/**
 * What kind of TED notice is this, and can you actually bid on it?
 *
 * Measured on the last real recorded response (100 notices):
 *
 *   qu-sy        81   qualification system — a standing supplier register
 *   cn-standard  16   contract notice — the thing you bid on
 *   corr          2   corrigendum
 *   cn-social     1   social and other specific services
 *
 * So 81% of what discovery was retrieving is not an opportunity at all, and
 * 99 of the 100 carried no deadline — which is why the gate blocked almost
 * everything on "no verified deadline". That read as a verification problem for
 * months; it was a source-selection problem.
 *
 * The classification is by prefix rather than by an exhaustive list, because
 * eForms notice subtypes are numerous and change: an unknown value maps to
 * UNKNOWN and is KEPT, never silently dropped. Dropping a notice we failed to
 * recognise would be the same error as retrieving one we cannot use.
 */

export const NOTICE_CLASSES = [
  /** A live call for tenders: this is what the studio can actually bid on. */
  "BIDDABLE",
  /**
   * Prior information / planning notice. No bid yet — and the highest-value
   * category for a studio, because the specification is not written in stone.
   */
  "PRE_SOLICITATION",
  /** Standing supplier register. No deadline, no award: not an opportunity. */
  "QUALIFICATION_SYSTEM",
  /** Result of a past procedure — informative, too late to bid. */
  "AWARD_RESULT",
  /** A correction to another notice. */
  "CORRECTION",
  /** Recognised as a notice, not recognised as a kind. Kept, flagged. */
  "UNKNOWN",
] as const;
export type NoticeClass = (typeof NOTICE_CLASSES)[number];

export function classifyNoticeType(noticeType: string | undefined): NoticeClass {
  const t = (noticeType ?? "").trim().toLowerCase();
  if (!t) return "UNKNOWN";
  if (t.startsWith("qu-")) return "QUALIFICATION_SYSTEM";
  if (t.startsWith("corr")) return "CORRECTION";
  if (t.startsWith("pin")) return "PRE_SOLICITATION";
  if (t.startsWith("can") || t.startsWith("cm-") || t.includes("award")) return "AWARD_RESULT";
  if (t.startsWith("cn") || t.startsWith("subco")) return "BIDDABLE";
  return "UNKNOWN";
}

/** Classes worth putting in front of a human. */
export const WORTH_PROCESSING: readonly NoticeClass[] = ["BIDDABLE", "PRE_SOLICITATION", "UNKNOWN"];

export function isWorthProcessing(noticeType: string | undefined): boolean {
  return WORTH_PROCESSING.includes(classifyNoticeType(noticeType));
}

/** Why a notice was set aside — recorded in the run report, never silent. */
export function skipReason(noticeType: string | undefined): string | null {
  const cls = classifyNoticeType(noticeType);
  if (WORTH_PROCESSING.includes(cls)) return null;
  const why: Record<string, string> = {
    QUALIFICATION_SYSTEM: "qualification system — a standing supplier register, not a call to bid",
    AWARD_RESULT: "award notice — the procedure is over",
    CORRECTION: "corrigendum — it amends another notice rather than being one",
  };
  return why[cls] ?? `notice class ${cls}`;
}
