/**
 * Recommandations générées depuis les chiffres d'une fenêtre (mandat v15, bloc D).
 * Générateurs déterministes, sans appel réseau ni modèle : ils ne lisent que le
 * sujet, figures.json (format 2), la table des preuves et, en option, l'audit
 * du site (bloc A : indexation, Crawlie), les acteurs et les homonymes extraits.
 *
 * Chaque recommandation porte au moins une preuve (identifiant de réponse,
 * rapport d'audit ou chemin `figures.json#…`), son action, son responsable,
 * son effort et, en fin de `statement`, la façon de vérifier l'effet à la
 * remesure (« Vérification à la remesure : … »). Toutes sortent en
 * `decision: pending` ; l'identifiant ne dépend que du type et de la cible,
 * pour qu'une régénération ne double rien (fusion : src/reco-merge.ts).
 */
import { createHash } from "node:crypto";
import type { EvidenceRow } from "./elmo-import.js";
import { checkFact, type ReferenceFact } from "./fact-check.js";
import type { FactKeywords, ReportFigures } from "./j0-report.js";
import { classifyCitation, mentions, profileUrls } from "./j0-reanalysis.js";
import { RecommendationSchema, type Recommendation, type RecommendationType } from "./recommendation.js";
import { applyRedirects, isRedirectLink, type RedirectCache } from "./redirects.js";
import type { SubjectBundle } from "./schema.js";

/** Acteur nommé dans les réponses (src/site/actors.ts) : type minimal local. */
export interface ExtractedActor {
  name: string;
  type?: string;
  aliases?: string[];
  /** Réponses où l'acteur est nommé ; à défaut, recherchées dans les preuves. */
  evidenceIds?: string[];
}

/** Homonyme ou nom voisin de la marque (src/site/actors.ts) : type minimal local. */
export interface Homonym {
  name: string;
  aliases?: string[];
}

export type IndexState = "absent" | "present" | "non vérifiable";

/** Contrôle public de l'indexation (audit du bloc A) : type minimal local. */
export interface IndexAudit {
  bing: IndexState;
  google: IndexState;
  /** Fichier du relevé (preuve). */
  ref?: string;
}

/** Audit Crawlie : seules les règles et les pages sont lues. */
export interface CrawlieAudit {
  ref: string;
  issues: { rule: string; url: string }[];
}

export interface GeneratorOptions {
  clientId: string;
  siteId?: string;
  /** Date de création (AAAA-MM-JJ), fournie par l'appelant : la sortie ne dépend pas de l'horloge. */
  today: string;
  createdBy?: string;
  /** Chemin de figures.json tel qu'il apparaît dans les preuves. */
  figuresRef?: string;
  redirects?: RedirectCache;
  /** Nombre maximal d'identifiants de réponses par recommandation (FIX_FACT : toutes). */
  maxEvidencePerReco?: number;
  sourceTarget?: { minCitations?: number; max?: number; excludeDomains?: string[] };
  homonyms?: Homonym[];
  /** Noms voisins de la marque cherchés dans le texte (distance d'édition), en plus des homonymes fournis. */
  detectNeighbours?: boolean;
  indexAudit?: IndexAudit;
  crawlie?: CrawlieAudit;
  /** Règles Crawlie qui signalent un contenu invisible sans JavaScript. */
  noJsRules?: string[];
  factKeywords?: FactKeywords;
  actors?: ExtractedActor[];
  watch?: { minRuns?: number; max?: number };
}

const DEFAULT_NO_JS_RULES = ["price-client-side"];
const STRUCTURED_DATA_RULES = (rule: string) => rule.startsWith("schema-missing-") || rule === "structured-data-missing";

const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const slug = (s: string) => norm(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};
const cut = (s: string, n: number) => (s.length <= n ? s : `${s.slice(0, n - 1)}…`);

/** Identifiant stable : dérivé du type et de la cible seulement. */
export function recommendationId(type: RecommendationType, target: string): string {
  const h = createHash("sha256").update(`${type}:${norm(target)}`).digest("hex").slice(0, 8);
  const s = slug(target).slice(0, 40).replace(/-+$/, "");
  return `rec-${slug(type)}-${s ? `${s}-` : ""}${h}`;
}

type Structured = { brandMentioned?: boolean | null };

interface Ctx {
  b: SubjectBundle;
  f: ReportFigures;
  rows: EvidenceRow[];
  o: GeneratorOptions;
  brandDomains: string[];
  profiles: string[];
  competitorDomains: string[];
  aliases: string[];
  figuresRef: string;
  maxEv: number;
  base: (type: RecommendationType, target: string) => Pick<
    Recommendation,
    "id" | "schemaVersion" | "type" | "clientId" | "siteId" | "subjectId" | "windowId" | "decision" | "createdBy" | "createdAt"
  >;
}

const byTime = (a: EvidenceRow, z: EvidenceRow) => a.receivedAt.localeCompare(z.receivedAt) || a.id.localeCompare(z.id);
const enginesOf = (rs: EvidenceRow[]) => [...new Set(rs.map((r) => r.engine))].sort().join(", ");
const rowRef = (r: EvidenceRow, note?: string): Recommendation["evidence"][number] => ({
  kind: "evidence-row",
  ref: r.id,
  sha256: r.rawSha256Hex,
  note: `${r.engine}, ${r.promptId}@v${r.promptVersion}, ${r.receivedAt.slice(0, 10)}${note ? ` : ${note}` : ""}`,
});

function familyOf(c: Ctx, r: EvidenceRow) {
  return c.b.panel.prompts.find((p) => p.id === r.promptId && p.version === r.promptVersion)?.family;
}

/** Mention de la marque : jugement consigné (Jev) s'il existe, sinon alias dans le texte. */
function brandMentioned(c: Ctx, r: EvidenceRow): boolean {
  const j = (r.structured as Structured).brandMentioned;
  if (typeof j === "boolean") return j;
  return mentions(r.rawText, c.aliases).length > 0;
}

// --- SOURCE_TARGET ------------------------------------------------------------

function sourceTargets(c: Ctx): Recommendation[] {
  const min = c.o.sourceTarget?.minCitations ?? 3;
  const max = c.o.sourceTarget?.max ?? 5;
  const excluded = new Set((c.o.sourceTarget?.excludeDomains ?? []).map((d) => d.toLowerCase()));
  const stats = new Map<string, { n: number; rows: Map<string, EvidenceRow>; brandRows: number }>();
  for (const r of c.rows) {
    const urls = r.citations.map((x) => applyRedirects(x.url, c.o.redirects ?? {}));
    const classes = urls.map((u) => classifyCitation(u, c.brandDomains, c.profiles, c.competitorDomains));
    const brandCited = classes.some((k) => k === "marque-site" || k === "marque-profil");
    const seen = new Set<string>();
    urls.forEach((u, i) => {
      if (classes[i] !== "autre" && classes[i] !== "reseau-social") return;
      if (isRedirectLink(u)) return;
      const h = host(u);
      if (!h || excluded.has(h)) return;
      const s = stats.get(h) ?? { n: 0, rows: new Map(), brandRows: 0 };
      s.n++;
      s.rows.set(r.id, r);
      if (brandCited && !seen.has(h)) s.brandRows++;
      seen.add(h);
      stats.set(h, s);
    });
  }
  const top = new Map(c.f.sources.topDomains.map((d) => [d.domain, d.n]));
  const primary = host(c.b.subject.urls.primary) ?? c.b.subject.urls.primary;
  return [...stats.entries()]
    .filter(([, s]) => s.n >= min && s.brandRows === 0)
    .sort((a, z) => z[1].n - a[1].n || a[0].localeCompare(z[0]))
    .slice(0, max)
    .map(([domain, s]) => {
      const rs = [...s.rows.values()].sort(byTime);
      const evidence: Recommendation["evidence"] = [];
      if (top.has(domain)) evidence.push({ kind: "other", ref: `${c.figuresRef}#sources.topDomains`, note: `${domain} ${top.get(domain)}` });
      evidence.push(...rs.slice(0, c.maxEv).map((r) => rowRef(r)));
      return {
        ...c.base("SOURCE_TARGET", domain),
        owner: "client" as const,
        title: cut(`Être présent sur ${domain}`, 140),
        statement:
          `${domain} est cité ${s.n} fois par les assistants pendant ${c.f.windowId} (${rs.length} réponse(s) ; ${enginesOf(rs)}), ` +
          `et aucune de ces réponses ne cite le site ou un profil officiel de la marque. ` +
          `Action : créer ou compléter la fiche de la marque sur ${domain} (même nom, courte présentation, lieu, lien vers ${primary}), sans code ; URL et date à consigner. ` +
          `Vérification à la remesure : au moins une réponse qui cite ${domain} cite aussi le site ou un profil officiel de la marque.`,
        evidence,
        impact: { level: "medium" as const },
        effort: { level: "XS" as const },
        risk: "low" as const,
        confidence: "medium" as const,
      };
    });
}

// --- ENTITY_INCONSISTENCY -------------------------------------------------------

function levenshtein(a: string, z: string): number {
  const d = Array.from({ length: z.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0]!;
    d[0] = i;
    for (let j = 1; j <= z.length; j++) {
      const t = d[j]!;
      d[j] = Math.min(d[j]! + 1, d[j - 1]! + 1, prev + (a[i - 1] === z[j - 1] ? 0 : 1));
      prev = t;
    }
  }
  return d[z.length]!;
}

/** Suites de mots à majuscule proches d'un nom de la marque (1 à 2 lettres d'écart), sans l'égaler. */
export function neighbourNames(text: string, brandNames: string[]): string[] {
  const runs = text.match(/\p{Lu}[\p{L}'’-]*(?:\s+\p{Lu}[\p{L}'’-]*)*/gu) ?? [];
  const found = new Set<string>();
  for (const name of brandNames) {
    const k = name.trim().split(/\s+/).length;
    const target = norm(name);
    if (target.length < 4) continue;
    const tol = Math.max(1, Math.floor(target.length / 5));
    for (const run of runs) {
      const words = run.split(/\s+/);
      for (let i = 0; i + k <= words.length; i++) {
        const cand = words.slice(i, i + k).join(" ");
        const dist = levenshtein(norm(cand), target);
        if (dist > 0 && dist <= tol) found.add(cand);
      }
    }
  }
  return [...found].sort();
}

function entityInconsistencies(c: Ctx): Recommendation[] {
  const brandNames = c.b.subject.aliases.filter((a) => a.status !== "rejected" && (a.kind === "name" || a.kind === "person")).map((a) => a.value);
  const known = new Set(c.aliases.map(norm));
  const hits = new Map<string, { neighbour: boolean; rows: EvidenceRow[] }>();
  const add = (name: string, r: EvidenceRow, neighbour: boolean) => {
    const h = hits.get(name) ?? { neighbour, rows: [] };
    h.neighbour &&= neighbour;
    if (!h.rows.includes(r)) h.rows.push(r);
    hits.set(name, h);
  };
  for (const r of c.rows) {
    if (familyOf(c, r) !== "branded" || brandMentioned(c, r)) continue;
    for (const h of c.o.homonyms ?? []) {
      if (mentions(r.rawText, [h.name, ...(h.aliases ?? [])], { caseSensitive: true }).length) add(h.name, r, false);
    }
    if (c.o.detectNeighbours ?? true) {
      for (const n of neighbourNames(r.rawText, brandNames)) if (!known.has(norm(n))) add(n, r, true);
    }
  }
  return [...hits.entries()]
    .sort((a, z) => z[1].rows.length - a[1].rows.length || a[0].localeCompare(z[0]))
    .map(([name, h]) => {
      const rs = h.rows.sort(byTime);
      return {
        ...c.base("ENTITY_INCONSISTENCY", name),
        owner: "team" as const,
        title: cut(`Désambiguïser la marque de « ${name} »`, 140),
        statement:
          `Sur les questions qui nomment la marque, ${rs.length} réponse(s) (${enginesOf(rs)}) parlent de « ${name} » sans mentionner la marque` +
          `${h.neighbour ? " (nom voisin détecté par l'écart d'orthographe, à confirmer)" : " (homonyme signalé à l'ajout du site)"}. ` +
          `Action : nom public constant, lieu et activité sur la page « à propos », profils officiels en sameAs dans les données structurées. ` +
          `Vérification à la remesure : sur ces mêmes questions, aucune réponse ne nomme « ${name} » à la place de la marque.`,
        evidence: rs.slice(0, c.maxEv).map((r) => rowRef(r, name)),
        impact: { level: "high" as const },
        effort: { level: "S" as const },
        risk: "low" as const,
        confidence: h.neighbour ? ("low" as const) : ("medium" as const),
        fix: { kind: "jsonld-organization" as const, generator: "manual", notes: "sameAs des profils officiels ; nom public et page « à propos » à décider avec le client." },
      };
    });
}

// --- TECH_FIX -------------------------------------------------------------------

function techFixes(c: Ctx): Recommendation[] {
  const out: Recommendation[] = [];
  const primary = host(c.b.subject.urls.primary) ?? c.b.subject.urls.primary;
  const ia = c.o.indexAudit;
  if (ia) {
    for (const [engine, label] of [["bing", "Bing"], ["google", "Google"]] as const) {
      if (ia[engine] !== "absent") continue;
      out.push({
        ...c.base("TECH_FIX", `index-${engine}`),
        owner: "team",
        title: `Faire indexer ${primary} par ${label}`,
        statement:
          `Le contrôle public de l'indexation ne trouve aucune page de ${primary} dans ${label}. ` +
          `Action : soumettre le plan du site (outils pour webmasters de ${label}${engine === "bing" ? ", IndexNow" : ""}), sans modifier le site ; rien n'est envoyé sans accord. ` +
          `Vérification à la remesure : le même contrôle trouve au moins une page de ${primary} dans ${label}.`,
        evidence: [{ kind: "other", ref: ia.ref ?? "audit:indexation", note: `${label} : absent` }],
        impact: { level: "high" },
        effort: { level: "XS" },
        risk: "low",
        confidence: "medium",
        fix: { kind: "sitemap-xml", generator: "manual", notes: `Soumission dans les outils de ${label} ; aucune modification du site.` },
      });
    }
  }
  const cr = c.o.crawlie;
  if (cr) {
    const noJs = new Set(c.o.noJsRules ?? DEFAULT_NO_JS_RULES);
    const byRule = new Map<string, Set<string>>();
    for (const i of cr.issues) {
      if (!noJs.has(i.rule) && !STRUCTURED_DATA_RULES(i.rule)) continue;
      byRule.set(i.rule, (byRule.get(i.rule) ?? new Set()).add(i.url));
    }
    for (const [rule, urlSet] of [...byRule.entries()].sort((a, z) => a[0].localeCompare(z[0]))) {
      const urls = [...urlSet].sort();
      const pages = `${urls.length} page(s) : ${urls.slice(0, 5).join(", ")}${urls.length > 5 ? ", …" : ""}`;
      const evidence: Recommendation["evidence"] = [{ kind: "crawlie-report", ref: `${cr.ref}#issues[rule=${rule}]`, note: pages }];
      if (noJs.has(rule)) {
        const price = rule.startsWith("price-");
        out.push({
          ...c.base("TECH_FIX", rule),
          owner: "team",
          title: price ? "Rendre les prix lisibles sans JavaScript" : "Rendre le contenu lisible sans JavaScript",
          statement:
            `L'audit Crawlie signale un contenu affiché seulement après JavaScript (règle ${rule}, ${pages}) : les robots des assistants ne le lisent pas. ` +
            `Action : servir ce contenu dans le HTML initial (rendu serveur ou texte statique). ` +
            `Vérification à la remesure : la règle ${rule} n'apparaît plus dans l'audit Crawlie relancé sur ces pages.`,
          evidence,
          impact: { level: price ? "high" : "medium" },
          effort: { level: "S" },
          risk: "low",
          confidence: "medium",
          fix: { kind: price ? "price-ssr-placeholder" : "manual", generator: "manual" },
        });
      } else {
        out.push({
          ...c.base("TECH_FIX", rule),
          owner: "team",
          title: "Ajouter les données structurées manquantes",
          statement:
            `L'audit Crawlie signale des données structurées manquantes ou incomplètes (règle ${rule}, ${pages}). ` +
            `Action : ajouter le JSON-LD attendu (organisation ou entreprise locale, offres), à partir des faits validés seulement. ` +
            `Vérification à la remesure : la règle ${rule} n'apparaît plus dans l'audit Crawlie relancé sur ces pages.`,
          evidence,
          impact: { level: "medium" },
          effort: { level: "S" },
          risk: "low",
          confidence: "medium",
          fix: { kind: "jsonld-organization", generator: "manual" },
        });
      }
    }
  }
  return out;
}

// --- FIX_FACT -------------------------------------------------------------------

const PRICE = /(?:[$€£]\s?\d|\b(?:USD|EUR|GBP|AED|CHF|CAD)\s?\d|\d[\d.,]*\s?(?:[$€£]|(?:USD|EUR|GBP|AED|CHF|CAD|dirhams?|euros?|dollars?)\b))/i;

/** Vrai si le texte cite un montant (symbole ou code de devise accolé à un nombre). */
export const citesPrice = (text: string) => PRICE.test(text);

function factFixes(c: Ctx): Recommendation[] {
  const out: Recommendation[] = [];
  const aboutBrand = c.rows.filter((r) => mentions(r.rawText, c.aliases).length > 0).sort(byTime);
  const checked = new Set(c.f.factCheck.map((x) => x.factId));
  for (const f of c.b.facts.facts.filter((x) => x.status === "validated")) {
    const k = c.o.factKeywords?.facts.find((x) => x.id === f.id);
    if (!k?.contradictions?.length) continue;
    const ref: ReferenceFact = { id: f.id, statement: f.statement, keywords: k.keywords, contradictions: k.contradictions };
    const hits = aboutBrand.map((r) => ({ r, res: checkFact(r.rawText, ref) })).filter((x) => x.res.status === "contradicts");
    if (!hits.length) continue;
    const rs = hits.map((x) => x.r);
    out.push({
      ...c.base("FIX_FACT", f.id),
      owner: "team",
      title: cut(`Corriger ce que les assistants disent : ${f.statement}`, 140),
      statement:
        `${rs.length} réponse(s) qui nomment la marque (${enginesOf(rs)}) contredisent le fait validé « ${f.statement} » ` +
        `(valeurs trouvées : ${[...new Set(hits.map((x) => x.res.evidence))].join(", ")}). ` +
        `Action : énoncer ce fait clairement sur le site (texte lisible sans JavaScript et données structurées) et sur les profils officiels. ` +
        `Vérification à la remesure : le contrôle des faits ne compte plus de réponse qui contredit ce fait.`,
      evidence: [
        ...hits.map((x) => rowRef(x.r, `contredit par « ${x.res.evidence} »`)),
        { kind: "fact", ref: `facts.yaml#${f.id}` },
        ...(checked.has(f.id) ? [{ kind: "other" as const, ref: `${c.figuresRef}#factCheck`, note: f.id }] : []),
      ],
      impact: { level: "high" },
      effort: { level: "S" },
      risk: "medium",
      confidence: "medium",
    });
  }
  const priceFacts = c.b.facts.facts.filter((x) => x.category === "price");
  if (!priceFacts.some((x) => x.status === "validated")) {
    const rs = c.rows
      .filter((r) => (familyOf(c, r) === "branded" || mentions(r.rawText, c.aliases).length > 0) && citesPrice(r.rawText))
      .sort(byTime);
    if (rs.length) {
      out.push({
        ...c.base("FIX_FACT", "prix-a-fournir"),
        owner: "team",
        title: "Publier les prix de la marque pour que les assistants cessent de les deviner",
        statement:
          `${rs.length} réponse(s) (${enginesOf(rs)}) citent des prix pour la marque, alors qu'aucun prix n'est validé : ces montants ne viennent pas d'elle. ` +
          `Action : obtenir du client ses prix et formules (fait « à fournir »), puis les publier lisibles sans JavaScript et en données structurées. ` +
          `Vérification à la remesure : les prix cités pour la marque correspondent au fait validé.`,
        blockedBy: "prix et formules à fournir par le client (aucun fait de prix validé)",
        evidence: [
          ...rs.map((r) => rowRef(r, "prix cité")),
          ...priceFacts.filter((x) => x.status !== "rejected").map((x) => ({ kind: "fact" as const, ref: `facts.yaml#${x.id}`, note: `statut ${x.status}` })),
        ],
        impact: { level: "high" },
        effort: { level: "S" },
        risk: "medium",
        confidence: "medium",
        fix: { kind: "price-ssr-placeholder", generator: "manual", notes: "Bloqué tant que le client n'a pas fourni ses prix." },
      });
    }
  }
  return out;
}

// --- WATCH ------------------------------------------------------------------------

function watches(c: Ctx): Recommendation[] {
  const minRuns = c.o.watch?.minRuns ?? 2;
  const max = c.o.watch?.max ?? 10;
  const tracked = new Set(
    [
      ...c.b.subject.competitors.flatMap((x) => [x.name, ...x.aliases]),
      ...c.aliases,
      ...(c.o.homonyms ?? []).flatMap((h) => [h.name, ...(h.aliases ?? [])]),
    ].map(norm),
  );
  const byId = new Map(c.rows.map((r) => [r.id, r]));
  return (c.o.actors ?? [])
    .filter((a) => ![a.name, ...(a.aliases ?? [])].some((n) => tracked.has(norm(n))))
    .map((a) => {
      const rs = a.evidenceIds
        ? [...new Set(a.evidenceIds)].map((id) => byId.get(id)).filter((r): r is EvidenceRow => !!r)
        : c.rows.filter((r) => mentions(r.rawText, [a.name, ...(a.aliases ?? [])], { caseSensitive: true }).length > 0);
      return { a, rs: rs.sort(byTime) };
    })
    .filter((x) => x.rs.length >= minRuns)
    .sort((x, z) => z.rs.length - x.rs.length || x.a.name.localeCompare(z.a.name))
    .slice(0, max)
    .map(({ a, rs }) => ({
      ...c.base("WATCH", a.name),
      owner: "team" as const,
      title: cut(`Suivre « ${a.name} »${a.type ? ` (${a.type})` : ""}, cité par les assistants`, 140),
      statement:
        `« ${a.name} » est nommé dans ${rs.length} réponse(s) (${enginesOf(rs)}) pendant ${c.f.windowId}, mais ne fait pas partie des concurrents suivis. ` +
        `Action : décider de l'ajouter aux concurrents (« proposé » jusqu'à validation) avant la remesure. ` +
        `Vérification à la remesure : s'il est ajouté, ses mentions sont comptées avec celles des concurrents suivis.`,
      evidence: rs.slice(0, c.maxEv).map((r) => rowRef(r, a.name)),
      impact: { level: "medium" as const },
      effort: { level: "XS" as const },
      risk: "low" as const,
      confidence: "medium" as const,
    }));
}

// --------------------------------------------------------------------------------

export function generateRecommendations(b: SubjectBundle, figures: ReportFigures, evidence: EvidenceRow[], opts: GeneratorOptions): Recommendation[] {
  if (figures.subjectId !== b.subject.id) throw new Error(`figures.json du sujet ${figures.subjectId}, attendu ${b.subject.id}`);
  const s = b.subject;
  const c: Ctx = {
    b,
    f: figures,
    o: opts,
    rows: evidence.filter((e) => e.windowId === figures.windowId && e.subjectId === s.id),
    brandDomains: [s.urls.primary, ...s.urls.additional.filter((a) => a.status !== "rejected").map((a) => a.url)].map((u) => host(u)!),
    profiles: profileUrls(b),
    competitorDomains: s.competitors.filter((x) => x.status !== "rejected").flatMap((x) => x.domains),
    aliases: s.aliases.filter((a) => a.status !== "rejected" && a.kind !== "domain").map((a) => a.value),
    figuresRef: opts.figuresRef ?? "figures.json",
    maxEv: opts.maxEvidencePerReco ?? 5,
    base: (type, target) => ({
      id: recommendationId(type, target),
      schemaVersion: 1,
      type,
      clientId: opts.clientId,
      ...(opts.siteId ? { siteId: opts.siteId } : {}),
      subjectId: s.id,
      windowId: figures.windowId,
      decision: { status: "pending" },
      createdBy: opts.createdBy ?? "reco-generators",
      createdAt: opts.today,
    }),
  };
  const all = [...techFixes(c), ...factFixes(c), ...entityInconsistencies(c), ...sourceTargets(c), ...watches(c)];
  const ids = new Set<string>();
  return all.map((r) => {
    if (ids.has(r.id)) throw new Error(`recommandation ${r.id} générée deux fois`);
    ids.add(r.id);
    return RecommendationSchema.parse(r);
  });
}
