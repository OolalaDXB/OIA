/**
 * Exclusions appliquées AVANT tout appel au modèle (mandat v9, G4 ; amendement
 * du 7 novembre, § 4) : ce qui touche à Swift ne part jamais, et les données
 * personnelles sensibles (numéros de compte, de carte, de document) sont
 * masquées. En cas de doute, on exclut.
 *
 * Compatible Deno et Node : aucune dépendance.
 */

/** Swift en graphie officielle, et ses variantes d'écriture (casse, domaine, accents, séparateurs). */
const SWIFT = /(^|[^\p{L}\p{N}])s[\s._-]*w[\s._-]*i[\s._-]*f[\s._-]*t([^\p{L}\p{N}]|$)|swift\.com|swiftnet/iu;

const SENSIBLES: { nom: string; motif: RegExp; remplacement: string }[] = [
  { nom: "iban", motif: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g, remplacement: "[compte masqué]" },
  { nom: "carte", motif: /\b(?:\d[ -]?){13,19}\b/g, remplacement: "[numéro masqué]" },
  { nom: "passeport", motif: /\b(?:passeport|passport)\s*(?:n[°o]?\s*)?[:#]?\s*[A-Z0-9]{6,9}\b/gi, remplacement: "[document masqué]" },
];

export function toucheSwift(texte: string): boolean {
  return SWIFT.test(texte.normalize("NFKD").replace(/[̀-ͯ]/g, ""));
}

export function masquerSensibles(texte: string): { texte: string; masques: string[] } {
  const masques: string[] = [];
  let t = texte;
  for (const s of SENSIBLES) {
    const avant = t;
    t = t.replace(s.motif, s.remplacement);
    if (t !== avant) masques.push(s.nom);
  }
  return { texte: t, masques };
}

/** Filtre des lignes lues dans OIA : une ligne qui touche à Swift est retirée entière. */
export function filtrerLignes<T>(lignes: T[]): { lignes: T[]; retirees: number } {
  const gardees = lignes.filter((l) => !toucheSwift(JSON.stringify(l)));
  return { lignes: gardees.map((l) => JSON.parse(masquerSensibles(JSON.stringify(l)).texte) as T), retirees: lignes.length - gardees.length };
}
