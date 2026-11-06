import type { VisibilityLLM } from "./llm";
import type { Recommendation } from "./recommendation";

/**
 * Revue croisée d'un rapport (F4). Un rapport est envoyé à plusieurs
 * relecteurs (`seo`, `aeo`, `conversion`...) via `VisibilityLLM.review`.
 * Chaque critique est enregistrée avec sa source. Une critique ne modifie
 * une recommandation que si elle pointe une erreur vérifiable ou une preuve
 * manquante (règle de F4).
 */

export interface ReviewerSource {
  role: string;
  /** Instance du LLM (fictive ou réelle). */
  llm: VisibilityLLM;
}

export interface Critique {
  reviewer: string;
  kind: "error" | "missing-evidence" | "nuance";
  text: string;
}

export interface ReviewOutcome {
  critiques: Critique[];
  /** Décision par critique : `accepted` (modifie la reco), `rejected` (noté, pas pris). */
  decisions: Array<{ critique: Critique; decision: "accepted" | "rejected"; reason?: string }>;
}

/**
 * Lance une revue croisée. Les critiques sont décidées par la règle codée :
 *  - `error` et `missing-evidence` → acceptées (modifient la reco) ;
 *  - `nuance` → rejetées, enregistrées pour mémoire.
 */
export async function reviewReport(
  report: string,
  reviewers: ReviewerSource[],
): Promise<ReviewOutcome> {
  const critiques: Critique[] = [];
  for (const r of reviewers) {
    const out = await r.llm.review({
      purpose: "report.review",
      system: `You review as the ${r.role} reviewer. Only raise an issue if it is a verifiable error or a missing evidence.`,
      report,
      reviewerRole: r.role,
    });
    for (const f of out.data.findings) {
      critiques.push({ reviewer: r.role, kind: f.kind, text: f.text });
    }
  }
  const decisions = critiques.map((c) => {
    if (c.kind === "error" || c.kind === "missing-evidence") {
      return { critique: c, decision: "accepted" as const };
    }
    return { critique: c, decision: "rejected" as const, reason: "Nuance only — not a verifiable error nor a missing evidence." };
  });
  return { critiques, decisions };
}

/**
 * Applique une revue à une recommandation : pour chaque décision `accepted`,
 * marque la reco à `decision.status = pending` + réduit la confiance ou
 * demande une nouvelle preuve, selon le `kind` de la critique.
 */
export function applyReview(reco: Recommendation, outcome: ReviewOutcome): Recommendation {
  const accepted = outcome.decisions.filter((d) => d.decision === "accepted");
  if (accepted.length === 0) return reco;
  const nextConfidence: Recommendation["confidence"] = accepted.some((d) => d.critique.kind === "error")
    ? "low"
    : reco.confidence === "high"
      ? "medium"
      : reco.confidence;
  return {
    ...reco,
    confidence: nextConfidence,
    decision: { ...reco.decision, status: "pending" },
    statement: `${reco.statement}\n\nRevue croisée : ${accepted.length} critique(s) retenue(s) — voir cross-review.`,
  };
}
