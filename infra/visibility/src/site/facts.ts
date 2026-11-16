/**
 * Faits proposés d'un site (mandat v15, bloc A, étape 5), chacun avec sa page source et au
 * statut `extracted` (« extrait ») : seul un humain le passe à `validated`.
 *
 *  - sans `--go` : extraction DÉTERMINISTE minimale, sans aucun appel : titre, description,
 *    JSON-LD (nom, adresse, téléphone, courriel, offres, prix, zone servie, profils sameAs) ;
 *  - avec `--go` : extraction par Mistral (`packages/providers`, `extract`), une page par
 *    appel, après affichage du coût estimé ; plafond d'appels posé sur le fournisseur.
 *
 * Les mêmes lectures donnent aussi ce que le panel utilise : offres, lieux, nom de marque.
 */
import { z } from "zod";
import type { LLMProvider } from "../../../../packages/providers/src/types.js";
import { findPrice } from "../cost-grid.js";
import { FactSchema, type Facts } from "../schema.js";
import type { JsonLdNode, ParsedPage } from "./pages.js";

type Fact = z.infer<typeof FactSchema>;
type Category = Fact["category"];

export interface PageSource {
  id: string;
  kind: "url";
  ref: string;
  description: string;
  addedAt: string;
}

export interface Offer {
  name: string;
  language: string;
  price?: string;
  sourceId: string;
}

export interface Place {
  locality: string;
  country: string | null;
  sourceId: string;
}

/** Ce que les pages disent du site, hors faits : sert au panel et aux homonymes. */
export interface SiteFindings {
  /** Nom de l'entité, dans l'ordre de confiance : JSON-LD, og:site_name, titre. */
  brandCandidates: string[];
  offers: Offer[];
  places: Place[];
  profiles: string[];
}

export interface FactExtraction {
  sources: PageSource[];
  facts: Fact[];
  findings: SiteFindings;
}

/** Une source par page lue, dans l'ordre de lecture. */
export function pageSources(pages: ParsedPage[], today: string): PageSource[] {
  return pages.map((p, i) => ({
    id: `page-${String(i + 1).padStart(2, "0")}`,
    kind: "url",
    ref: p.url,
    description: `Page publique lue le ${today}${p.title ? ` : ${p.title.slice(0, 120)}` : ""}`,
    addedAt: today,
  }));
}

const LABELS: Record<string, Record<string, string>> = {
  fr: { title: "Titre de la page", description: "Description de la page", name: "Nom", address: "Adresse", telephone: "Téléphone", email: "Courriel", offer: "Offre", price: "Prix", priceRange: "Gamme de prix", area: "Zone servie", profile: "Profil public" },
  en: { title: "Page title", description: "Page description", name: "Name", address: "Address", telephone: "Phone", email: "Email", offer: "Offer", price: "Price", priceRange: "Price range", area: "Area served", profile: "Public profile" },
};

const ENTITY_TYPES = /^(Organization|Corporation|LocalBusiness|ProfessionalService|Person|SportsActivityLocation|ExerciseGym|HealthClub|RealEstateAgent|Store|Restaurant|Hotel|LodgingBusiness|EducationalOrganization|.*Business)$/;
const OFFERED_TYPES = /^(Service|Product|Course|Event|Offer|AggregateOffer|Trip|Accommodation|House|Residence|Apartment)$/;

const typesOf = (n: JsonLdNode): string[] => {
  const t = n["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
};
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : v === undefined || v === null ? [] : [v]);
const obj = (v: unknown): JsonLdNode | null => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as JsonLdNode) : null);

function addressText(v: unknown): { text: string; locality: string | null; country: string | null } | null {
  const s = str(v);
  if (s) return { text: s, locality: null, country: null };
  const a = obj(v);
  if (!a) return null;
  const country = str(a.addressCountry) ?? str(obj(a.addressCountry)?.name);
  const locality = str(a.addressLocality);
  const parts = [str(a.streetAddress), [str(a.postalCode), locality].filter(Boolean).join(" "), str(a.addressRegion), country].filter((x): x is string => !!x && x.trim() !== "");
  return parts.length ? { text: parts.join(", "), locality, country: country && /^[A-Z]{2}$/.test(country) ? country : null } : null;
}

function priceOf(o: JsonLdNode): string | null {
  const spec = obj(o.priceSpecification);
  const price = str(o.price) ?? str(spec?.price) ?? (str(o.lowPrice) ? `${str(o.lowPrice)}${str(o.highPrice) ? `–${str(o.highPrice)}` : ""}` : null);
  if (!price) return null;
  const cur = str(o.priceCurrency) ?? str(spec?.priceCurrency);
  return cur ? `${price} ${cur}` : price;
}

/** Tous les objets d'un nœud JSON-LD, à toute profondeur. */
function walk(n: unknown, visit: (o: JsonLdNode) => void, depth = 0): void {
  if (depth > 8) return;
  if (Array.isArray(n)) {
    for (const x of n) walk(x, visit, depth + 1);
    return;
  }
  const o = obj(n);
  if (!o) return;
  visit(o);
  for (const [k, v] of Object.entries(o)) if (k !== "@context") walk(v, visit, depth + 1);
}

/** Extraction déterministe : titre, description et JSON-LD de chaque page. Aucun appel. */
export function extractFactsDeterministic(pages: ParsedPage[], opts: { today: string; languages: string[] }): FactExtraction {
  const sources = pageSources(pages, opts.today);
  const facts: Fact[] = [];
  const seen = new Set<string>();
  const findings: SiteFindings = { brandCandidates: [], offers: [], places: [], profiles: [] };
  const counters = new Map<string, number>();
  // Noms d'entité du JSON-LD (accueil d'abord), puis og:site_name, puis le début du titre.
  const ldNames: string[] = [];
  const siteNames: string[] = [];

  pages.forEach((page, i) => {
    const sourceId = sources[i]!.id;
    const language = page.lang && opts.languages.includes(page.lang) ? page.lang : opts.languages[0]!;
    const L = LABELS[language] ?? LABELS.en!;
    const add = (category: Category, label: string, value: string, note: string) => {
      const statement = `${label} : ${value.replace(/\s+/g, " ").trim()}`.slice(0, 500);
      const key = statement.toLowerCase();
      if (value.trim().length < 2 || seen.has(key)) return;
      seen.add(key);
      const n = (counters.get(category) ?? 0) + 1;
      counters.set(category, n);
      facts.push({ id: `d-${category}-${String(n).padStart(2, "0")}`, statement, language, category, sourceId, status: "extracted", note: `extraction déterministe (${note}), ${page.url}` });
    };

    if (page.title) add("identity", L.title!, page.title, "<title>");
    if (page.description) add("identity", L.description!, page.description, "meta description");
    if (page.siteName) siteNames.push(page.siteName);

    for (const root of page.jsonLd) {
      walk(root, (n) => {
        const types = typesOf(n);
        const entity = types.some((t) => ENTITY_TYPES.test(t));
        const offered = types.some((t) => OFFERED_TYPES.test(t));
        if (entity) {
          const name = str(n.name);
          if (name) {
            add("identity", L.name!, name, "JSON-LD name");
            ldNames.push(name);
          }
          for (const a of arr(n.address)) {
            const t = addressText(a);
            if (!t) continue;
            add("location", L.address!, t.text, "JSON-LD address");
            if (t.locality) findings.places.push({ locality: t.locality, country: t.country, sourceId });
          }
          for (const tel of arr(n.telephone)) if (str(tel)) add("contact", L.telephone!, str(tel)!, "JSON-LD telephone");
          for (const mail of arr(n.email)) if (str(mail)) add("contact", L.email!, str(mail)!.replace(/^mailto:/i, ""), "JSON-LD email");
          if (str(n.priceRange)) add("price", L.priceRange!, str(n.priceRange)!, "JSON-LD priceRange");
          for (const area of arr(n.areaServed)) {
            const v = str(area) ?? str(obj(area)?.name);
            if (v) add("location", L.area!, v, "JSON-LD areaServed");
          }
          for (const s of arr(n.sameAs)) {
            const u = str(s);
            if (u && /^https?:\/\//.test(u)) {
              add("identity", L.profile!, u, "JSON-LD sameAs");
              if (!findings.profiles.includes(u)) findings.profiles.push(u);
            }
          }
        }
        if (offered) {
          const item = obj(n.itemOffered);
          const name = str(n.name) ?? str(item?.name);
          const price = types.some((t) => /Offer$/.test(t)) ? priceOf(n) : null;
          if (name) {
            add("offer", L.offer!, name, "JSON-LD offre");
            if (!findings.offers.some((o) => o.name.toLowerCase() === name.toLowerCase())) findings.offers.push({ name, language, price: price ?? undefined, sourceId });
          }
          if (price) add("price", L.price!, name ? `${name} — ${price}` : price, "JSON-LD prix");
        }
      });
    }
  });
  const titleStart = pages[0]?.title ? [pages[0].title.split(/\s[|–—-]\s|\s·\s/)[0]!.trim()] : [];
  findings.brandCandidates = [...new Set([...ldNames, ...siteNames, ...titleStart].filter((b) => b.length >= 2))];
  return { sources, facts, findings };
}

/** Sortie attendue de Mistral pour une page. */
export const LlmFactsSchema = z
  .object({
    faits: z
      .array(
        z.object({
          enonce: z.string().min(5).max(500),
          categorie: FactSchema.shape.category,
          langue: z.string().regex(/^[a-z]{2}$/).optional(),
        }),
      )
      .max(40),
  })
  .strict();

export const LLM_FACTS_PURPOSE = "visibility.site.facts";
export const LLM_FACTS_MODEL = "mistral-large-4";
export const LLM_MAX_OUTPUT_TOKENS = 4000;
const LLM_MAX_PAGE_CHARS = 12_000;

const SYSTEM = [
  "Tu lis une page publique d'un site et tu relèves les faits qu'elle ÉNONCE explicitement sur l'entité qui publie le site :",
  "identité, offres, prix, lieux, public visé, coordonnées. Aucune inférence, aucun fait venu d'ailleurs que la page.",
  "Un fait par entrée, court, dans la langue de la page. Catégories : identity, offer, price, location, audience, contact, other.",
  'Réponds par {"faits": [{"enonce": "...", "categorie": "...", "langue": "fr"}]} ; liste vide si la page n\'énonce rien.',
].join("\n");

const pageInput = (p: ParsedPage) => `URL : ${p.url}\nTitre : ${p.title ?? "(aucun)"}\n\n${p.text.slice(0, LLM_MAX_PAGE_CHARS)}`;

export interface LlmCostEstimate {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokensMax: number;
  usd: number;
  basis: string;
}

/** Coût estimé (majorant) de l'extraction par Mistral : 1 jeton pour 3 caractères en entrée, sortie au plafond. */
export function estimateLlmFacts(pages: ParsedPage[], model = LLM_FACTS_MODEL): LlmCostEstimate {
  const price = findPrice("mistral-api", model);
  if (!price) throw new Error(`coût illisible : modèle ${model} absent de la grille src/cost-grid.ts`);
  const inputTokens = pages.reduce((s, p) => s + Math.ceil((SYSTEM.length + pageInput(p).length) / 3), 0);
  const outputTokensMax = pages.length * LLM_MAX_OUTPUT_TOKENS;
  const usd = (inputTokens * price.inputPerMTok + outputTokensMax * price.outputPerMTok) / 1_000_000;
  return { model, calls: pages.length, inputTokens, outputTokensMax, usd: Math.round(usd * 1e6) / 1e6, basis: `grille ${price.id} (${price.inputPerMTok} $ / ${price.outputPerMTok} $ par M), sans recherche web` };
}

/** Extraction par le fournisseur (Mistral en production) : une page par appel, statut `extracted`. */
export async function extractFactsWithLlm(
  provider: LLMProvider,
  pages: ParsedPage[],
  sources: PageSource[],
  opts: { languages: string[]; model?: string },
): Promise<{ facts: Fact[]; calls: number; inputTokens: number; outputTokens: number }> {
  const facts: Fact[] = [];
  const seen = new Set<string>();
  let inputTokens = 0;
  let outputTokens = 0;
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i]!;
    const r = await provider.extract({ schema: LlmFactsSchema, schemaName: "faits", system: SYSTEM, input: pageInput(page), model: opts.model, purpose: LLM_FACTS_PURPOSE });
    inputTokens += r.run.inputTokens ?? 0;
    outputTokens += r.run.outputTokens ?? 0;
    for (const f of r.data.faits) {
      const key = f.enonce.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const language = f.langue && opts.languages.includes(f.langue) ? f.langue : page.lang && opts.languages.includes(page.lang) ? page.lang : opts.languages[0]!;
      facts.push({
        id: `m-${String(facts.length + 1).padStart(3, "0")}`,
        statement: f.enonce.trim(),
        language,
        category: f.categorie,
        sourceId: sources[i]!.id,
        status: "extracted",
        note: `extrait par ${r.run.provider} (${r.run.model}), ${page.url}`,
      });
    }
  }
  return { facts, calls: pages.length, inputTokens, outputTokens };
}

export function factsFile(facts: Fact[]): Facts {
  return { schemaVersion: 1, facts };
}
