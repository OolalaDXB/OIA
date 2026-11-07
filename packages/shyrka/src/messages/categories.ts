/**
 * Catégories de messages, reprises des douze messages fictifs de la séance 7
 * (docs/shyrka/entretiens.md). La séance 7 décide, catégorie par catégorie,
 * si Shyrka répond seule, rédige pour validation ou signale sans toucher ;
 * ces décisions se reportent dans infra/shyrka/permissions.json.
 */
export const CATEGORIES = {
  "prospect-tarifs": "Un prospect demande des tarifs",
  "plainte-client": "Un client se plaint",
  "rendez-vous": "Une proposition de rendez-vous",
  "retard-prestataire": "Un prestataire annonce un retard",
  "relance-facture": "Une relance de facture",
  "sollicitation-commerciale": "Une sollicitation commerciale",
  "mise-en-relation": "Une demande de mise en relation",
  "invitation-intervention": "Une invitation à intervenir",
  "voyageur-maison": "Un voyageur au sujet d'une maison",
  presse: "Une demande de la presse",
  "proche-disponibilite": "Un proche demande une disponibilité",
  ambigu: "Un message ambigu",
} as const;

export type Categorie = keyof typeof CATEGORIES;

export function estCategorie(v: unknown): v is Categorie {
  return typeof v === "string" && Object.prototype.hasOwnProperty.call(CATEGORIES, v);
}
