import type { Canal } from "../permissions.js";

/** Un message reçu, e-mail ou WhatsApp, tel que le canal le fournit. */
export interface MessageRecu {
  id: string;
  canal: Canal;
  /** Adresse e-mail ou numéro WhatsApp de l'expéditeur. */
  de: string;
  nom?: string;
  sujet?: string;
  texte: string;
  recuLe: string;
  /** Fil de discussion, pour répondre au bon endroit. */
  fil?: string;
}

export interface Brouillon {
  id: string;
  canal: Canal;
  enReponseA: string;
  a: string;
  sujet?: string;
  texte: string;
  /** Empreinte SHA-256 du texte : une validation porte sur ce texte précis. */
  empreinte: string;
  creeLe: string;
}

/**
 * Accès à une boîte (e-mail) ou à une messagerie (WhatsApp). Les adaptateurs
 * réels sont à choisir par Mickaël (voir infra/shyrka/README.md) ; seuls des
 * adaptateurs simulés existent aujourd'hui.
 */
export interface CanalMessages {
  readonly canal: Canal;
  nonLus(limite: number): Promise<MessageRecu[]>;
  /** Range un brouillon côté canal (dossier Brouillons), sans l'envoyer. */
  enregistrerBrouillon(b: Brouillon): Promise<void>;
  envoyer(b: Brouillon): Promise<{ envoyeLe: string }>;
}

export interface EvenementJournal {
  at: string;
  canal: Canal;
  action: "lire" | "trier" | "preparer" | "envoyer" | "refus" | "exclu";
  messageId?: string;
  brouillonId?: string;
  categorie?: string;
  raison: string;
}

/** Journal d'audit : chaque lecture, brouillon, envoi et refus y est consigné. */
export interface Journal {
  ajouter(e: EvenementJournal): void;
}

export class JournalMemoire implements Journal {
  readonly evenements: EvenementJournal[] = [];
  ajouter(e: EvenementJournal): void {
    this.evenements.push(e);
  }
}
