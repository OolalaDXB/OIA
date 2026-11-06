import type { VisibilityLLM } from "./llm";

/**
 * Contrôle des faits : compare une réponse IA (texte libre) à des faits de
 * référence validés. Détection déterministe d'abord ; extraction par LLM
 * derrière l'interface G1, implémentation fictive.
 *
 * Statut des résultats :
 *  - `matches` (déterministe) : le fait est cité tel quel (ou via une variante).
 *  - `contradicts` (déterministe) : une valeur contradictoire apparaît littéralement.
 *  - `extracted` (LLM) : le LLM dit qu'un fait est cité, mais le détecteur
 *    déterministe n'a rien trouvé. **Toujours marqué `extracted`**, jamais
 *    `validated`, jusqu'à relecture humaine.
 */

export interface ReferenceFact {
  id: string;
  statement: string;
  /** Mots-clés qui identifient le fait dans le texte (ex: valeur normalisée). */
  keywords: string[];
  /** Valeurs contradictoires qui rendent le fait faux si présentes. */
  contradictions?: string[];
}

export interface FactCheckResult {
  factId: string;
  status: "matches" | "contradicts" | "extracted" | "absent";
  source: "deterministic" | "llm";
  evidence?: string;
}

function containsAny(haystack: string, needles: string[]): string | null {
  const low = haystack.toLowerCase();
  for (const n of needles) {
    if (n.length === 0) continue;
    if (low.includes(n.toLowerCase())) return n;
  }
  return null;
}

/** Contrôle déterministe sur une réponse unique. */
export function checkFact(responseText: string, fact: ReferenceFact): FactCheckResult {
  const contrary = fact.contradictions ? containsAny(responseText, fact.contradictions) : null;
  if (contrary) {
    return { factId: fact.id, status: "contradicts", source: "deterministic", evidence: contrary };
  }
  const hit = containsAny(responseText, fact.keywords);
  if (hit) {
    return { factId: fact.id, status: "matches", source: "deterministic", evidence: hit };
  }
  return { factId: fact.id, status: "absent", source: "deterministic" };
}

export function checkFacts(responseText: string, facts: ReferenceFact[]): FactCheckResult[] {
  return facts.map((f) => checkFact(responseText, f));
}

/**
 * Deuxième passe par LLM : pour les faits marqués `absent`, demande à un LLM
 * si le fait est présent en substance (sans les mots-clés exacts). Si le LLM
 * dit oui, on marque `extracted` (jamais `matches`).
 */
export async function checkFactsWithLLM(
  responseText: string,
  facts: ReferenceFact[],
  llm: VisibilityLLM,
): Promise<FactCheckResult[]> {
  const first = checkFacts(responseText, facts);
  const results = await Promise.all(
    first.map(async (r) => {
      if (r.status !== "absent") return r;
      const f = facts.find((x) => x.id === r.factId)!;
      const out = await llm.extract({
        purpose: "facts.extract",
        schemaName: "FactExtraction",
        system: "Say if the fact is present in the answer, yes or no, in JSON.",
        input: `Fait : ${f.statement}\nRéponse : ${responseText}`,
        parse: (raw: unknown) => {
          const o = raw as { present?: unknown };
          return { present: Boolean(o.present) };
        },
      });
      if (out.data.present) {
        return { factId: r.factId, status: "extracted" as const, source: "llm" as const, evidence: "LLM extraction" };
      }
      return r;
    }),
  );
  return results;
}
