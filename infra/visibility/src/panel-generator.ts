import type { VisibilityLLM } from "./llm";
import type { Panel, Prompt, PromptIntent, Subject } from "./schema";
import { PanelSchema } from "./schema";

/**
 * Deterministic panel proposer. Produces a `status: draft` panel for a subject,
 * based on hand-written templates per intent × language. The caller later
 * reviews, tweaks and runs the (protected) `validate` command.
 *
 * Why deterministic : every B1 rule must be reproducible without an LLM. A
 * `VisibilityLLM` is only used, if the caller opts in, to reformulate the raw
 * template into a more natural phrasing — and the generator replays the raw
 * template when no LLM is passed. The tests of B2 run entirely without an LLM.
 */

export interface GeneratorMix {
  /** Number of prompts to emit per language, by intent. */
  decouverte: number;
  prix_offre: number;
  comparaison: number;
  niche_local: number;
  marquee: number;
}

export const DEFAULT_MIX: GeneratorMix = {
  decouverte: 3,
  prix_offre: 2,
  comparaison: 1,
  niche_local: 2,
  marquee: 2,
};

export interface GeneratePanelOptions {
  /** Mix per language. Defaults to DEFAULT_MIX (10 per language). */
  mix?: Partial<GeneratorMix>;
  /** Optional reformulator. When present, each raw template is passed through it. */
  llm?: VisibilityLLM;
  /** Starting panelVersion for the new draft. Defaults to 1. */
  panelVersion?: number;
  /** Date (ISO YYYY-MM-DD) stamped on every emitted prompt. */
  today: string;
  /** Deterministic source id to attach when origin requires one. Optional. */
  sourceId?: string;
}

/** Raw template stock, per intent × language. Short, boring, replaceable. */
const TEMPLATES: Record<PromptIntent, Record<string, string[]>> = {
  decouverte: {
    en: [
      "What are the best options for {offer} in {market}?",
      "Which providers offer {offer} aimed at people in {market}?",
      "Who should I look at for {offer} if I live in {market}?",
    ],
    fr: [
      "Quelles sont les meilleures options pour {offer} à {market} ?",
      "Quels prestataires proposent {offer} pour les habitants de {market} ?",
      "À qui m'adresser pour {offer} si je suis à {market} ?",
    ],
  },
  prix_offre: {
    en: [
      "How much does {offer} typically cost in {market}?",
      "What is included in {offer} for clients in {market}?",
    ],
    fr: [
      "Combien coûte {offer} à {market} ?",
      "Qu'est-ce qui est inclus dans {offer} pour une personne à {market} ?",
    ],
  },
  comparaison: {
    en: ["How do providers of {offer} compare in {market}?"],
    fr: ["Comment comparer les offres de {offer} à {market} ?"],
  },
  niche_local: {
    en: [
      "Who runs {offer} in {market} specifically?",
      "Is there a local option for {offer} in {market}?",
    ],
    fr: [
      "Qui propose {offer} spécifiquement à {market} ?",
      "Y a-t-il une option locale pour {offer} à {market} ?",
    ],
  },
  marquee: {
    en: [
      "What does {brand} offer for {offer}?",
      "Is {brand} a good choice for {offer}?",
    ],
    fr: [
      "Que propose {brand} pour {offer} ?",
      "{brand} est-il un bon choix pour {offer} ?",
    ],
  },
};

function primaryMarketOf(subject: Subject, language: string): { country: string; label: string } {
  const market = subject.markets.find((m) => m.languages.includes(language)) ?? subject.markets[0]!;
  return { country: market.country, label: market.label };
}

function offersOf(subject: Subject): string[] {
  // The subject schema does not carry a structured "offers" list yet (C1 will
  // add it). Until then, derive from aliases of kind "offer", then fall back
  // to a single generic placeholder. The caller may override by injecting
  // the offers through `subject.sources` or future `offers` column.
  const offers = subject.aliases
    .filter((a) => a.kind === "offer" && a.status !== "rejected")
    .map((a) => a.value);
  return offers.length ? offers : ["the service"];
}

function brandOf(subject: Subject): string {
  return subject.displayName;
}

function fillTemplate(
  template: string,
  args: { brand: string; offer: string; market: string },
): string {
  return template
    .replaceAll("{brand}", args.brand)
    .replaceAll("{offer}", args.offer)
    .replaceAll("{market}", args.market);
}

async function maybeReformulate(
  llm: VisibilityLLM | undefined,
  text: string,
  system: string,
): Promise<string> {
  if (!llm) return text;
  const out = await llm.reformulate({ purpose: "panel.reformulate", system, input: text });
  return out.data.text.trim() || text;
}

export async function proposePanel(
  subject: Subject,
  opts: GeneratePanelOptions,
): Promise<Panel> {
  const mix: GeneratorMix = { ...DEFAULT_MIX, ...(opts.mix ?? {}) };
  const panelVersion = opts.panelVersion ?? 1;
  const brand = brandOf(subject);
  const offers = offersOf(subject);
  const prompts: Prompt[] = [];
  let counter = 0;

  for (const language of subject.languages) {
    const { country, label } = primaryMarketOf(subject, language);
    const nextId = () => {
      counter += 1;
      return `${language}-${String(counter).padStart(2, "0")}`;
    };

    for (const intent of Object.keys(mix) as PromptIntent[]) {
      const n = mix[intent];
      const templates = TEMPLATES[intent]?.[language] ?? [];
      if (templates.length === 0 && n > 0) {
        throw new Error(`No template for intent "${intent}" in language "${language}"`);
      }
      for (let i = 0; i < n; i += 1) {
        const template = templates[i % templates.length]!;
        const offer = offers[i % offers.length]!;
        let text = fillTemplate(template, { brand, offer, market: label });
        text = await maybeReformulate(opts.llm, text, `Reformulate for intent ${intent} (${language})`);
        const family: Prompt["family"] = intent === "marquee" ? "branded" : "unbranded";
        prompts.push({
          id: nextId(),
          version: 1,
          family,
          intent,
          targetOffer: offer,
          language,
          markets: [country],
          text,
          origin: "generator",
          sourceId: opts.sourceId,
          status: "proposed",
          createdAt: opts.today,
        });
      }
    }
  }

  const panel: Panel = PanelSchema.parse({
    schemaVersion: 1,
    panelVersion,
    status: "draft",
    limits: {
      maxPerLanguage: Math.max(10, Object.values(mix).reduce((a, b) => a + b, 0)),
      minBrandedPerLanguage: Math.max(1, Math.min(mix.marquee, 2)),
    },
    prompts,
  });
  return panel;
}

/** Textual diff of two panels, prompt by prompt, used by `panel diff`. */
export function diffPanels(a: Panel, b: Panel): string[] {
  const out: string[] = [];
  const index = (p: Panel) => new Map(p.prompts.map((pr) => [pr.id + "@" + pr.version, pr] as const));
  const ia = index(a);
  const ib = index(b);
  for (const [k, pa] of ia) {
    const pb = ib.get(k);
    if (!pb) {
      out.push(`- ${k} : ${pa.text}`);
      continue;
    }
    if (pa.text !== pb.text) {
      out.push(`~ ${k} : "${pa.text}" → "${pb.text}"`);
    }
    if (pa.family !== pb.family) out.push(`~ ${k} : family ${pa.family} → ${pb.family}`);
    if (pa.intent !== pb.intent) out.push(`~ ${k} : intent ${pa.intent ?? "-"} → ${pb.intent ?? "-"}`);
  }
  for (const [k, pb] of ib) {
    if (!ia.has(k)) out.push(`+ ${k} : ${pb.text}`);
  }
  return out;
}

/**
 * Validation guard (rule 16). A validation is a human action: only a human
 * identity listed in `humans.yaml` can perform it, and no agent executor ever
 * runs with that identity. This guard is both for the CLI and for the test
 * suite that proves an agent cannot slip through.
 */
export interface HumanIdentity {
  id: string;
  email: string;
  role: "owner" | "member";
}

export function resolveHumanValidator(
  availableHumans: HumanIdentity[],
  env: { OIA_SEO_HUMAN_IDENTITY?: string; OIA_SEO_IS_AGENT?: string },
): HumanIdentity {
  if (env.OIA_SEO_IS_AGENT === "1" || env.OIA_SEO_IS_AGENT === "true") {
    throw new Error("validation refused: current executor is an agent (OIA_SEO_IS_AGENT=1)");
  }
  const id = env.OIA_SEO_HUMAN_IDENTITY;
  if (!id) {
    throw new Error("validation refused: OIA_SEO_HUMAN_IDENTITY is not set (expected a human identity from humans.yaml)");
  }
  const human = availableHumans.find((h) => h.id === id);
  if (!human) {
    throw new Error(`validation refused: identity "${id}" not found in humans.yaml`);
  }
  if (human.role !== "owner" && human.role !== "member") {
    throw new Error(`validation refused: identity "${id}" has unknown role "${human.role}"`);
  }
  // Only owner can validate a panel; member can author but not validate.
  if (human.role !== "owner") {
    throw new Error(`validation refused: identity "${id}" does not have the "owner" role`);
  }
  return human;
}
