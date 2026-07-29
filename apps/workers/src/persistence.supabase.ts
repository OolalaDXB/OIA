import type { OiaClient } from "@oia/database";
import type { Persistence, PersistInput } from "./persistence";

/** Supabase-backed persistence. Uses the service-role client (bypasses RLS). */
export function createSupabasePersistence(client: OiaClient): Persistence {
  async function insertReturningId(table: string, row: Record<string, unknown>): Promise<string> {
    const { data, error } = await client.from(table).insert(row).select("id").single();
    if (error) throw new Error(`${table} insert failed: ${error.message}`);
    return (data as { id: string }).id;
  }

  return {
    async persist(input: PersistInput): Promise<string> {
      const { opportunity, evidence, result, projectId, sourceId } = input;

      // 1. Evidence (if fetched).
      let evidenceId: string | null = null;
      if (evidence) {
        evidenceId = await insertReturningId("evidence", {
          source_id: sourceId,
          url: evidence.url,
          http_status: evidence.httpStatus,
          fetched_at: evidence.fetchedAt,
          content_hash: evidence.contentHash,
          content_text: evidence.text,
          content_type: evidence.contentType ?? null,
        });
      }

      // 2. Opportunity (upsert on dedup key).
      const deadlineClaim = result.claims.find((c) => c.field === "deadline");
      const deadlineAt = opportunity.hints.deadlineAt ?? null;
      const deadlineStatus =
        opportunity.hints.status === "open"
          ? "open"
          : opportunity.hints.status === "upcoming"
            ? "upcoming"
            : opportunity.hints.status === "closed"
              ? "closed"
              : "unknown";
      const dedupKey = `${opportunity.sourceKey}:${opportunity.externalId}`;

      const { data: oppData, error: oppErr } = await client
        .from("opportunities")
        .upsert(
          {
            project_id: projectId,
            source_id: sourceId,
            primary_evidence_id: evidenceId,
            title: opportunity.title,
            summary: opportunity.hints.summary ?? null,
            programme_name: opportunity.hints.programmeName ?? null,
            funder: opportunity.hints.funder ?? null,
            primary_url: opportunity.url,
            amount_min: opportunity.hints.amountMin ?? null,
            amount_max: opportunity.hints.amountMax ?? null,
            currency: opportunity.hints.currency ?? null,
            deadline_at: deadlineClaim ? deadlineAt : null,
            deadline_status: deadlineStatus,
            status: "qualified",
            dedup_key: dedupKey,
          },
          { onConflict: "project_id,dedup_key" },
        )
        .select("id")
        .single();
      if (oppErr) throw new Error(`opportunities upsert failed: ${oppErr.message}`);
      const opportunityId = (oppData as { id: string }).id;

      // 3. LLM runs (need ids for claim references).
      const llmRunIdByHash = new Map<string, string>();
      for (const run of result.llmRuns) {
        const id = await insertReturningId("llm_runs", {
          provider: run.provider,
          model: run.model,
          purpose: run.purpose,
          prompt_hash: run.promptHash,
          input_tokens: run.inputTokens ?? null,
          output_tokens: run.outputTokens ?? null,
          cost_usd: run.costUsd ?? null,
          opportunity_id: opportunityId,
        });
        llmRunIdByHash.set(run.promptHash, id);
      }

      // 4. Claims.
      const claimRows = result.claims.map((c) => ({
        opportunity_id: opportunityId,
        claim_type: c.claimType,
        field: c.field,
        value_text: c.valueText ?? null,
        value_json: c.valueJson ?? null,
        evidence_id: c.citesEvidence ? evidenceId : null,
        confidence: c.confidence,
        produced_by: c.producedBy,
      }));
      const { error: claimErr } = await client.from("claims").insert(claimRows);
      if (claimErr) throw new Error(`claims insert failed: ${claimErr.message}`);

      // 5. Scores.
      const { error: scoreErr } = await client.from("opportunity_scores").insert({
        opportunity_id: opportunityId,
        relevance: result.scores.relevance,
        eligibility: result.scores.eligibility,
        win_potential: result.scores.winPotential,
        info_confidence: result.scores.infoConfidence,
        model_version: result.scores.modelVersion,
        breakdown: result.scores.breakdown,
      });
      if (scoreErr) throw new Error(`opportunity_scores insert failed: ${scoreErr.message}`);

      // 6. Eligibility assessment.
      const { error: eligErr } = await client.from("eligibility_assessments").insert({
        opportunity_id: opportunityId,
        project_id: projectId,
        verdict: result.eligibility.verdict,
        criteria: result.eligibility.criteria,
        rationale: result.eligibility.rationale ?? null,
        assessed_by: "pipeline",
      });
      if (eligErr) throw new Error(`eligibility_assessments insert failed: ${eligErr.message}`);

      // 7. Recommendation (supersede any prior current one).
      await client
        .from("recommendations")
        .update({ is_current: false })
        .eq("opportunity_id", opportunityId)
        .eq("is_current", true);
      const { error: recErr } = await client.from("recommendations").insert({
        opportunity_id: opportunityId,
        action: result.recommendation.action,
        next_action: result.recommendation.nextAction ?? null,
        gate_passed: result.recommendation.gatePassed,
        gate_report: result.gate,
        rationale: result.recommendation.rationale ?? null,
        is_current: true,
        created_by: "pipeline",
      });
      if (recErr) throw new Error(`recommendations insert failed: ${recErr.message}`);

      return opportunityId;
    },
  };
}
