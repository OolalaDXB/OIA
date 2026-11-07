import { createHash } from "node:crypto";
import { decider, type Permissions } from "../permissions.js";
import { applyStyle } from "../persona.js";
import type { ChatMessage, TextModel } from "../types.js";
import { CATEGORIES, estCategorie, type Categorie } from "./categories.js";
import type { Brouillon, CanalMessages, Journal, MessageRecu } from "./types.js";

export const empreinte = (texte: string): string => createHash("sha256").update(texte, "utf8").digest("hex");

/**
 * Un modèle qui lit le courrier de Mickaël doit tourner sur sa machine
 * (Ollama) ou être simulé. Aucun fournisseur distant ne reçoit ses messages
 * tant qu'il n'en a pas décidé autrement.
 */
export function assertModeleLocal(model: TextModel): void {
  if (!/^(ollama|simule):/.test(model.name)) {
    throw new Error(`Agent courrier : modèle « ${model.name} » refusé, seul un modèle local (Ollama) peut lire les messages.`);
  }
}

export interface Tri {
  message: MessageRecu;
  categorie: Categorie;
  resume: string;
}

export interface Signalement {
  messageId: string;
  raison: string;
}

/**
 * Agent courrier et WhatsApp de Shyrka. Il lit, trie, résume, prépare des
 * réponses et n'envoie qu'à travers les paliers de permission. Les mêmes
 * règles valent pour les deux canaux ; seul l'adaptateur change.
 */
export class AgentMessages {
  constructor(
    private readonly deps: {
      canal: CanalMessages;
      model: TextModel;
      permissions: Permissions;
      journal: Journal;
      /** Consignes de style apprises en entretien (séances 6 et 7), une fois validées. */
      style?: string;
      clock?: () => number;
      newId?: () => string;
    },
  ) {
    assertModeleLocal(deps.model);
  }

  private now(): string {
    return new Date((this.deps.clock ?? Date.now)()).toISOString();
  }

  private get canal() {
    return this.deps.canal.canal;
  }

  private exclu(m: MessageRecu): boolean {
    const { domaines, numeros } = this.deps.permissions.exclus;
    const de = m.de.toLowerCase();
    return domaines.some((d) => de.endsWith(`@${d.toLowerCase()}`) || de.endsWith(`.${d.toLowerCase()}`)) || numeros.includes(m.de);
  }

  /** Lit les messages non lus, écarte les expéditeurs exclus (Swift), trie et résume les autres. */
  async lireEtTrier(limite = 20): Promise<{ tries: Tri[]; exclus: number } | { refus: string }> {
    const d = decider(this.deps.permissions, this.canal, "lire");
    if (!d.autorise) {
      this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "refus", raison: d.raison });
      return { refus: d.raison };
    }
    const messages = await this.deps.canal.nonLus(limite);
    const tries: Tri[] = [];
    let exclus = 0;
    for (const m of messages) {
      if (this.exclu(m)) {
        exclus += 1;
        // Le contenu n'est ni lu par le modèle ni consigné : seule la trace de l'exclusion reste.
        this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "exclu", messageId: m.id, raison: "expéditeur exclu (Swift et ses clients)" });
        continue;
      }
      this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "lire", messageId: m.id, raison: d.raison });
      const tri = await this.trier(m);
      this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "trier", messageId: m.id, categorie: tri.categorie, raison: "modèle local" });
      tries.push(tri);
    }
    return { tries, exclus };
  }

  private async trier(m: MessageRecu): Promise<Tri> {
    const liste = Object.entries(CATEGORIES)
      .map(([k, v]) => `${k} : ${v}`)
      .join("\n");
    const messages: ChatMessage[] = [
      {
        role: "system",
        content: `Tu tries les messages reçus par Mickaël. Réponds uniquement en JSON : {"categorie": "<clé>", "resume": "<une phrase>"}. Clés possibles :\n${liste}\nEn cas de doute : ambigu.`,
      },
      { role: "user", content: `${m.sujet ? `Sujet : ${m.sujet}\n` : ""}De : ${m.nom ?? m.de}\n\n${m.texte}` },
    ];
    const raw = await this.deps.model.chat(messages);
    let categorie: Categorie = "ambigu";
    let resume = "";
    try {
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as { categorie?: unknown; resume?: unknown };
      if (estCategorie(j.categorie)) categorie = j.categorie;
      if (typeof j.resume === "string") resume = applyStyle(j.resume);
    } catch {
      /* réponse non conforme : catégorie « ambigu », résumé vide */
    }
    return { message: m, categorie, resume };
  }

  /** Prépare une réponse. Rien n'est envoyé : le brouillon attend une décision. */
  async preparer(tri: Tri, consigne?: string): Promise<Brouillon | { refus: string }> {
    const d = decider(this.deps.permissions, this.canal, "preparer");
    if (!d.autorise) {
      this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "refus", messageId: tri.message.id, raison: d.raison });
      return { refus: d.raison };
    }
    const m = tri.message;
    const raw = await this.deps.model.chat([
      {
        role: "system",
        content: [
          "Tu rédiges, pour Mickaël, un brouillon de réponse qu'il relira. Tu écris en son nom, à la première personne, dans la langue du message reçu.",
          this.canal === "whatsapp" ? "Canal WhatsApp : court, sans formule d'e-mail." : "Canal e-mail : formule d'ouverture et de fin, sans signature (elle est ajoutée par la messagerie).",
          "Ne promets rien : ni prix, ni date, ni engagement, sauf si la consigne le dit. Pas de tiret cadratin.",
          this.deps.style ? `Style de Mickaël (validé) :\n${this.deps.style}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      { role: "user", content: `${consigne ? `Consigne de Mickaël : ${consigne}\n\n` : ""}Message reçu (${CATEGORIES[tri.categorie]}) :\n${m.texte}` },
    ]);
    const texte = applyStyle(raw);
    const b: Brouillon = {
      id: (this.deps.newId ?? (() => `b-${m.id}-${Date.now()}`))(),
      canal: this.canal,
      enReponseA: m.id,
      a: m.de,
      ...(m.sujet ? { sujet: m.sujet.startsWith("Re:") ? m.sujet : `Re: ${m.sujet}` } : {}),
      texte,
      empreinte: empreinte(texte),
      creeLe: this.now(),
    };
    await this.deps.canal.enregistrerBrouillon(b);
    this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "preparer", messageId: m.id, brouillonId: b.id, categorie: tri.categorie, raison: d.raison });
    return b;
  }

  /**
   * Envoie un brouillon si les paliers le permettent : validation de Mickaël
   * sur ce texte précis, ou délégation écrite pour cette catégorie.
   */
  async envoyer(b: Brouillon, ctx: { categorie: Categorie; validation?: { brouillonId: string; empreinte: string } }): Promise<{ envoyeLe: string } | { refus: string; validationRequise: boolean }> {
    if (empreinte(b.texte) !== b.empreinte) {
      const raison = "brouillon modifié depuis sa préparation : empreinte différente";
      this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "refus", brouillonId: b.id, categorie: ctx.categorie, raison });
      return { refus: raison, validationRequise: true };
    }
    const d = decider(this.deps.permissions, this.canal, "envoyer", {
      categorie: ctx.categorie,
      brouillon: { id: b.id, empreinte: b.empreinte },
      ...(ctx.validation ? { validation: ctx.validation } : {}),
    });
    if (!d.autorise) {
      this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "refus", brouillonId: b.id, categorie: ctx.categorie, raison: d.raison });
      return { refus: d.raison, validationRequise: d.validationRequise };
    }
    const r = await this.deps.canal.envoyer(b);
    this.deps.journal.ajouter({ at: this.now(), canal: this.canal, action: "envoyer", brouillonId: b.id, categorie: ctx.categorie, raison: d.raison });
    return r;
  }
}

export { CATEGORIES };
