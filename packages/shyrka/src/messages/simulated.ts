import type { Canal } from "../permissions.js";
import type { Brouillon, CanalMessages, MessageRecu } from "./types.js";

/**
 * Boîte simulée (e-mail ou WhatsApp) : aucun réseau, aucun envoi réel.
 * Elle consigne les brouillons rangés et les « envois » pour les tests.
 */
export class CanalSimule implements CanalMessages {
  readonly brouillons: Brouillon[] = [];
  readonly envoyes: Brouillon[] = [];
  constructor(
    readonly canal: Canal,
    private readonly boite: MessageRecu[],
  ) {}
  async nonLus(limite: number): Promise<MessageRecu[]> {
    return this.boite.filter((m) => m.canal === this.canal).slice(0, limite);
  }
  async enregistrerBrouillon(b: Brouillon): Promise<void> {
    this.brouillons.push(b);
  }
  async envoyer(b: Brouillon): Promise<{ envoyeLe: string }> {
    this.envoyes.push(b);
    return { envoyeLe: "simule" };
  }
}

/** Les douze messages fictifs de la séance 7, pour essayer l'agent sans boîte réelle. */
export const BOITE_FICTIVE: MessageRecu[] = [
  { id: "f1", canal: "email", de: "prospect@exemple.fr", sujet: "Audit de notre site", texte: "Bonjour, quels sont vos tarifs pour un audit de notre site ?", recuLe: "2026-11-08T08:00:00Z" },
  { id: "f2", canal: "whatsapp", de: "+33600000002", texte: "La livraison devait arriver hier, toujours rien.", recuLe: "2026-11-08T08:05:00Z" },
  { id: "f3", canal: "email", de: "partner@example.com", sujet: "Meeting next week", texte: "Hi Mickaël, could we meet next week to discuss the partnership?", recuLe: "2026-11-08T08:10:00Z" },
  { id: "f4", canal: "whatsapp", de: "+33600000004", texte: "Désolé, je ne pourrai pas livrer vendredi comme prévu.", recuLe: "2026-11-08T08:15:00Z" },
  { id: "f6", canal: "email", de: "ventes@exemple.com", sujet: "Offre exceptionnelle", texte: "Découvrez notre solution qui va révolutionner votre entreprise.", recuLe: "2026-11-08T08:20:00Z" },
  { id: "f9", canal: "whatsapp", de: "+447700000009", texte: "Hello, could we arrive earlier at the house on Saturday?", recuLe: "2026-11-08T08:25:00Z" },
  { id: "fx", canal: "email", de: "quelquun@swift.com", sujet: "Interne", texte: "Contenu qui ne doit jamais être lu.", recuLe: "2026-11-08T08:30:00Z" },
];
