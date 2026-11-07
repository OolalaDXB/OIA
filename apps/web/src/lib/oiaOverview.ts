import type { Phrase } from "./vocabulary";

/**
 * Contenu de l'interface web OIA (/oia), tiré de la roadmap 3.6
 * (`docs/roadmap-oia-shyrka-souffleur.md`) et du cadre de Shyrka
 * (`docs/shyrka/CADRE.md`). Données statiques, sans appel réseau, sans
 * fournisseur : la page ne fait que montrer où en sont les choses.
 *
 * Règle d'honnêteté : un état n'est « fait » que si la roadmap le dit. Un test
 * vérifie que chaque phase citée ici existe dans la roadmap.
 */

export type OiaState = "done" | "inProgress" | "proposed" | "next";

export const STATE_LABEL: Record<OiaState, Phrase> = {
  done: { fr: "Fait", en: "Done" },
  inProgress: { fr: "En cours", en: "In progress" },
  proposed: { fr: "Proposé, à valider", en: "Proposed, to approve" },
  next: { fr: "À venir", en: "Upcoming" },
};

export interface OiaIdentity {
  id: "visibility" | "seo-command" | "shyrka";
  name: string;
  role: Phrase;
}

export const IDENTITIES: OiaIdentity[] = [
  {
    id: "visibility",
    name: "OIA Visibility",
    role: { fr: "Le produit : mesurer la présence d'une marque dans les réponses des IA et dans Google.", en: "The product: measure a brand's presence in AI answers and in Google." },
  },
  {
    id: "seo-command",
    name: "OIA SEO Command",
    role: { fr: "Le centre opérationnel : six agents, missions, recommandations, validations.", en: "The operations centre: six agents, missions, recommendations, approvals." },
  },
  {
    id: "shyrka",
    name: "Shyrka",
    role: { fr: "L'interface générale. Shyrka parle, Souffleur travaille, OIA prouve et contrôle.", en: "The general interface. Shyrka talks, Souffleur works, OIA proves and controls." },
  },
];

export interface OiaPhase {
  /** Identifiant tel qu'il apparaît dans un titre « ## P1 · … » de la roadmap. */
  id: "P0" | "P1" | "P2" | "P3" | "P4" | "P5" | "P6" | "P9";
  title: Phrase;
  state: OiaState;
  /** Étape de la piste Shyrka livrée avec cette phase, s'il y en a une. */
  shyrka?: ShyrkaStepId;
}

export const PHASES: OiaPhase[] = [
  { id: "P0", title: { fr: "Cadre de Shyrka", en: "Shyrka's framework" }, state: "proposed" },
  { id: "P1", title: { fr: "OIA Visibility opérationnel (J0)", en: "OIA Visibility live (J0)" }, state: "inProgress", shyrka: "S1" },
  { id: "P2", title: { fr: "Boucle complète et agents", en: "Full loop and agents" }, state: "next", shyrka: "S2" },
  { id: "P3", title: { fr: "Couche Visibility et premier moteur maison", en: "Visibility layer and first in-house engine" }, state: "next" },
  { id: "P4", title: { fr: "Souffleur : routage", en: "Souffleur: routing" }, state: "next" },
  { id: "P5", title: { fr: "Souffleur : mémoire", en: "Souffleur: memory" }, state: "next", shyrka: "S3" },
  { id: "P6", title: { fr: "MCP et audit des dépôts", en: "MCP and repository audit" }, state: "next", shyrka: "S4" },
  { id: "P9", title: { fr: "Écosystème et atelier d'identité", en: "Ecosystem and identity workshop" }, state: "next" },
];

export type ShyrkaStepId = "S1" | "S2" | "S3" | "S4";

export interface ShyrkaStep {
  id: ShyrkaStepId;
  name: Phrase;
  phase: OiaPhase["id"];
  scope: Phrase;
}

export const SHYRKA_STEPS: ShyrkaStep[] = [
  {
    id: "S1",
    name: { fr: "Shyrka 1 · Te parle", en: "Shyrka 1 · Talks to you" },
    phase: "P1",
    scope: { fr: "Dialogue local : micro, Whisper, Ollama, voix macOS. Identité v0 : réponse en texte tant que Mickaël n'a pas arrêté la version 1.", en: "Local dialogue: microphone, Whisper, Ollama, macOS voice. Identity v0: text answers until Mickaël sets version 1." },
  },
  {
    id: "S2",
    name: { fr: "Shyrka 2 · Te seconde", en: "Shyrka 2 · Backs you up" },
    phase: "P2",
    scope: { fr: "Digest du matin et préparation (brouillons, mandats), sans envoi ni fusion.", en: "Morning digest and preparation (drafts, briefs), never sent or merged." },
  },
  {
    id: "S3",
    name: { fr: "Shyrka 3 · Te connaît", en: "Shyrka 3 · Knows you" },
    phase: "P5",
    scope: { fr: "Mémoire validée : retrouve une décision, montre sa source, refuse de la généraliser à un autre client.", en: "Validated memory: finds a decision, shows its source, refuses to generalise it to another client." },
  },
  {
    id: "S4",
    name: { fr: "Shyrka 4 · Agit pour toi", en: "Shyrka 4 · Acts for you" },
    phase: "P6",
    scope: { fr: "Actions par outils MCP autorisés, chaque engagement confirmé par Mickaël, refus journalisés.", en: "Actions through authorised MCP tools, every commitment confirmed by Mickaël, refusals logged." },
  },
];
