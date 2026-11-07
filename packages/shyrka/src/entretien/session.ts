import { assertModeleLocal } from "../messages/agent.js";
import { applyStyle } from "../persona.js";
import type { TextModel } from "../types.js";
import { CLOTURE, MISE_EN_ROUTE, TECHNIQUES_RELANCE, type Seance } from "./programme.js";

export type Temps = "mise-en-route" | "theme" | "relance" | "contre-pied" | "cloture";

export interface Echange {
  temps: Temps;
  question: string;
  reponse: string;
}

export interface Element {
  texte: string;
  theme?: string;
  statut: "à valider";
}

export interface ResultatEntretien {
  seance: Seance;
  date: string;
  dureeMs: number;
  echanges: Echange[];
  retraits: { motif: string }[];
  passees: string[];
  regles: Element[];
  exemples: Element[];
  formules: Element[];
  /** Passages à nettoyer avant validation : Swift, noms de tiers. */
  aNettoyer: string[];
}

export interface EntretienDeps {
  seance: Seance;
  /** Shyrka pose une question (texte, et voix si son identité l'autorise). */
  poser: (texte: string) => Promise<void>;
  /** Mickaël répond (micro et Whisper, ou clavier). */
  ecouter: () => Promise<string>;
  model: TextModel;
  /** Une relance par question au plus ; 0 pour aucune. */
  relances?: number;
  clock?: () => number;
}

const PASSER = /^\s*(je )?passe[r]?\s*\.?\s*$/i;
const RETIRER = /^\s*retire[r]?\b/i;

/**
 * Mode entretien : Shyrka mène une séance (docs/shyrka/entretiens.md) en
 * quatre temps, puis extrait règles, exemples et formules, tous « à valider ».
 *
 * Réponses spéciales : « passer » saute la question (règle 1, en cas de
 * doute) ; « retirer » efface la réponse précédente, dont seul le motif est
 * gardé (règle 4).
 */
export class SessionEntretien {
  private echanges: Echange[] = [];
  private retraits: { motif: string }[] = [];
  private passees: string[] = [];

  constructor(private readonly deps: EntretienDeps) {
    assertModeleLocal(deps.model);
  }

  private async demander(temps: Temps, question: string): Promise<string | null> {
    await this.deps.poser(question);
    for (;;) {
      const reponse = (await this.deps.ecouter()).trim();
      if (RETIRER.test(reponse)) {
        const retiree = this.echanges.pop();
        const motif = reponse.replace(RETIRER, "").replace(/^[\s:,-]+/, "").trim() || "sans motif";
        if (retiree) this.retraits.push({ motif });
        await this.deps.poser(retiree ? "C'est retiré. Je reprends la question." : "Rien à retirer.");
        await this.deps.poser(question);
        continue;
      }
      if (!reponse || PASSER.test(reponse)) {
        this.passees.push(question);
        return null;
      }
      this.echanges.push({ temps, question, reponse });
      return reponse;
    }
  }

  private async relancer(question: string, reponse: string, relancePrevue?: string): Promise<void> {
    if ((this.deps.relances ?? 1) < 1) return;
    let relance = relancePrevue;
    if (!relance) {
      relance = applyStyle(
        await this.deps.model.chat([
          {
            role: "system",
            content: `Tu mènes un entretien avec Mickaël pour apprendre comment il pense. Pose UNE relance courte, une seule question, en français, en choisissant la technique la plus utile :\n${TECHNIQUES_RELANCE.join("\n")}\nNe demande jamais de nom, de montant ni de détail sur Swift ou ses clients.`,
          },
          { role: "user", content: `Question : ${question}\nRéponse : ${reponse}` },
        ]),
      );
    }
    if (relance) await this.demander("relance", relance.charAt(0).toUpperCase() + relance.slice(1));
  }

  async mener(): Promise<ResultatEntretien> {
    const t0 = (this.deps.clock ?? Date.now)();
    const { seance } = this.deps;
    await this.deps.poser(`Séance ${seance.numero} · ${seance.theme}.${seance.consigne ? ` ${seance.consigne}` : ""} Tu peux dire « passer » ou « retirer » à tout moment.`);

    await this.demander("mise-en-route", MISE_EN_ROUTE);
    for (const q of seance.questions) {
      const r = await this.demander("theme", q.texte);
      if (r) await this.relancer(q.texte, r, q.relance);
    }

    const compris = applyStyle(
      await this.deps.model.chat([
        { role: "system", content: "Résume en cinq phrases au plus ce que tu as compris de la façon de penser de Mickaël dans cet entretien. Tutoie-le. Pas de tiret cadratin." },
        { role: "user", content: this.transcription() },
      ]),
    );
    await this.demander("contre-pied", `Voici ce que j'ai compris. ${compris} Où est-ce que je me trompe ?`);
    await this.demander("cloture", CLOTURE);

    const extraits = await this.extraire();
    return {
      seance,
      date: new Date(t0).toISOString().slice(0, 10),
      dureeMs: (this.deps.clock ?? Date.now)() - t0,
      echanges: this.echanges,
      retraits: this.retraits,
      passees: this.passees,
      ...extraits,
      aNettoyer: this.echanges.filter((e) => /\bswift\b/i.test(e.reponse)).map((e) => `Mention de Swift dans la réponse à « ${e.question} »`),
    };
  }

  transcription(): string {
    return this.echanges.map((e) => `[${e.temps}] Shyrka : ${e.question}\nMickaël : ${e.reponse}`).join("\n\n");
  }

  private async extraire(): Promise<Pick<ResultatEntretien, "regles" | "exemples" | "formules">> {
    const vide = { regles: [], exemples: [], formules: [] };
    if (this.echanges.length === 0) return vide;
    const raw = await this.deps.model.chat([
      {
        role: "system",
        content:
          'Extrais de cet entretien, avec les mots de Mickaël : les règles (comment il décide, ce qu\'il refuse, ce qu\'il privilégie), les exemples concrets qui les illustrent, et les formules ou tournures qu\'il emploie. Réponds uniquement en JSON : {"regles":[{"texte":"","theme":""}],"exemples":[{"texte":""}],"formules":[{"texte":""}]}. N\'invente rien.',
      },
      { role: "user", content: this.transcription() },
    ]);
    try {
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
      const liste = (v: unknown): Element[] =>
        Array.isArray(v)
          ? v
              .filter((x): x is { texte: string; theme?: unknown } => typeof x === "object" && x !== null && typeof (x as { texte?: unknown }).texte === "string")
              .map((x) => ({ texte: x.texte, ...(typeof x.theme === "string" && x.theme ? { theme: x.theme } : {}), statut: "à valider" as const }))
          : [];
      return { regles: liste(j.regles), exemples: liste(j.exemples), formules: liste(j.formules) };
    } catch {
      return vide;
    }
  }
}
