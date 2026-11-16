/**
 * Termes d'un sujet pour l'extraction des acteurs et des homonymes : marque, alias, domaines
 * (jamais proposés comme concurrents) et lieux des marchés (écartés des acteurs, tolérés à
 * côté du nom de marque).
 */
import type { Subject } from "../schema.js";

function regionNames(country: string): string[] {
  return ["fr", "en"].flatMap((l) => {
    try {
      const n = new Intl.DisplayNames([l], { type: "region" }).of(country);
      return n && n !== country ? [n] : [];
    } catch {
      return [];
    }
  });
}

export function subjectTerms(s: Subject): { brandTerms: string[]; nameAliases: string[]; domains: string[]; places: string[] } {
  const live = s.aliases.filter((a) => a.status !== "rejected");
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  const domains = [...new Set([host(s.urls.primary), ...s.urls.additional.filter((a) => a.status !== "rejected").map((a) => host(a.url)), ...live.filter((a) => a.kind === "domain").map((a) => a.value)])];
  const nameAliases = live.filter((a) => (a.kind === "name" || a.kind === "person" || a.kind === "handle") && a.value !== s.displayName).map((a) => a.value);
  const places = [...new Set(s.markets.flatMap((m) => [m.label, m.country, ...regionNames(m.country)]))];
  return { brandTerms: [...new Set([s.displayName, ...nameAliases, ...domains])], nameAliases, domains, places };
}
