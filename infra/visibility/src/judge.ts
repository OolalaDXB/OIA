/**
 * Juge des mentions d'une preuve (mandat v14, bloc D), branché sur collect-day.
 *
 * Chaîne, pour chaque réponse :
 *  1. toujours, une correspondance DÉTERMINISTE des noms, alias et domaines de la marque et
 *     des concurrents, en mot entier (règles d'Elmo, src/judge-jev.ts), avec le terme, sa
 *     position et le passage exact : c'est un fait (`structured.mentions.facts`) ;
 *  2. seules les réponses qui nomment au moins une entreprise suivie partent chez le juge ;
 *  3. le juge ne peut que RETIRER une mention et donner un sentiment et un passage ; son
 *     résultat est rangé comme « extrait (Jev 1.13) » (`structured.mentions.judge`), jamais
 *     comme fait ;
 *  4. `brandMentioned` et `competitorsMentioned` au premier niveau de `structured`, comme à J0 :
 *     nommé par la correspondance ET non retiré par le juge (sans juge : nommé).
 *
 * Trois options : `jev` (retenue par Mickaël le 16 novembre 2026), `mistral` (non retenue :
 * erreur explicite), `aucun`.
 */
import type { FetchLike, Sleep } from "./collector-oia/http.js";
import { realSleep } from "./collector-oia/http.js";
import { MissingKeyError } from "./collector-oia-direct.js";
import {
  cleanAnswer,
  firstTerm,
  JEV_JUDGE_VERSION,
  JEV_MAX_CALLS_PER_ANSWER,
  JEV_MODEL,
  jevJudge,
  matcher,
  MAX_ANSWER_CHARS,
  mentionOffsets,
  mentionsStamp,
  normalizeDomain,
  originalSpan,
  sentences,
  typesafeTransport,
  type JevCallRecord,
  type MentionConfig,
  type MentionSubject,
} from "./judge-jev.js";
import type { SubjectBundle } from "./schema.js";

export type JudgeName = "jev" | "mistral" | "aucun";
export const JUDGE_NAMES: JudgeName[] = ["jev", "mistral", "aucun"];

/**
 * Prix de Jev : aucun tarif publié dans le code d'Elmo ; sa documentation dit « très
 * grossièrement 0,15 à 0,35 $ par 1 000 réponses » (README.md:123). Majorant PROVISOIRE retenu :
 * 0,001 $ par appel (environ trois fois le haut de la fourchette), à corriger sur la première
 * facture TypeSafe.
 */
export const JEV_PRICE = {
  perCallUsd: 0.001,
  provisional: "tarif de Jev non publié : majorant de 0,001 $ par appel, à corriger sur la facture TypeSafe",
  source: "elmo v0.7.7, README.md:123 et packages/docs/content/docs/developer-guide/configuration.mdx:92-102",
} as const;

/** Fait de la correspondance déterministe, pour une entreprise suivie que la réponse nomme. */
export interface MatchFact {
  name: string;
  /** Terme trouvé (nom, alias ou domaine) et sa forme exacte dans le texte. */
  term: string;
  matched: string;
  /** Position de la première mention dans `rawText`, et nombre de mentions. */
  firstMention: number;
  mentionCount: number;
  /** Phrase qui contient la première mention : positions dans `rawText` et texte exact. */
  passage: { start: number; end: number; text: string } | null;
}

export interface JudgeOutcome {
  brandMentioned: boolean | null;
  competitorsMentioned: string[] | null;
  /** Rangé dans `structured.mentions`. */
  mentions: Record<string, unknown>;
  /** Coût du juge pour cette réponse (USD). */
  costUsd: number;
  calls: number;
}

export interface MentionJudge {
  name: JudgeName;
  judgeVersion: string | null;
  /** Majorant du juge pour une réponse, compté dans le garde-fou. */
  worstCaseUsdPerAnswer: number;
  judge(input: { text: string; question: string; config: MentionConfig }): Promise<JudgeOutcome>;
}

/**
 * Marque et concurrents suivis, lus dans le sujet (jamais en dur), dans la forme qu'avait
 * Elmo : domaines de la marque = site principal tel qu'écrit (Elmo : `brands.website`, une URL
 * complète, reprise telle quelle dans la question posée à Jev), puis les domaines nus des sites
 * additionnels et des alias de type domaine (Elmo : `additional_domains`) ; alias = les autres
 * alias non rejetés. Concurrents non rejetés, dans l'ordre de subject.yaml (clés c0, c1…).
 */
export function mentionConfigFrom(b: SubjectBundle): MentionConfig {
  const s = b.subject;
  const live = s.aliases.filter((a) => a.status !== "rejected");
  const extra = [...s.urls.additional.filter((u) => u.status !== "rejected").map((u) => normalizeDomain(u.url)), ...live.filter((a) => a.kind === "domain").map((a) => a.value)];
  return {
    brand: { name: s.displayName, aliases: live.filter((a) => a.kind !== "domain").map((a) => a.value), domains: [s.urls.primary, ...new Set(extra.filter((d) => d !== normalizeDomain(s.urls.primary)))] },
    competitors: s.competitors.filter((c) => c.status !== "rejected").map((c) => ({ name: c.name, aliases: c.aliases, domains: c.domains })),
  };
}

/** Correspondance déterministe : les entreprises que la réponse nomme, avec le passage exact. */
export function matchFacts(text: string, config: MentionConfig): { brand: MatchFact | null; competitors: MatchFact[] } {
  const cleaned = cleanAnswer(text);
  const readable = cleaned.text.slice(0, MAX_ANSWER_CHARS);
  const split = sentences(readable);
  const fact = (subject: MentionSubject): MatchFact | null => {
    // Même règle de sélection qu'Elmo : nommé dans le texte nettoyé que lit le juge.
    if (!matcher(subject)(readable)) return null;
    const offsets = mentionOffsets(text, subject);
    const hit = firstTerm(subject, text);
    const names = matcher(subject);
    const sentence = split.find((x) => names(x.text));
    const span = sentence ? originalSpan(cleaned, sentence.start, sentence.end) : null;
    return {
      name: subject.name,
      term: hit?.term ?? subject.name,
      matched: hit?.matched ?? "",
      firstMention: offsets[0] ?? hit?.index ?? -1,
      mentionCount: offsets.length,
      passage: span ? { ...span, text: text.slice(span.start, span.end) } : null,
    };
  };
  return { brand: fact(config.brand), competitors: config.competitors.map(fact).filter((f): f is MatchFact => f !== null) };
}

function factsOnly(text: string, config: MentionConfig) {
  const facts = matchFacts(text, config);
  return { facts, named: { brand: facts.brand !== null, competitors: facts.competitors.map((c) => c.name) } };
}

export function noJudge(): MentionJudge {
  return {
    name: "aucun",
    judgeVersion: null,
    worstCaseUsdPerAnswer: 0,
    async judge({ text, config }) {
      const { facts, named } = factsOnly(text, config);
      return {
        brandMentioned: named.brand,
        competitorsMentioned: named.competitors,
        mentions: { source: "correspondance", facts, judge: null },
        costUsd: 0,
        calls: 0,
      };
    },
  };
}

export function jevMentionJudge(opts: { apiKey: string; fetch: FetchLike; sleep?: Sleep }): MentionJudge {
  return {
    name: "jev",
    judgeVersion: JEV_JUDGE_VERSION,
    worstCaseUsdPerAnswer: judgeWorstCaseUsd("jev"),
    async judge({ text, question, config }) {
      const { facts, named } = factsOnly(text, config);
      const base = { source: "correspondance+jev", facts, stamp: mentionsStamp(config, JEV_JUDGE_VERSION) };
      // Aucune entreprise suivie nommée : rien n'est envoyé à Jev.
      if (!named.brand && named.competitors.length === 0) {
        return { brandMentioned: false, competitorsMentioned: [], mentions: { ...base, judge: { status: "non-envoye", reason: "aucune entreprise suivie nommée" } }, costUsd: 0, calls: 0 };
      }
      const calls: JevCallRecord[] = [];
      const transport = typesafeTransport({ apiKey: opts.apiKey, fetch: opts.fetch, sleep: opts.sleep ?? realSleep, onCall: (c) => calls.push(c) });
      const costOf = () => Math.round(calls.length * JEV_PRICE.perCallUsd * 1e6) / 1e6;
      try {
        const j = await jevJudge(transport, text, config, question);
        // Jev ne peut que retirer : une mention qu'il confirme doit d'abord avoir été nommée.
        const brandMentioned = named.brand && j.brandMentioned;
        const competitorsMentioned = j.competitorsMentioned.filter((n) => named.competitors.includes(n));
        return {
          brandMentioned,
          competitorsMentioned,
          mentions: {
            ...base,
            judge: {
              status: "juge",
              kind: "extrait (Jev 1.13)",
              model: JEV_MODEL,
              judgeVersion: JEV_JUDGE_VERSION,
              asked: j.asked,
              assessments: j.assessments,
              removed: {
                brand: named.brand && !brandMentioned,
                competitors: named.competitors.filter((n) => !competitorsMentioned.includes(n)),
              },
              usage: calls,
              cost: { usd: costOf(), perCallUsd: JEV_PRICE.perCallUsd, provisional: JEV_PRICE.provisional },
            },
          },
          costUsd: costOf(),
          calls: calls.length,
        };
      } catch (err) {
        // Un échec du juge n'efface pas la réponse payée : présence non tranchée (null), faits gardés.
        // Un appel en échec a pu être facturé : compté au prix d'un appel.
        const usd = Math.round((calls.length + 1) * JEV_PRICE.perCallUsd * 1e6) / 1e6;
        return {
          brandMentioned: null,
          competitorsMentioned: null,
          mentions: {
            ...base,
            judge: { status: "echec", kind: "extrait (Jev 1.13)", error: err instanceof Error ? err.message : String(err), usage: calls, cost: { usd, perCallUsd: JEV_PRICE.perCallUsd, provisional: JEV_PRICE.provisional } },
          },
          costUsd: usd,
          calls: calls.length + 1,
        };
      }
    },
  };
}

/** Majorant du juge pour une réponse, sans le créer (estimation sans clé). */
export function judgeWorstCaseUsd(name: JudgeName): number {
  return name === "jev" ? JEV_MAX_CALLS_PER_ANSWER * JEV_PRICE.perCallUsd : 0;
}

/** Juge choisi. `jev` sans TYPESAFE_API_KEY : refus ; `mistral` : non retenu. */
export function createJudge(name: string, opts: { fetch: FetchLike; env: Record<string, string | undefined>; sleep?: Sleep }): MentionJudge {
  switch (name) {
    case "jev": {
      const apiKey = opts.env.TYPESAFE_API_KEY?.trim();
      if (!apiKey) throw new MissingKeyError("juge jev : clé absente de l'environnement : TYPESAFE_API_KEY");
      if (apiKey === "stub") throw new Error("juge jev : TYPESAFE_API_KEY=stub (juge local par mots-clés d'Elmo) refusé : ce n'est pas Jev");
      return jevMentionJudge({ apiKey, fetch: opts.fetch, sleep: opts.sleep });
    }
    case "mistral":
      throw new Error("juge mistral : non retenu (décision de Mickaël du 16 novembre 2026, juge D1 = Jev) ; non implémenté");
    case "aucun":
      return noJudge();
    default:
      throw new Error(`juge inconnu "${name}" : ${JUDGE_NAMES.join(", ")}`);
  }
}
