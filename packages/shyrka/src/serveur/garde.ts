/**
 * Garde des faits (mandat v9, G2) : toute date citée dans une réponse doit
 * figurer dans les données rendues par les outils pendant l'échange. Une date
 * sans source est signalée à Mickaël, jamais laissée passer en silence.
 * Compatible Deno et Node.
 */
const MOIS: Record<string, string> = {
  janvier: "01", fevrier: "02", mars: "03", avril: "04", mai: "05", juin: "06", juillet: "07", aout: "08",
  septembre: "09", octobre: "10", novembre: "11", decembre: "12", january: "01", february: "02", march: "03",
  april: "04", may: "05", june: "06", july: "07", august: "08", september: "09", october: "10", december: "12",
};
const sansAccent = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Dates complètes d'un texte, au format AAAA-MM-JJ. */
export function datesCitees(texte: string): string[] {
  const t = sansAccent(texte);
  const out = new Set<string>();
  for (const m of t.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) out.add(`${m[1]}-${m[2]}-${m[3]}`);
  for (const m of t.matchAll(/\b(\d{1,2})(?:er)?\s+([a-z]+)\s+(\d{4})\b/g)) {
    const mois = MOIS[m[2]!];
    if (mois) out.add(`${m[3]}-${mois}-${m[1]!.padStart(2, "0")}`);
  }
  for (const m of t.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.add(`${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`);
  return [...out];
}

/** Dates de la réponse qu'aucune donnée d'outil ne contient (ni la date du jour). */
export function datesSansSource(reponse: string, donnees: string[], aujourdhui: string): string[] {
  const corpus = donnees.join("\n");
  return datesCitees(reponse).filter((d) => d !== aujourdhui && !corpus.includes(d));
}
