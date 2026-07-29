import { EligibilityAssessmentSchema, type EligibilityAssessment, type ProjectProfile } from "@oia/database";
import type { LLMProvider, LLMResult } from "@oia/providers";

const SYSTEM = `You are an eligibility analyst for public funding programmes.
Given a PROJECT profile and the primary SOURCE text of a funding opportunity,
assess whether the project is eligible. Be conservative: if a criterion cannot
be determined from the source, mark it met=null (unknown) rather than guessing.
You produce an ASSESSMENT (an informed judgement), not an official fact.`;

const MAX_SOURCE_CHARS = 12_000;

export async function assessEligibility(
  provider: LLMProvider,
  project: ProjectProfile,
  sourceText: string,
): Promise<LLMResult<EligibilityAssessment>> {
  const profileSummary = JSON.stringify(
    {
      legalEntities: project.legalEntities,
      geographies: project.geographies,
      sectors: project.sectors,
      stage: project.stage,
      fundingTypes: project.fundingTypes,
    },
    null,
    2,
  );

  const input = [
    "PROJECT:",
    profileSummary,
    "",
    "SOURCE (primary text, truncated):",
    sourceText.slice(0, MAX_SOURCE_CHARS),
    "",
    'Return JSON: { "verdict": "eligible|likely|ineligible|unknown", "criteria": [{ "criterion": string, "met": true|false|null, "note"?: string }], "rationale"?: string }',
  ].join("\n");

  return provider.extract<EligibilityAssessment>({
    schema: EligibilityAssessmentSchema,
    schemaName: "EligibilityAssessment",
    system: SYSTEM,
    input,
    purpose: "assess_eligibility",
  });
}
