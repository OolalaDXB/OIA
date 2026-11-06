import { describe, expect, it } from "vitest";
import { checkFact, checkFacts, checkFactsWithLLM, type ReferenceFact } from "../src/fact-check";
import { createFakeVisibilityLLM } from "../src/llm";

const facts: ReferenceFact[] = [
  { id: "f-price", statement: "Le prix est 42 €", keywords: ["42 €", "42 EUR"], contradictions: ["50 €", "60 €"] },
  { id: "f-city", statement: "Basé à Fictiveville", keywords: ["Fictiveville"] },
];

describe("checkFact", () => {
  it("returns matches when a keyword is present", () => {
    const r = checkFact("Tarif indicatif : 42 €, pas plus.", facts[0]!);
    expect(r.status).toBe("matches");
    expect(r.source).toBe("deterministic");
  });

  it("returns contradicts when a contradicting value is present (priority over matches)", () => {
    const r = checkFact("Plutôt autour de 50 €, pas 42 €.", facts[0]!);
    expect(r.status).toBe("contradicts");
    expect(r.evidence).toBe("50 €");
  });

  it("returns absent when nothing matches", () => {
    const r = checkFact("Donnée fictive sans prix ni ville.", facts[0]!);
    expect(r.status).toBe("absent");
  });

  it("checkFacts runs per-fact", () => {
    const out = checkFacts("Fictiveville, pas de prix mentionné", facts);
    expect(out[0]!.status).toBe("absent");
    expect(out[1]!.status).toBe("matches");
  });
});

describe("checkFactsWithLLM (LLM derrière G1)", () => {
  it("marks an absent fact as 'extracted' when the LLM says it is present in substance", async () => {
    const llm = createFakeVisibilityLLM({
      "facts.extract": () => ({ present: true }),
    });
    const out = await checkFactsWithLLM("Le tarif est de quarante-deux euros.", facts, llm);
    const price = out.find((r) => r.factId === "f-price")!;
    expect(price.status).toBe("extracted");
    expect(price.source).toBe("llm");
  });

  it("keeps the 'absent' status when the LLM denies it", async () => {
    const llm = createFakeVisibilityLLM({
      "facts.extract": () => ({ present: false }),
    });
    const out = await checkFactsWithLLM("Aucun prix mentionné.", facts, llm);
    expect(out.find((r) => r.factId === "f-price")!.status).toBe("absent");
  });

  it("never upgrades a deterministic 'matches' through the LLM (règle : extracted ≠ matches)", async () => {
    const llm = createFakeVisibilityLLM({
      "facts.extract": () => ({ present: true }),
    });
    const out = await checkFactsWithLLM("42 € tout rond, à Fictiveville.", facts, llm);
    expect(out.find((r) => r.factId === "f-price")!.status).toBe("matches");
    expect(out.find((r) => r.factId === "f-price")!.source).toBe("deterministic");
  });
});
