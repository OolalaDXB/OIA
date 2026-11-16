/**
 * Fusion des recommandations générées (src/reco-generators.ts) dans
 * recommendations.yaml, sans jamais réécrire une décision humaine ni une
 * exécution :
 *  - une recommandation déjà présente (même identifiant) reste telle quelle,
 *    texte, preuves, décision et exécution compris ;
 *  - une nouvelle s'ajoute en « pending » ;
 *  - une recommandation présente mais plus générée n'est ni retirée ni
 *    rendue obsolète : c'est un geste humain.
 * Le fichier est édité comme un document YAML : commentaires et mise en
 * forme des entrées existantes sont conservés.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { Document, isSeq, parseDocument } from "yaml";
import { RecommendationsFileSchema, type Recommendation } from "./recommendation.js";

export interface MergeResult {
  recommendations: Recommendation[];
  /** Nouvelles, ajoutées en « pending ». */
  added: string[];
  /** Générées mais déjà présentes : laissées intactes. */
  kept: string[];
  /** Présentes mais plus générées : laissées intactes, à revoir par un humain. */
  notRegenerated: string[];
}

function assertGenerated(generated: Recommendation[]) {
  for (const r of generated) {
    if (r.decision.status !== "pending" || r.decision.by || r.decision.at) throw new Error(`${r.id} : une recommandation générée sort en « pending », sans décision`);
    if (r.execution) throw new Error(`${r.id} : une recommandation générée ne porte pas d'exécution`);
    if (!r.evidence.length) throw new Error(`${r.id} : recommandation sans preuve`);
  }
}

export function mergeRecommendations(existing: Recommendation[], generated: Recommendation[]): MergeResult {
  assertGenerated(generated);
  const present = new Set(existing.map((r) => r.id));
  const fresh = generated.filter((r) => !present.has(r.id));
  const genIds = new Set(generated.map((r) => r.id));
  return {
    recommendations: [...existing, ...fresh],
    added: fresh.map((r) => r.id),
    kept: generated.filter((r) => present.has(r.id)).map((r) => r.id),
    notRegenerated: existing.filter((r) => !genIds.has(r.id)).map((r) => r.id),
  };
}

/** Fusionne dans le fichier ; ne l'écrit que s'il y a des ajouts. */
export function mergeRecommendationsFile(file: string, generated: Recommendation[]): MergeResult {
  const doc = existsSync(file) ? parseDocument(readFileSync(file, "utf8")) : new Document({ schemaVersion: 1, recommendations: [] });
  if (doc.errors.length) throw new Error(`${file} : YAML illisible (${doc.errors[0]!.message})`);
  const current = RecommendationsFileSchema.parse(doc.toJS()).recommendations;
  const result = mergeRecommendations(current, generated);
  if (!result.added.length) return result;
  const seq = doc.get("recommendations");
  if (!isSeq(seq)) throw new Error(`${file} : « recommendations » n'est pas une liste`);
  for (const r of generated.filter((x) => result.added.includes(x.id))) seq.add(doc.createNode(r));
  // Contrôle du fichier complet avant écriture : doublons, exécution sans validation.
  RecommendationsFileSchema.parse(doc.toJS());
  writeFileSync(file, doc.toString({ lineWidth: 0 }));
  return result;
}
