/**
 * Passage des sorties du bloc A aux formats de `proposition/` que lisent la revue et la
 * validation (src/proposition.ts, bloc B) : meta.yaml, faits.yaml, concurrents.yaml,
 * homonymes.yaml et audit.json. Les détails (acteurs.json, homonymes.json,
 * audit-lecture.json) restent à côté, pour la revue.
 */
import { z } from "zod";
import { AuditSchema, ConcurrentsSchema, FaitsSchema, HomonymesSchema, MetaSchema, type Audit } from "../proposition.js";
import { FactSchema } from "../schema.js";
import type { ActorsFile } from "./actors.js";
import type { SiteAudit } from "./audit.js";
import type { PageSource } from "./facts.js";
import type { HomonymsFile } from "./homonyms.js";
import { fold, hostOf } from "./text.js";

type Fact = z.infer<typeof FactSchema>;

/** Identifiant lisible et stable : « Studio Alpha » → « studio-alpha ». */
export function slugOf(name: string, taken: Set<string>): string {
  const base = fold(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "x";
  let id = base;
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
  taken.add(id);
  return id;
}

export function metaFile(o: { subjectId: string; clientId: string; url: string; today: string }) {
  return MetaSchema.parse({ schemaVersion: 1, subjectId: o.subjectId, clientId: o.clientId, siteId: o.subjectId, url: o.url, proposeLe: o.today });
}

/** Faits extraits, chacun avec l'adresse de sa page, au statut `extrait`. */
export function faitsFile(facts: Fact[], sources: PageSource[], today: string) {
  const url = new Map(sources.map((s) => [s.id, s.ref]));
  return FaitsSchema.parse({
    schemaVersion: 1,
    faits: facts.map((f) => ({ id: f.id, statement: f.statement, language: f.language, category: f.category, sourceUrl: url.get(f.sourceId) ?? "", extraitLe: today, statut: "extrait", ...(f.note ? { note: f.note } : {}) })),
  });
}

/** Réseaux sociaux : un profil n'est pas le domaine de l'acteur. */
const SOCIAL_HOSTS = ["instagram.com", "facebook.com", "linkedin.com", "youtube.com", "tiktok.com", "x.com", "twitter.com"];

/** Acteurs nommés → concurrents proposés (tous `extrait`). */
export function concurrentsFile(a: ActorsFile, aggregators: string[] = SOCIAL_HOSTS) {
  const taken = new Set<string>();
  const kv = (r: Record<string, number>) => Object.entries(r).map(([k, v]) => `${k} ${v}`).join(", ");
  return ConcurrentsSchema.parse({
    schemaVersion: 1,
    concurrents: a.acteurs.map((x) => {
      // Domaine propre seulement quand la source citée porte le nom (pas un annuaire ni un réseau social).
      const host = x.source ? hostOf(x.source) : null;
      const own = host && !aggregators.some((g) => host === g || host.endsWith(`.${g}`)) && fold(host).replace(/[^a-z0-9]/g, "").includes(fold(x.name).replace(/[^a-z0-9]/g, "").slice(0, 6)) ? [host] : [];
      return {
        id: slugOf(x.name, taken),
        name: x.name,
        type: x.type,
        domains: own,
        aliases: x.variantes,
        category: x.type,
        markets: [],
        citations: x.reponses,
        rationale: `Nommé dans ${x.reponses} réponse(s) de la reconnaissance (${kv(x.parMoteur)} ; questions ${kv(x.parQuestion)}) ; exemple ${x.exemple} ; source ${x.source ?? "aucune citée à côté du nom"}`,
        statut: "extrait",
      };
    }),
  });
}

export function homonymesFile(h: HomonymsFile) {
  const taken = new Set<string>();
  return HomonymesSchema.parse({
    schemaVersion: 1,
    homonymes: h.homonymes.map((x) => ({
      id: slugOf(x.nom, taken),
      value: x.nom,
      citations: x.reponses,
      contexte: `${x.type === "domaine" ? "domaine voisin" : "nom voisin"} (mot « ${x.terme} ») : « ${x.occurrences[0]?.passage ?? ""} » (${x.occurrences[0]?.reponse ?? "?"})`.slice(0, 600),
      statut: "extrait",
    })),
  });
}

/** Constats de l'audit de lecture, au format de la revue. */
export function auditFile(a: SiteAudit): Audit {
  const c = a.crawlie;
  const constats: Audit["constats"] = [];
  const push = (code: string, niveau: "ok" | "attention" | "bloquant", texte: string, preuve?: string) => constats.push({ code, niveau, texte, ...(preuve ? { preuve } : {}) });
  if (c.statut === "echec") push("pages", "attention", `Crawlie en échec : ${c.detail}`);
  else push("pages", c.pages.indexables > 0 ? "ok" : "bloquant", `${c.pages.total} page(s) crawlée(s), ${c.pages.indexables} indexable(s) (rendu ${c.rendu ?? "inconnu"})`);
  const prix = [...c.prixSansJs.map((p) => p.url), ...a.lecture.pages.filter((p) => p.prixSansJs.length).map((p) => p.url)];
  push("prix-sans-js", prix.length ? "ok" : "attention", prix.length ? `Prix lisibles sans JavaScript sur ${[...new Set(prix)].length} page(s)` : "Aucun prix lisible sans JavaScript", prix[0]);
  const types = [...new Set([...c.donneesStructurees.types, ...a.lecture.pages.flatMap((p) => p.jsonLdTypes)])].sort();
  const invalid = c.donneesStructurees.jsonldInvalides + a.lecture.pages.reduce((s, p) => s + p.jsonLdInvalides, 0);
  push(
    "donnees-structurees",
    !types.length ? "attention" : invalid || c.donneesStructurees.pagesSans.length ? "attention" : "ok",
    `${types.length ? `Types : ${types.join(", ")}` : "Aucune donnée structurée"} ; ${c.donneesStructurees.pagesSans.length} page(s) sans ; ${invalid} bloc(s) JSON-LD invalide(s)`,
  );
  const noindex = c.robots.noindex;
  push("robots", noindex.length ? "attention" : "ok", `robots.txt ${c.robots.robotsTxt === false ? "absent" : "présent"}, sitemap ${c.robots.sitemap === false ? "absent" : "présent"} ; ${c.robots.bloquees.length} adresse(s) bloquée(s) ; noindex : ${noindex.length ? noindex.join(", ") : "aucun"}`, noindex[0]);
  if (c.robots.llmsTxt === false) push("llms-txt", "attention", "Pas de llms.txt");
  for (const i of a.indexation) {
    push(`index-${i.moteur}`, i.statut === "trouve" ? "ok" : i.statut === "aucun-resultat" ? "bloquant" : "attention", `${i.requete} : ${i.statut === "trouve" ? "trouvé" : i.statut === "aucun-resultat" ? "aucun résultat" : "non vérifiable"} (indicatif) — ${i.detail}`, i.url);
  }
  return AuditSchema.parse({ schemaVersion: 1, url: a.site, faitLe: a.le.slice(0, 10), constats });
}
