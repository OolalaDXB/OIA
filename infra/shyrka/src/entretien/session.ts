import { assertModeleLocal } from "../local.js";
import { applyStyle } from "../persona.js";
import type { AudioClip, TextModel, Transcriber } from "../types.js";
import { CLOTURE, MISE_EN_ROUTE, type Seance } from "./programme.js";

export type Temps = "mise-en-route" | "theme" | "relance" | "cloture";

/** Réponse de Mickaël à une question : une prise audio, ou « passer », ou « retirer » la précédente. */
export type Reponse = { prise: AudioClip } | "passer" | "retirer";

export interface Echange {
  temps: Temps;
  question: string;
  prise: AudioClip;
  texte?: string;
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
  /** Ce que Shyrka a compris, à relire en ouverture de la séance suivante (contre-pied). */
  contrePied: string;
  aNettoyer: string[];
  /** Vrai si l'extraction n'a pas pu se faire (modèle local absent) : la fiche reste à remplir. */
  extractionManquante: boolean;
}

export interface EntretienDeps {
  seance: Seance;
  /** Shyrka lit une question à voix haute (et l'affiche). */
  poser: (texte: string) => Promise<void>;
  /** Enregistre la réponse dans un fichier (nom fourni), ou rend « passer » / « retirer ». */
  enregistrer: (nomFichier: string) => Promise<Reponse>;
  /** Supprime une prise retirée (règle 4 : tu peux tout retirer). */
  supprimer: (prise: AudioClip) => void;
  /** Transcription locale, faite à la fin de la séance. */
  transcrire: Transcriber;
  /** Modèle local pour l'extraction ; absent : la fiche garde ses rubriques vides, à remplir. */
  model?: TextModel;
  clock?: () => number;
}

const nom = (n: number, temps: Temps) => `${String(n).padStart(2, "0")}-${temps}.wav`;

/**
 * Mode entretien (mandat v6, B2) : Shyrka lit chaque question à voix haute,
 * enregistre la réponse dans un fichier, puis, à la fin, transcrit en local
 * et prépare la fiche de séance, chaque élément au statut « à valider ».
 *
 * Écart avec docs/shyrka/entretiens.md : la transcription n'a lieu qu'à la
 * fin, si bien que les relances sont celles du programme et que le
 * contre-pied (« où est-ce que je me trompe ? ») est préparé pour l'ouverture
 * de la séance suivante.
 */
export class SessionEntretien {
  private echanges: Echange[] = [];
  private retraits: { motif: string }[] = [];
  private passees: string[] = [];
  private n = 0;

  constructor(private readonly deps: EntretienDeps) {
    if (deps.model) assertModeleLocal(deps.model);
  }

  private async demander(temps: Temps, question: string): Promise<boolean> {
    await this.deps.poser(question);
    for (;;) {
      const r = await this.deps.enregistrer(nom(++this.n, temps));
      if (r === "retirer") {
        const retiree = this.echanges.pop();
        if (retiree) {
          this.deps.supprimer(retiree.prise);
          this.retraits.push({ motif: `réponse à « ${retiree.question} » retirée pendant la séance` });
          await this.deps.poser("C'est retiré. Tu peux répondre à nouveau.");
        } else {
          await this.deps.poser("Rien à retirer.");
        }
        await this.deps.poser(question);
        continue;
      }
      if (r === "passer") {
        this.passees.push(question);
        return false;
      }
      this.echanges.push({ temps, question, prise: r.prise });
      return true;
    }
  }

  async mener(): Promise<ResultatEntretien> {
    const t0 = (this.deps.clock ?? Date.now)();
    const { seance } = this.deps;
    await this.deps.poser(`Séance ${seance.numero}. ${seance.theme}.${seance.consigne ? ` ${seance.consigne}` : ""} Tu peux passer une question ou retirer ta dernière réponse à tout moment.`);
    await this.demander("mise-en-route", MISE_EN_ROUTE);
    for (const q of seance.questions) {
      const repondu = await this.demander("theme", q.texte);
      if (repondu && q.relance) await this.demander("relance", q.relance.charAt(0).toUpperCase() + q.relance.slice(1));
    }
    await this.demander("cloture", CLOTURE);
    await this.deps.poser("Merci. Je transcris la séance et je prépare la fiche. Tout restera à valider.");

    for (const e of this.echanges) e.texte = (await this.deps.transcrire.transcribe(e.prise, { language: "fr" })).text;
    const extrait = await this.extraire();
    return {
      seance,
      date: new Date(t0).toISOString().slice(0, 10),
      dureeMs: (this.deps.clock ?? Date.now)() - t0,
      echanges: this.echanges,
      retraits: this.retraits,
      passees: this.passees,
      ...extrait,
      aNettoyer: this.echanges.filter((e) => /\bswift\b/i.test(e.texte ?? "")).map((e) => `Mention de Swift dans la réponse à « ${e.question} »`),
    };
  }

  transcription(): string {
    return this.echanges.map((e) => `[${e.temps}] Shyrka : ${e.question}\nMickaël : ${e.texte ?? "(non transcrit)"}`).join("\n\n");
  }

  private async extraire(): Promise<Pick<ResultatEntretien, "regles" | "exemples" | "formules" | "contrePied" | "extractionManquante">> {
    const vide = { regles: [], exemples: [], formules: [], contrePied: "", extractionManquante: true };
    if (!this.deps.model || this.echanges.length === 0) return vide;
    try {
      const raw = await this.deps.model.chat([
        {
          role: "system",
          content:
            'Extrais de cet entretien, avec les mots de Mickaël : les règles (comment il décide, ce qu\'il refuse, ce qu\'il privilégie), les exemples concrets qui les illustrent, les formules qu\'il emploie, et un résumé de sa façon de penser en cinq phrases au plus, en le tutoyant. Réponds uniquement en JSON : {"regles":[{"texte":"","theme":""}],"exemples":[{"texte":""}],"formules":[{"texte":""}],"compris":""}. N\'invente rien.',
        },
        { role: "user", content: this.transcription() },
      ]);
      const j = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Record<string, unknown>;
      const liste = (v: unknown): Element[] =>
        Array.isArray(v)
          ? v
              .filter((x): x is { texte: string; theme?: unknown } => typeof x === "object" && x !== null && typeof (x as { texte?: unknown }).texte === "string")
              .map((x) => ({ texte: x.texte, ...(typeof x.theme === "string" && x.theme ? { theme: x.theme } : {}), statut: "à valider" as const }))
          : [];
      return { regles: liste(j.regles), exemples: liste(j.exemples), formules: liste(j.formules), contrePied: typeof j.compris === "string" ? applyStyle(j.compris) : "", extractionManquante: false };
    } catch {
      return vide;
    }
  }
}
