/**
 * Fichiers d'un nouveau sujet (mandat v15, bloc A, étapes 2 et 6) :
 *
 *  - à la racine, ce que load.ts lit : subject.yaml (`draft`), un panel.yaml d'attente (aucune
 *    question active), un facts.yaml vide et un measurement.yaml dont la fenêtre j0 est
 *    `planned`. Rien de tout cela ne déclenche une mesure ;
 *  - sous `proposition/`, ce qui attend une validation : le panel proposé (panel-generator.ts,
 *    10 questions par langue dont 2 marquées, statut `proposed`), les faits extraits, etc.
 *
 * Marchés : `--marches` (codes pays), libellés par Intl.DisplayNames dans la langue du marché,
 * ou la ville trouvée dans les données structurées du site pour ce pays.
 */
import { proposePanel } from "../panel-generator.js";
import { MeasurementSchema, PanelSchema, SubjectSchema, type Measurement, type Panel, type Prompt, type Subject } from "../schema.js";
import type { Offer, PageSource, Place, SiteFindings } from "./facts.js";

/** Cibles par défaut d'une première mesure (moteur:fournisseur:modèle:online), prix dans src/cost-grid.ts. */
export const DEFAULT_TARGETS: { engine: string; target: string; languages?: string[]; note: string }[] = [
  { engine: "chatgpt", target: "chatgpt:openai-api:gpt-6-luna:online", note: "OpenAI en direct (:online, outil web_search)" },
  { engine: "claude", target: "claude:anthropic-api:claude-sonnet-5-5:online", note: "Anthropic en direct (:online, outil web_search)" },
  { engine: "gemini", target: "gemini:openrouter:google/gemini-3-flash-preview:online", note: "via OpenRouter (recherche Google native)" },
  { engine: "perplexity", target: "perplexity:openrouter:perplexity/sonar:online", note: "via OpenRouter (Sonar)" },
  { engine: "grok", target: "grok:openrouter:x-ai/grok-4.7:online", note: "via OpenRouter (recherche web d'OpenRouter) ; ajouté le 2026-11-16, prix provisoire" },
  { engine: "mistral", target: "mistral:mistral-api:mistral-large-4:online", languages: ["fr"], note: "Mistral en direct (:online), panels en français seulement" },
];

/** Langues usuelles d'un marché, pour répartir les langues demandées entre les marchés. */
const MARKET_LANGUAGES: Record<string, string[]> = {
  FR: ["fr"], BE: ["fr", "nl"], CH: ["fr", "de", "it"], LU: ["fr", "de"], MC: ["fr"], MA: ["fr", "ar"], TN: ["fr", "ar"], SN: ["fr"], CI: ["fr"],
  CA: ["en", "fr"], GB: ["en"], IE: ["en"], US: ["en"], AU: ["en"], NZ: ["en"], ZA: ["en"], ZW: ["en"], IN: ["en"], SG: ["en"],
  AE: ["en", "ar"], SA: ["ar", "en"], QA: ["ar", "en"], DE: ["de"], ES: ["es"], IT: ["it"], PT: ["pt"], NL: ["nl"],
};

function regionLabel(country: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: "region" }).of(country) ?? country;
  } catch {
    return country;
  }
}

export function buildMarkets(countries: string[], languages: string[], places: Place[]): Subject["markets"] {
  const markets = countries.map((country) => {
    const usual = MARKET_LANGUAGES[country] ?? [];
    const langs = languages.filter((l) => usual.includes(l));
    return { country, languages: langs.length ? langs : [...languages] };
  });
  // Toute langue demandée a au moins un marché.
  for (const l of languages) if (!markets.some((m) => m.languages.includes(l))) markets[0]!.languages.push(l);
  return markets.map((m) => {
    const city = places.find((p) => p.country === m.country)?.locality;
    return { country: m.country, label: city ?? regionLabel(m.country, m.languages[0]!), languages: m.languages, status: "proposed" as const };
  });
}

/** Termes de marque : une offre qui en contient un ferait d'une question non marquée une question marquée. */
const containsAny = (text: string, terms: string[]) => terms.some((t) => t.length >= 2 && text.toLowerCase().includes(t.toLowerCase()));

export function offersFor(language: string, findings: SiteFindings, brandTerms: string[], fallback: string[]): string[] {
  const usable = (o: Offer) => !containsAny(o.name, brandTerms) && o.name.length >= 3 && o.name.length <= 80;
  const inLanguage = findings.offers.filter((o) => o.language === language && usable(o));
  const any = findings.offers.filter(usable);
  const picked = (inLanguage.length ? inLanguage : any).map((o) => o.name);
  const fromFallback = fallback.filter((f) => !containsAny(f, brandTerms));
  return [...new Set((picked.length ? picked : fromFallback).map(midSentence))].slice(0, 3);
}

/** Une offre s'insère au milieu d'une phrase : « Coaching individuel » → « coaching individuel » (sigles gardés). */
const midSentence = (s: string) => (/^\p{Lu}\p{Ll}/u.test(s) ? s[0]!.toLowerCase() + s.slice(1) : s);

export interface DraftInput {
  subjectId: string;
  displayName: string;
  primaryUrl: string;
  domain: string;
  languages: string[];
  countries: string[];
  findings: SiteFindings;
  sources: PageSource[];
  /** Offres de repli quand les données structurées n'en donnent aucune (h1, début du titre). */
  fallbackOffers: string[];
  today: string;
}

export interface Draft {
  subject: Subject;
  /** panel.yaml de la racine : aucune question active tant que rien n'est validé. */
  waitingPanel: Panel;
  facts: { schemaVersion: 1; facts: [] };
  measurement: Measurement;
  /** proposition/panel.yaml. */
  proposedPanel: Panel;
  offersByLanguage: Record<string, string[]>;
}

export async function buildDraft(i: DraftInput): Promise<Draft> {
  const markets = buildMarkets(i.countries, i.languages, i.findings.places);
  const openQuestions: string[] = [];
  const aliases: Subject["aliases"] = [
    { value: i.displayName, kind: "name", status: "proposed" },
    { value: i.domain, kind: "domain", status: "proposed" },
  ];
  const subject = SubjectSchema.parse({
    schemaVersion: 1,
    id: i.subjectId,
    displayName: i.displayName,
    status: "draft",
    ownership: "external",
    urls: { primary: i.primaryUrl, additional: [] },
    languages: i.languages,
    clientLanguage: i.languages[0],
    markets,
    aliases,
    competitors: [],
    sources: i.sources,
    openQuestions,
  });

  const brandTerms = [i.displayName, i.domain];
  const offersByLanguage: Record<string, string[]> = {};
  const prompts: Prompt[] = [];
  for (const language of i.languages) {
    const offers = offersFor(language, i.findings, brandTerms, i.fallbackOffers);
    const others = [...new Set(i.findings.offers.map((o) => o.language))].filter((l) => l !== language);
    if (!offers.length) openQuestions.push(`${language} : aucune offre lisible sur le site, panel à reprendre à la main`);
    else if (!i.findings.offers.length) openQuestions.push(`${language} : offres tirées du titre ou du h1 (aucune offre dans les données structurées)`);
    else if (!i.findings.offers.some((o) => o.language === language)) openQuestions.push(`${language} : aucune offre en ${language} sur le site, offres reprises d'une autre langue (${others.join(", ")})`);
    offersByLanguage[language] = offers;
    const forGenerator: Subject = {
      ...subject,
      languages: [language],
      aliases: [...aliases, ...(offers.length ? offers : [language === "fr" ? "ce service" : "this service"]).map((value) => ({ value, kind: "offer" as const, status: "proposed" as const }))],
    };
    const panel = await proposePanel(forGenerator, { today: i.today });
    prompts.push(...panel.prompts);
  }
  const proposedPanel = PanelSchema.parse({ schemaVersion: 1, panelVersion: 1, status: "draft", limits: { maxPerLanguage: 10, minBrandedPerLanguage: 2 }, prompts });

  const marketOf = (l: string) => markets.find((m) => m.languages.includes(l))!.country;
  const waitingPanel = PanelSchema.parse({
    schemaVersion: 1,
    panelVersion: 1,
    status: "draft",
    limits: { maxPerLanguage: 10, minBrandedPerLanguage: 0 },
    prompts: i.languages.map((l) => ({
      id: `${l}-attente`,
      version: 1,
      family: "unbranded",
      language: l,
      markets: [marketOf(l)],
      text: "Panel en attente de validation (proposition/panel.yaml).",
      origin: "generator",
      status: "candidate",
      note: "Gabarit d'attente : aucune question active avant la validation du panel proposé.",
      createdAt: i.today,
    })),
  });

  const engines = DEFAULT_TARGETS.map((t) => ({ ...t, languages: t.languages?.filter((l) => i.languages.includes(l)) })).filter((t) => !t.languages || t.languages.length > 0);
  const measurement = MeasurementSchema.parse({
    schemaVersion: 1,
    engines: engines.map((e) => ({ model: e.engine, collection: "api", webSearch: true, ...(e.languages ? { languages: e.languages } : {}), note: e.note })),
    windows: [
      {
        id: "j0",
        kind: "baseline",
        days: 5,
        panelVersion: 1,
        status: "planned",
        targets: engines.map((e) => e.target),
        note: `Proposée à l'ajout du site le ${i.today} : ne démarre qu'après validation du panel et des concurrents, et un GO.`,
      },
    ],
    freezes: [],
  });

  return { subject: SubjectSchema.parse({ ...subject, openQuestions }), waitingPanel, facts: { schemaVersion: 1, facts: [] }, measurement, proposedPanel, offersByLanguage };
}
