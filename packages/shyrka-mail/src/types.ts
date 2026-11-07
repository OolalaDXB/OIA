/** En-têtes et métadonnées d'un message, sans son corps. */
export interface EnteteMessage {
  id: string;
  de: string;
  a: string[];
  cc: string[];
  objet: string;
  date: string;
  /** Noms des pièces jointes, jamais leur contenu. */
  piecesJointes: string[];
  /** Autres en-têtes utiles au contrôle d'exclusion (Reply-To, Sender, Return-Path, Received…). */
  autresEntetes: Record<string, string[]>;
}

export interface Message extends EnteteMessage {
  /** Corps en texte brut, messages transférés compris. */
  corps: string;
}

export interface Brouillon {
  a: string;
  objet: string;
  corps: string;
  /** Identifiant du message auquel le brouillon répond. */
  enReponseA: string;
}

/**
 * Boîte aux lettres : trois opérations seulement (mandat v6, B3). Aucune
 * fonction d'envoi, ni ici ni dans aucun adaptateur.
 */
export interface BoiteAuxLettres {
  lister(opts: { limite: number }): Promise<EnteteMessage[]>;
  lire(id: string): Promise<Message>;
  creerBrouillon(b: Brouillon): Promise<{ id: string }>;
}

export const GROUPES = ["pour-toi", "reponse-simple", "information", "bruit"] as const;
export type Groupe = (typeof GROUPES)[number];

export const LIBELLES: Record<Groupe, string> = {
  "pour-toi": "Pour toi",
  "reponse-simple": "Réponse simple",
  information: "Information",
  bruit: "Bruit",
};

/** Classe un message admis (jamais un message exclu) dans l'un des quatre groupes. */
export interface Classeur {
  readonly nom: string;
  classer(m: Message): Promise<Groupe>;
}

/** Rédige un brouillon de réponse pour un message du groupe « réponse simple ». */
export interface Redacteur {
  readonly nom: string;
  rediger(m: Message, style: string): Promise<string>;
}
