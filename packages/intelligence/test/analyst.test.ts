import { describe, expect, it } from "vitest";
import {
  ANALYST_SYSTEM,
  EligibilityVerdictSchema,
  analystPrompt,
  verdictViolations,
  type AnalystInput,
} from "../src/analyst";

/**
 * The analyst turns 270 unsorted records into a dozen worth an hour. That is
 * only an improvement if its verdicts are true — a confident "NOT_ELIGIBLE —
 * reserved for local authorities" on a call that says no such thing hides a
 * real opportunity behind a sentence nobody will question.
 *
 * So the citations are checked against the document, deterministically.
 */

const FACTS = [
  "Le dispositif Pass Investissement soutient les PME bretonnes de moins de 250 salariés.",
  "Les collectivités territoriales ne sont pas éligibles à ce dispositif.",
  "Montant : jusqu'à 50 000 €.",
].join("\n");

const verdict = (over: Record<string, unknown> = {}) =>
  EligibilityVerdictSchema.parse({
    verdict: "ELIGIBLE",
    reason: { fr: "PME éligible", en: "SME eligible" },
    nextAction: { fr: "Ouvrir le dossier", en: "Open the file" },
    citations: ["Le dispositif Pass Investissement soutient les PME bretonnes de moins de 250 salariés."],
    ...over,
  });

describe("a verdict is only worth the sentences under it", () => {
  it("keeps a citation the document really contains", () => {
    const { kept, dropped } = verdictViolations(verdict(), FACTS);
    expect(kept.citations).toHaveLength(1);
    expect(kept.verdict).toBe("ELIGIBLE");
    expect(dropped).toHaveLength(0);
  });

  it("drops an invented citation", () => {
    const { dropped } = verdictViolations(
      verdict({ citations: ["Réservé aux collectivités de plus de 20 000 habitants."] }),
      FACTS,
    );
    expect(dropped[0]!.reason).toMatch(/does not appear/);
  });

  it("downgrades a decisive verdict that cited nothing real, rather than deleting it", () => {
    // The dangerous case: a confident NOT_ELIGIBLE on a fabricated exclusion.
    // Deleting it would leave the record looking unexamined; keeping it as
    // stated would hide a real opportunity.
    const { kept } = verdictViolations(
      verdict({ verdict: "NOT_ELIGIBLE", citations: ["Seules les communes peuvent candidater."] }),
      FACTS,
    );
    expect(kept.verdict).toBe("NEEDS_INFO");
    expect(kept.citations).toHaveLength(0);
    expect(kept.reason.fr).toMatch(/ne citait rien de vérifiable/);
    expect(kept.reason.en).toMatch(/cited nothing checkable/);
  });

  it("leaves NEEDS_INFO alone when it cites nothing — that is honest, not a failure", () => {
    const { kept } = verdictViolations(verdict({ verdict: "NEEDS_INFO", citations: [] }), FACTS);
    expect(kept.verdict).toBe("NEEDS_INFO");
  });

  it("tolerates re-wrapped whitespace but not a changed claim", () => {
    const rewrapped = verdict({
      citations: ["Le dispositif Pass Investissement   soutient les PME\n  bretonnes de moins de 250 salariés."],
    });
    expect(verdictViolations(rewrapped, FACTS).kept.citations).toHaveLength(1);

    const altered = verdict({ citations: ["Le dispositif Pass Investissement soutient les grandes entreprises."] });
    expect(verdictViolations(altered, FACTS).dropped).toHaveLength(1);
  });

  it("refuses a citation too short to be checkable", () => {
    const { dropped } = verdictViolations(verdict({ citations: ["PME"] }), FACTS);
    expect(dropped[0]!.reason).toMatch(/too short/);
  });

  it("keeps a real NOT_ELIGIBLE backed by a real exclusion", () => {
    const { kept } = verdictViolations(
      verdict({
        verdict: "NOT_ELIGIBLE",
        citations: ["Les collectivités territoriales ne sont pas éligibles à ce dispositif."],
      }),
      FACTS,
    );
    expect(kept.verdict).toBe("NOT_ELIGIBLE");
    expect(kept.citations).toHaveLength(1);
  });
});

describe("both languages, always", () => {
  it("requires a verdict to carry French and English", () => {
    const v = verdict();
    expect(v.reason.fr).not.toBe("");
    expect(v.reason.en).not.toBe("");
    expect(v.nextAction.fr).not.toBe("");
    expect(v.nextAction.en).not.toBe("");
  });

  it("asks the model for both, in the instruction itself", () => {
    expect(ANALYST_SYSTEM).toMatch(/BOTH French and English/);
    // And forbids the single most damaging move.
    expect(ANALYST_SYSTEM).toMatch(/Never use what you know about this programme/);
  });
});

describe("what the analyst is shown", () => {
  const input: AnalystInput = {
    title: "Pass Investissement",
    issuer: "Région Bretagne",
    kind: "GRANT",
    factText: FACTS,
    project: {
      slug: "sillon",
      name: "SILLON",
      oneLiner: "Distribution musicale",
      sectors: ["culture"],
      geographies: ["FR"],
      entities: ["Oolala France SAS"],
    },
  };

  it("gives it the dossier and the entities that could apply", () => {
    const prompt = analystPrompt(input);
    expect(prompt).toContain("Oolala France SAS");
    expect(prompt).toContain("Pass Investissement");
    expect(prompt).toContain("PME bretonnes");
  });

  it("caps an enormous extraction rather than sending everything", () => {
    expect(analystPrompt({ ...input, factText: "x".repeat(50_000) }).length).toBeLessThan(14_000);
  });
});
