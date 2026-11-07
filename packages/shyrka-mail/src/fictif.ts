import type { BoiteAuxLettres, Brouillon, Classeur, EnteteMessage, Groupe, Message, Redacteur } from "./types.js";

/** Boîte fictive, pour les tests et les démonstrations. Elle consigne chaque lecture. */
export class BoiteFictive implements BoiteAuxLettres {
  readonly lus: string[] = [];
  readonly brouillons: Brouillon[] = [];
  constructor(private readonly messages: Message[]) {}
  async lister({ limite }: { limite: number }): Promise<EnteteMessage[]> {
    return this.messages.slice(0, limite).map(({ corps: _c, ...e }) => e);
  }
  async lire(id: string): Promise<Message> {
    this.lus.push(id);
    const m = this.messages.find((x) => x.id === id);
    if (!m) throw new Error(`Message ${id} introuvable.`);
    return m;
  }
  async creerBrouillon(b: Brouillon): Promise<{ id: string }> {
    this.brouillons.push(b);
    return { id: `brouillon-${this.brouillons.length}` };
  }
}

/** Classeur fictif : règle simple sur l'objet. Il consigne chaque message vu. */
export class ClasseurFictif implements Classeur {
  readonly nom = "fictif";
  readonly vus: Message[] = [];
  async classer(m: Message): Promise<Groupe> {
    this.vus.push(m);
    const o = m.objet.toLowerCase();
    if (o.includes("question") || o.includes("rendez-vous")) return "reponse-simple";
    if (o.includes("newsletter") || o.includes("promo")) return "bruit";
    if (o.includes("facture") || o.includes("info")) return "information";
    return "pour-toi";
  }
}

export class RedacteurFictif implements Redacteur {
  readonly nom = "fictif";
  readonly vus: Message[] = [];
  async rediger(m: Message): Promise<string> {
    this.vus.push(m);
    return `Bonjour,\n\nMerci pour votre message. Je reviens vers vous rapidement.\n\n(brouillon fictif, réponse à « ${m.objet} »)`;
  }
}

/** Messages fictifs. Aucune donnée réelle. */
export const MESSAGES_FICTIFS: Message[] = [
  { id: "m1", de: "Camille <camille@exemple.fr>", a: ["moi@exemple.fr"], cc: [], objet: "Question sur le rendez-vous de jeudi", date: "2026-11-08", piecesJointes: [], autresEntetes: {}, corps: "Bonjour, peut-on décaler à 15 h ?" },
  { id: "m2", de: "Lettre <newsletter@exemple.com>", a: ["moi@exemple.fr"], cc: [], objet: "Newsletter de novembre", date: "2026-11-08", piecesJointes: [], autresEntetes: {}, corps: "Nos nouveautés." },
  { id: "m3", de: "Compta <compta@exemple.fr>", a: ["moi@exemple.fr"], cc: [], objet: "Facture disponible", date: "2026-11-08", piecesJointes: ["facture-novembre.pdf"], autresEntetes: {}, corps: "Votre facture est en ligne." },
  { id: "m4", de: "Associé <associe@exemple.fr>", a: ["moi@exemple.fr"], cc: [], objet: "Décision à prendre sur le projet", date: "2026-11-08", piecesJointes: [], autresEntetes: {}, corps: "Il faut trancher avant lundi." },
  { id: "m5", de: "Collègue <collegue@domaine-exclu.example>", a: ["moi@exemple.fr"], cc: [], objet: "Point interne", date: "2026-11-08", piecesJointes: [], autresEntetes: {}, corps: "Contenu qui ne doit jamais être lu." },
];

/** Liste de démonstration, pour le mode simulé seulement. La vraie liste est celle de Mickaël. */
export const EXCLUSIONS_DE_DEMONSTRATION = { domaines: ["domaine-exclu.example"], mots: ["motexclu"] };
