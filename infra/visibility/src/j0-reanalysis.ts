/**
 * Réanalyse des réponses complètes d'une fenêtre, sans appel à un fournisseur
 * d'IA : citations classées à l'adresse près (les profils officiels de la
 * marque comptent pour elle, ce qu'Elmo 0.7.7 ne sait pas faire : il classe à
 * l'hôte près, voir verification/n-reseaux-sociaux.yaml N06), mentions par
 * alias dans le texte, concurrents (par segment) et lieux de travail, comptés à part.
 *
 * Entrée : exportation en lecture seule (scripts/j0-reanalysis.sh).
 * CLI : tsx src/j0-reanalysis.ts <subjectId> <export.json> [concurrents.yaml] > rapport.md
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { applyRedirects, isRedirectLink, readCache, type RedirectCache } from "./redirects.js";
import type { SubjectBundle } from "./schema.js";

export interface ReanalysisExport {
  exportedAt: string;
  runs: {
    id: string;
    model: string;
    version: string;
    createdAt: string;
    promptValue: string;
    promptTags: string[];
    text: string | null;
    /** Jugement de Jev (null tant que non jugé). */
    brandMentioned: boolean | null;
    citations: string[];
  }[];
}

export interface Candidate {
  name: string;
  segment: "dubai-domicile-studio" | "dubai-coach-padel" | "dubai-salle" | "en-ligne-afrique-australe" | "application-en-ligne";
  domains?: string[];
  aliases?: string[];
  source?: string;
  note?: string;
  /** Concurrent de référence : pourquoi (signalé en tête de la section des concurrents). */
  reference?: string;
}

/** Lieu où la marque travaille (une académie qui l'accueille) : pas un concurrent, compté à part. */
export interface Workplace {
  name: string;
  domains?: string[];
  aliases?: string[];
}

export type CitationClass = "marque-site" | "marque-profil" | "concurrent" | "reseau-social" | "autre";

const SOCIAL_HOSTS = ["instagram.com", "tiktok.com", "facebook.com", "youtube.com", "x.com", "twitter.com", "linkedin.com", "threads.net"];

function parseUrl(u: string): { host: string; path: string } | null {
  try {
    const x = new URL(u);
    return { host: x.hostname.replace(/^www\./, "").toLowerCase(), path: x.pathname.replace(/\/+$/, "").toLowerCase() };
  } catch {
    return null;
  }
}
const hostIn = (h: string, domains: string[]) => domains.some((d) => h === d || h.endsWith(`.${d}`));

/** Adresses des profils officiels, tirées des faits « contact » validés ou extraits. */
export function profileUrls(b: SubjectBundle): string[] {
  return b.facts.facts
    .filter((f) => f.category === "contact" && f.status !== "rejected")
    .flatMap((f) => f.statement.match(/https?:\/\/[^\s)]+/g) ?? [])
    .map((u) => u.replace(/[.,;]+$/, ""));
}

export function classifyCitation(url: string, brandDomains: string[], profiles: string[], competitorDomains: string[]): CitationClass {
  const u = parseUrl(url);
  if (!u) return "autre";
  if (hostIn(u.host, brandDomains)) return "marque-site";
  for (const p of profiles) {
    const q = parseUrl(p);
    if (q && u.host === q.host && (u.path === q.path || u.path.startsWith(`${q.path}/`))) return "marque-profil";
  }
  if (hostIn(u.host, competitorDomains)) return "concurrent";
  if (hostIn(u.host, SOCIAL_HOSTS)) return "reseau-social";
  return "autre";
}

/** Adresses écrites dans le texte de la réponse (Mistral ne renvoie pas toujours ses sources à part). */
export function urlsInText(text: string | null): string[] {
  return [...new Set(((text ?? "").match(/https?:\/\/[^\s)\]>"'`]+/g) ?? []).map((u) => u.replace(/[.,;:!?]+$/, "")))];
}

const PLATFORM_TERMS: Record<string, string[]> = { Instagram: ["Instagram"], TikTok: ["TikTok"] };

/** Vrai si le texte contient l'un des termes, en mot entier (pseudonymes avec ou sans @). */
export function mentions(text: string, terms: string[], { caseSensitive = false } = {}): string[] {
  const found: string[] = [];
  for (const t of terms) {
    const core = t.replace(/^@/, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`(?<![\\w])@?${core}(?![\\w])`, caseSensitive ? "" : "i").test(text)) found.push(t);
  }
  return found;
}

export interface Reanalysis {
  runs: number;
  judged: number;
  byEngine: {
    model: string;
    runs: number;
    citations: Record<CitationClass, number>;
    profileCitations: number;
    /** Citations venues des liens écrits dans le texte, absentes des sources renvoyées à part. */
    textOnlyLinks: number;
    /** Liens de redirection (Gemini) restés sans cible connue. */
    unresolvedRedirects: number;
    /** Réponses qui parlent d'Instagram ou de TikTok, et réponses qui citent un pseudonyme de la marque. */
    platformMentionRuns: Record<string, number>;
    handleMentionRuns: number;
    aliasMentionRuns: number;
    jevMentionRuns: number;
    /** Réponses où l'alias apparaît mais que Jev n'a pas comptées (ou l'inverse). */
    disagreements: number;
  }[];
  profileCitations: { url: string; model: string; prompt: string }[];
  topOtherDomains: { domain: string; n: number }[];
  candidateMentions: { name: string; segment: Candidate["segment"]; runs: number; engines: string[]; reference?: string }[];
  workplaceMentions: { name: string; runs: number; engines: string[] }[];
}

/**
 * `redirects` : cibles des liens de redirection (Gemini), résolues par src/redirects.ts.
 * Un lien sans cible connue reste tel quel et est compté comme non résolu.
 */
export function reanalyse(b: SubjectBundle, data: ReanalysisExport, candidates: Candidate[], redirects: RedirectCache = {}, workplaces: Workplace[] = []): Reanalysis {
  const s = b.subject;
  const brandDomains = [
    new URL(s.urls.primary).hostname.replace(/^www\./, ""),
    ...s.urls.additional.filter((a) => a.status !== "rejected").map((a) => new URL(a.url).hostname.replace(/^www\./, "")),
  ];
  const profiles = profileUrls(b);
  const aliasTerms = s.aliases.filter((a) => a.status !== "rejected" && a.kind !== "domain").map((a) => a.value);
  const handles = s.aliases.filter((a) => a.status !== "rejected" && a.kind === "handle").map((a) => a.value);
  const competitorDomains = candidates.flatMap((c) => c.domains ?? []);
  const models = [...new Set(data.runs.map((r) => r.model))].sort();
  const empty = (): Record<CitationClass, number> => ({ "marque-site": 0, "marque-profil": 0, concurrent: 0, "reseau-social": 0, autre: 0 });
  const other = new Map<string, number>();
  const profileCitations: Reanalysis["profileCitations"] = [];

  const byEngine = models.map((model) => {
    const rs = data.runs.filter((r) => r.model === model);
    const citations = empty();
    let aliasMentionRuns = 0;
    let jevMentionRuns = 0;
    let disagreements = 0;
    let textOnlyLinks = 0;
    let unresolvedRedirects = 0;
    let handleMentionRuns = 0;
    const platformMentionRuns: Record<string, number> = Object.fromEntries(Object.keys(PLATFORM_TERMS).map((k) => [k, 0]));
    for (const r of rs) {
      const returned = new Set(r.citations.map((u) => applyRedirects(u, redirects)));
      unresolvedRedirects += [...returned].filter(isRedirectLink).length;
      const inText = urlsInText(r.text).filter((u) => !returned.has(u));
      textOnlyLinks += inText.length;
      for (const [k, terms] of Object.entries(PLATFORM_TERMS)) if (mentions(r.text ?? "", terms).length) platformMentionRuns[k]!++;
      if (mentions(r.text ?? "", handles).length) handleMentionRuns++;
      for (const url of new Set([...returned, ...inText])) {
        const c = classifyCitation(url, brandDomains, profiles, competitorDomains);
        citations[c]++;
        if (c === "marque-profil") profileCitations.push({ url, model, prompt: r.promptValue });
        if (c === "autre" || c === "reseau-social") {
          const h = parseUrl(url)?.host;
          if (h) other.set(h, (other.get(h) ?? 0) + 1);
        }
      }
      const alias = mentions(r.text ?? "", aliasTerms).length > 0;
      if (alias) aliasMentionRuns++;
      if (r.brandMentioned) jevMentionRuns++;
      if (r.brandMentioned !== null && alias !== r.brandMentioned) disagreements++;
    }
    return {
      model,
      runs: rs.length,
      citations,
      profileCitations: citations["marque-profil"],
      textOnlyLinks,
      unresolvedRedirects,
      platformMentionRuns,
      handleMentionRuns,
      aliasMentionRuns,
      jevMentionRuns,
      disagreements,
    };
  });

  // Noms propres : casse respectée (« Future » ≠ « future »).
  const hitsOf = (c: { name: string; aliases?: string[] }) => {
    const hits = data.runs.filter((r) => mentions(r.text ?? "", [c.name, ...(c.aliases ?? [])], { caseSensitive: true }).length > 0);
    return { runs: hits.length, engines: [...new Set(hits.map((h) => h.model))].sort() };
  };
  const byRuns = <T extends { name: string; runs: number }>(a: T, z: T) => z.runs - a.runs || a.name.localeCompare(z.name);
  const candidateMentions = candidates
    .map((c) => ({ name: c.name, segment: c.segment, ...hitsOf(c), ...(c.reference ? { reference: c.reference } : {}) }))
    .sort(byRuns);
  const workplaceMentions = workplaces.map((w) => ({ name: w.name, ...hitsOf(w) })).sort(byRuns);

  return {
    runs: data.runs.length,
    judged: data.runs.filter((r) => r.brandMentioned !== null).length,
    byEngine,
    profileCitations,
    topOtherDomains: [...other.entries()]
      .sort((a, z) => z[1] - a[1] || a[0].localeCompare(z[0]))
      .slice(0, 15)
      .map(([domain, n]) => ({ domain, n })),
    candidateMentions,
    workplaceMentions,
  };
}

const SEGMENT_LABEL: Record<Candidate["segment"], string> = {
  "dubai-domicile-studio": "Coachs à domicile et studios à Dubaï",
  "dubai-coach-padel": "Coachs de padel à Dubaï",
  "dubai-salle": "Salles de coaching à Dubaï",
  "en-ligne-afrique-australe": "Coachs en ligne, Afrique australe",
  "application-en-ligne": "Applications de coaching en ligne",
};

export function renderMarkdown(b: SubjectBundle, r: Reanalysis, exportedAt: string): string {
  const L: string[] = [];
  L.push(`# Réanalyse des réponses · ${b.subject.displayName} · ${exportedAt}`, "");
  L.push(`${r.runs} réponses, ${r.judged} jugées par Jev. Aucun appel à un fournisseur d'IA.`, "");
  L.push("## Citations classées à l'adresse près", "");
  L.push("Sources renvoyées par le moteur, plus les liens écrits dans le texte (comptés une fois par réponse). Les liens de redirection de Gemini sont remplacés par le site réel qu'ils désignent (lu dans la redirection, sans contacter le site).", "");
  const unresolved = r.byEngine.reduce((n, e) => n + e.unresolvedRedirects, 0);
  if (unresolved) L.push(`Liens de redirection non résolus, laissés tels quels : ${unresolved}.`, "");
  L.push("| Moteur | Réponses | Site de la marque | Profils officiels | Concurrents | Autres réseaux sociaux | Autres | dont liens du texte seul |");
  L.push("|---|---|---|---|---|---|---|---|");
  for (const e of r.byEngine) {
    const c = e.citations;
    L.push(`| ${e.model} | ${e.runs} | ${c["marque-site"]} | ${c["marque-profil"]} | ${c.concurrent} | ${c["reseau-social"]} | ${c.autre} | ${e.textOnlyLinks} |`);
  }
  L.push("", "## Réseaux sociaux", "");
  const totalProfile = r.byEngine.reduce((n, e) => n + e.profileCitations, 0);
  L.push(`Citations des profils officiels (comptées pour la marque) : **${totalProfile}**.`, "");
  for (const p of r.profileCitations) L.push(`- ${p.model} · ${p.url} · « ${p.prompt} »`);
  if (!r.profileCitations.length) L.push("- aucune");
  const platforms = Object.keys(r.byEngine[0]?.platformMentionRuns ?? {});
  L.push("", `| Moteur | ${platforms.map((p) => `Réponses parlant de ${p}`).join(" | ")} | Réponses citant un pseudonyme de la marque |`);
  L.push(`|---|${platforms.map(() => "---").join("|")}|---|`);
  for (const e of r.byEngine) L.push(`| ${e.model} | ${platforms.map((p) => e.platformMentionRuns[p]).join(" | ")} | ${e.handleMentionRuns} |`);
  L.push("", "## Mentions de la marque : alias dans le texte et jugement de Jev", "");
  L.push("Un alias dans le texte ne vaut pas mention : une réponse peut nommer la marque pour dire qu'elle ne la connaît pas. Les désaccords sont à relire, pas à corriger.", "");
  L.push("| Moteur | Réponses citant un alias | Réponses comptées par Jev | Désaccords |", "|---|---|---|---|");
  for (const e of r.byEngine) L.push(`| ${e.model} | ${e.aliasMentionRuns} | ${e.jevMentionRuns} | ${e.disagreements} |`);
  L.push("", "## Domaines les plus cités hors marque et hors concurrents", "");
  for (const d of r.topOtherDomains) L.push(`- ${d.domain} : ${d.n}`);
  L.push("", "## Concurrents, mentions dans les réponses", "");
  for (const c of r.candidateMentions.filter((x) => x.reference)) L.push(`**Concurrent de référence : ${c.name}** (${c.runs} réponse(s)). ${c.reference}`, "");
  for (const seg of Object.keys(SEGMENT_LABEL) as Candidate["segment"][]) {
    L.push(`### ${SEGMENT_LABEL[seg]}`, "");
    const xs = r.candidateMentions.filter((c) => c.segment === seg);
    for (const c of xs) L.push(`- ${c.name} : ${c.runs} réponse(s)${c.engines.length ? ` (${c.engines.join(", ")})` : ""}`);
    if (!xs.length) L.push("- aucun concurrent");
    L.push("");
  }
  L.push("## Lieux de travail (pas des concurrents), mentions comptées à part", "");
  for (const w of r.workplaceMentions) L.push(`- ${w.name} : ${w.runs} réponse(s)${w.engines.length ? ` (${w.engines.join(", ")})` : ""}`);
  if (!r.workplaceMentions.length) L.push("- aucun lieu déclaré");
  L.push("");
  return `${L.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, exportFile, candidatesFile, redirectCacheFile] = process.argv.slice(2);
  try {
    if (!subjectId || !exportFile) throw new Error("usage: tsx src/j0-reanalysis.ts <subjectId> <export.json> [concurrents.yaml]");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const data = JSON.parse(readFileSync(exportFile, "utf8")) as ReanalysisExport;
    const parsed = candidatesFile ? (parse(readFileSync(candidatesFile, "utf8")) as { candidates?: Candidate[]; lieux?: Workplace[] } | null) : null;
    const candidates = parsed?.candidates ?? [];
    const redirects = redirectCacheFile ? readCache(redirectCacheFile) : {};
    process.stdout.write(renderMarkdown(b, reanalyse(b, data, candidates, redirects, parsed?.lieux ?? []), data.exportedAt));
  } catch (err) {
    process.stderr.write(`j0-reanalysis : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
