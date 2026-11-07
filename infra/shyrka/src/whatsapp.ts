/**
 * WhatsApp, cadrage seulement (mandat v6, B4 ; docs/shyrka/adr/0002-whatsapp.md).
 *
 * - Numéros professionnels (Maisons.co, Coach Gari) : API officielle WhatsApp
 *   Business, plus tard, après inscription et validation des coûts par Mickaël.
 * - Numéro personnel : aucune automatisation. Shyrka propose une réponse, que
 *   Mickaël colle lui-même.
 *
 * Code : l'interface d'adaptateur et une version fictive, rien d'autre. Aucun
 * adaptateur réel n'existe.
 */
export interface MessageWhatsApp {
  id: string;
  numeroPro: string;
  de: string;
  texte: string;
  recuLe: string;
}

export interface AdaptateurWhatsApp {
  /** Toujours un numéro professionnel : le numéro personnel n'a pas d'adaptateur. */
  readonly numeroPro: string;
  lister(limite: number): Promise<MessageWhatsApp[]>;
  /** Prépare une proposition de réponse, sans l'envoyer. */
  proposerReponse(messageId: string, texte: string): Promise<{ proposition: string }>;
}

/** Version fictive, pour les tests et les démonstrations : aucun réseau. */
export class WhatsAppFictif implements AdaptateurWhatsApp {
  readonly propositions: { messageId: string; texte: string }[] = [];
  constructor(
    readonly numeroPro: string,
    private readonly boite: MessageWhatsApp[],
  ) {}
  async lister(limite: number): Promise<MessageWhatsApp[]> {
    return this.boite.filter((m) => m.numeroPro === this.numeroPro).slice(0, limite);
  }
  async proposerReponse(messageId: string, texte: string): Promise<{ proposition: string }> {
    this.propositions.push({ messageId, texte });
    return { proposition: texte };
  }
}
