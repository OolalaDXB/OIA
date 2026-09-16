import { KIND_PROFILES, normalizeKind } from "@oia/ingestion/opportunity-kinds";

/**
 * Plain language, in two languages.
 *
 * The console had grown a vocabulary you had to already know: INVESTIGATE,
 * MANUAL_REVIEW_REQUIRED, PURSUE-eligible, gate, provenance, aggregator-only.
 * Every one of those is precise, and precision is the point of this product —
 * but precision in the DATA does not require jargon in the INTERFACE.
 *
 * It was also all in English, for an operator who works in French. Owning a
 * tool you cannot read is the same as not having it, so every word a human sees
 * now exists in both, and French is the default.
 *
 * The underlying values are untouched. "Pas encore vérifié" is not softer than
 * MANUAL_REVIEW_REQUIRED — it is the same claim in words nobody needs a manual
 * for.
 */

export const LANGS = ["fr", "en"] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = "fr";

/** A phrase in both languages. `t()` picks one. */
export interface Phrase {
  fr: string;
  en: string;
}

export function t(phrase: Phrase | undefined, lang: Lang): string {
  return phrase ? phrase[lang] : "";
}

interface Term {
  label: Phrase;
  meaning: Phrase;
}

export const RECOMMENDATION: Record<string, Term> = {
  PURSUE: {
    label: { fr: "Y aller", en: "Go after it" },
    meaning: { fr: "Tout est vérifié et un humain a approuvé.", en: "Everything checks out and a human approved it." },
  },
  PARTNER: {
    label: { fr: "Nécessite un partenaire", en: "Needs a partner" },
    meaning: { fr: "Intéressant, mais pas seul.", en: "Worth doing, but not alone." },
  },
  INVESTIGATE: {
    label: { fr: "À regarder", en: "Needs a look" },
    meaning: {
      fr: "Il manque quelque chose avant de pouvoir décider.",
      en: "Something is missing before this can be decided.",
    },
  },
  MONITOR: {
    label: { fr: "À surveiller", en: "Keep an eye on it" },
    meaning: { fr: "Rien à faire aujourd'hui.", en: "Nothing to do today." },
  },
  REJECT: {
    label: { fr: "Pas pour nous", en: "Not for us" },
    meaning: { fr: "Écarté.", en: "Ruled out." },
  },
};

export const VERIFICATION: Record<string, Term> = {
  VERIFIED: {
    label: { fr: "Vérifié", en: "Verified" },
    meaning: {
      fr: "Un humain a confirmé que la source est bien ce qu'elle prétend être.",
      en: "A human confirmed the source is what it claims to be.",
    },
  },
  MANUAL_REVIEW_REQUIRED: {
    label: { fr: "Pas encore vérifié", en: "Not verified yet" },
    meaning: {
      fr: "La machine est allée aussi loin qu'elle le peut honnêtement. À toi de confirmer la source.",
      en: "The machine went as far as it honestly can. A human has to confirm the source.",
    },
  },
  OFFICIAL_SOURCE_FOUND: {
    label: { fr: "Page officielle trouvée", en: "Official page found" },
    meaning: { fr: "La vraie page a été localisée, pas encore confirmée.", en: "The real page was located but not yet confirmed." },
  },
  DISCOVERED_UNVERIFIED: {
    label: { fr: "Simple piste", en: "Just a lead" },
    meaning: { fr: "Vu quelque part, rien de vérifié.", en: "Seen somewhere, nothing checked." },
  },
  VERIFICATION_FAILED: {
    label: { fr: "Ne correspond pas", en: "Does not check out" },
    meaning: { fr: "La page ne correspond pas à ce qu'elle annonce.", en: "The page does not match what it claims." },
  },
  SOURCE_UNAVAILABLE: {
    label: { fr: "Page injoignable", en: "Page unreachable" },
    meaning: { fr: "La source n'a pas pu être récupérée.", en: "The source could not be retrieved." },
  },
  REJECTED: {
    label: { fr: "Rejeté", en: "Rejected" },
    meaning: { fr: "Écarté à la vérification.", en: "Ruled out at verification." },
  },
};

export const REVIEW: Record<string, Phrase> = {
  PENDING: { fr: "Non trié", en: "Not triaged" },
  APPROVE: { fr: "Tu l'as approuvé", en: "You approved it" },
  REJECT: { fr: "Tu l'as rejeté", en: "You rejected it" },
  NEEDS_VERIFICATION: { fr: "Tu as demandé des vérifications", en: "You asked for checks" },
  COMMENT: { fr: "Tu as commenté", en: "You commented" },
};

export const FRESHNESS: Record<string, Phrase> = {
  FRESH: { fr: "Ouvert", en: "Open" },
  CLOSING_SOON: { fr: "Bientôt clos", en: "Closing soon" },
  EXPIRED: { fr: "Clos", en: "Closed" },
  NO_DEADLINE: { fr: "Sans date de clôture", en: "No closing date" },
};

/** The nine hard conditions, as questions rather than field names. */
export const GATE_CONDITION: Record<string, Phrase> = {
  accessiblePrimarySource: { fr: "On a la source elle-même", en: "We have the actual source" },
  verifiedSource: { fr: "Un humain a confirmé la source", en: "A human confirmed the source" },
  verifiedDeadline: { fr: "La date de clôture est confirmée", en: "The closing date is confirmed" },
  notExpired: { fr: "Ce n'est pas clos", en: "It has not closed" },
  eligibilityAssessed: { fr: "Quelqu'un a jugé si on peut candidater", en: "Someone judged whether we can apply" },
  notAggregatorOnly: { fr: "Ce n'est pas qu'une fiche d'agrégateur", en: "It is not just a listing on an aggregator" },
  notClosedCall: { fr: "L'appel est toujours ouvert", en: "The call is still open" },
  hasExactNextAction: { fr: "Il y a une action suivante précise", en: "There is a specific next step" },
  sufficientConfidence: { fr: "L'information est assez solide pour agir", en: "The information is good enough to act on" },
};

export const GATE_FAILURE: Record<string, Phrase> = {
  "no accessible primary source": { fr: "on n'a pas la source elle-même", en: "we do not have the source itself" },
  "source not human-VERIFIED": { fr: "personne n'a encore confirmé la source", en: "nobody has confirmed the source yet" },
  "no verified, non-conflicting, unexpired deadline": {
    fr: "la date de clôture est non confirmée ou contradictoire",
    en: "the closing date is unconfirmed or contradictory",
  },
  "opportunity is expired": { fr: "c'est clos", en: "it has closed" },
  "application eligibility is UNKNOWN": {
    fr: "personne n'a jugé si on peut candidater",
    en: "nobody has judged whether we can apply",
  },
  "aggregator-only lead cannot be pursued": {
    fr: "on n'a qu'une fiche d'agrégateur, pas le vrai appel",
    en: "we only have an aggregator listing, not the real call",
  },
  "call is closed": { fr: "l'appel est clos", en: "the call is closed" },
  "no exact next action": { fr: "aucune action suivante précise n'est écrite", en: "there is no specific next step written down" },
  "read by a model, not verified by a human": {
    fr: "lu par un modèle, pas vérifié par un humain",
    en: "read by a model, not verified by a human",
  },
  "eligibility not assessed against any project": {
    fr: "l'éligibilité n'a été évaluée pour aucun projet",
    en: "eligibility not assessed against any project",
  },
  "a model judged eligibility — you have not confirmed it": {
    fr: "un modèle a jugé l'éligibilité — tu ne l'as pas confirmée",
    en: "a model judged eligibility — you have not confirmed it",
  },
  "eligibility not assessed": {
    fr: "l'éligibilité n'a pas été évaluée",
    en: "eligibility not assessed",
  },
  "not a call": { fr: "ce n'est pas un appel", en: "not a call" },
  "this is the portal's listing page, not the call's own page": {
    fr: "c'est la page de liste du portail, pas la page de l'appel",
    en: "this is the portal's listing page, not the call's own page",
  },
};

/** Turn a gate failure into something a person can act on. */
export function plainFailure(reason: string, lang: Lang): string {
  const known = GATE_FAILURE[reason];
  if (known) return known[lang];
  const confidence = reason.match(/^info confidence (\d+) < floor (\d+)$/);
  if (confidence) {
    return lang === "fr"
      ? `l'information est trop mince pour agir (${confidence[1]} sur les ${confidence[2]} requis)`
      : `the information is too thin to act on (${confidence[1]} out of the ${confidence[2]} needed)`;
  }
  return reason;
}

export function recommendationLabel(value: string, lang: Lang): string {
  return RECOMMENDATION[value] ? RECOMMENDATION[value]!.label[lang] : value;
}

export function verificationLabel(value: string, lang: Lang): string {
  return VERIFICATION[value] ? VERIFICATION[value]!.label[lang] : value;
}

export function reviewLabel(value: string, lang: Lang): string {
  return REVIEW[value] ? REVIEW[value]![lang] : value;
}

export function freshnessLabel(value: string, lang: Lang): string {
  return FRESHNESS[value] ? FRESHNESS[value]![lang] : value;
}

export function gateConditionLabel(value: string, lang: Lang): string {
  return GATE_CONDITION[value] ? GATE_CONDITION[value]![lang] : value;
}

/**
 * The eleven kinds. Their English labels live in @oia/ingestion because the
 * pipeline uses them too; only the French is added here, next to the rest of
 * what a human reads.
 */
const KIND_FR: Record<string, Phrase> = {
  TENDER: { fr: "Appel d'offres", en: "Tender" },
  PRE_SOLICITATION: { fr: "Avis amont (RFI, préinformation)", en: "Pre-solicitation" },
  GRANT: { fr: "Subvention", en: "Grant" },
  TAX_INCENTIVE: { fr: "Dispositif fiscal", en: "Tax incentive" },
  EQUITY: { fr: "Levée de fonds", en: "Equity" },
  DEBT_GUARANTEE: { fr: "Prêt ou garantie", en: "Loan or guarantee" },
  PRIZE: { fr: "Prix ou concours", en: "Prize" },
  CONSORTIUM_CALL: { fr: "Appel à partenaires", en: "Consortium call" },
  MARKETPLACE_PROJECT: { fr: "Mission sur plateforme", en: "Marketplace project" },
  ACQUISITION: { fr: "Acquisition", en: "Acquisition" },
  REGULATORY: { fr: "Réglementaire", en: "Regulatory" },
};

const KIND_MEANING_FR: Record<string, string> = {
  TENDER: "Un marché public sur lequel soumissionner, avec une date de remise.",
  PRE_SOLICITATION: "Un avis amont : le cahier des charges n'est pas encore figé, on peut encore l'influencer.",
  GRANT: "De l'argent qui ne se rembourse pas, attribué sur appel avec une date de clôture.",
  TAX_INCENTIVE: "Un statut fiscal, pas un appel : aucune date limite, mais des critères d'assiette.",
  EQUITY: "Investissement contre des parts : fonds, business angels, accélérateurs. Pas de date côté émetteur.",
  DEBT_GUARANTEE: "Prêt ou garantie — à rembourser, pas une subvention.",
  PRIZE: "Concours ou prix, avec une date de dépôt.",
  CONSORTIUM_CALL: "Recherche de partenaires pour monter un dossier à plusieurs.",
  MARKETPLACE_PROJECT: "Une mission publiée sur une plateforme, pas un marché public.",
  ACQUISITION: "Une société ou un module à racheter — l'argent sort, il ne rentre pas.",
  REGULATORY: "À surveiller seulement : jamais quelque chose à poursuivre.",
};

export function kindLabel(value: string | undefined, lang: Lang): string {
  const kind = normalizeKind(value);
  return KIND_FR[kind] ? KIND_FR[kind]![lang] : KIND_PROFILES[kind].label;
}

export function kindMeaning(value: string | undefined, lang: Lang): string {
  const kind = normalizeKind(value);
  if (lang === "fr" && KIND_MEANING_FR[kind]) return KIND_MEANING_FR[kind]!;
  return KIND_PROFILES[kind].description;
}

/** "dans 5 jours", "il y a 3 jours" — a date nobody has to subtract in their head. */
export function relativeDays(days: number | null, lang: Lang): string {
  if (days === null) return "";
  if (lang === "en") {
    if (days === 0) return "today";
    if (days === 1) return "tomorrow";
    if (days === -1) return "yesterday";
    return days > 0 ? `in ${days} days` : `${Math.abs(days)} days ago`;
  }
  if (days === 0) return "aujourd'hui";
  if (days === 1) return "demain";
  if (days === -1) return "hier";
  return days > 0 ? `dans ${days} jours` : `il y a ${Math.abs(days)} jours`;
}

/** The analyst's four verdicts, as a person reads them. */
export const VERDICT: Record<string, Term> = {
  ELIGIBLE: {
    label: { fr: "On peut candidater", en: "We can apply" },
    meaning: {
      fr: "Rien dans le document ne nous exclut, et l'entité est identifiée. À confirmer par toi.",
      en: "Nothing in the document rules us out, and the entity is identified. Still yours to confirm.",
    },
  },
  LIKELY: {
    label: { fr: "Probablement pour nous", en: "Probably for us" },
    meaning: { fr: "Un critère reste à confirmer.", en: "One criterion is still to confirm." },
  },
  NEEDS_INFO: {
    label: { fr: "Indécidable en l'état", en: "Cannot be decided yet" },
    meaning: {
      fr: "Le document ne dit pas qui peut candidater.",
      en: "The document does not say who may apply.",
    },
  },
  NOT_ELIGIBLE: {
    label: { fr: "Pas pour nous", en: "Not for us" },
    meaning: { fr: "Exclu par un critère écrit dans le document.", en: "Ruled out by a criterion in the document." },
  },
};

export function verdictLabel(value: string, lang: Lang): string {
  return VERDICT[value] ? VERDICT[value]!.label[lang] : value;
}

export function verdictMeaning(value: string, lang: Lang): string {
  return VERDICT[value] ? VERDICT[value]!.meaning[lang] : "";
}

/** Every fixed string the shell and the five destinations show. */
export const UI: Record<string, Phrase> = {
  today: { fr: "Aujourd'hui", en: "Today" },
  opportunities: { fr: "Opportunités", en: "Opportunities" },
  projects: { fr: "Projets", en: "Projects" },
  money: { fr: "Argent", en: "Money" },
  workspace: { fr: "Espace de travail", en: "Workspace" },
  exportAudit: { fr: "Exporter le journal", en: "Export audit" },
  backup: { fr: "sauvegarder", en: "backup" },
  restore: { fr: "restaurer", en: "restore" },
  hide: { fr: "masquer", en: "hide" },
  show: { fr: "afficher", en: "show" },
};

export function ui(key: string, lang: Lang): string {
  return UI[key] ? UI[key]![lang] : key;
}
