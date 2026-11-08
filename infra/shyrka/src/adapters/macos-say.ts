import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { CommandRunner, RunResult } from "../runner.js";
import type { Speaker } from "../types.js";

/** Échec de la voix, décrit précisément : délai, signal, commande absente ou code de sortie. */
export class ErreurVoix extends Error {
  constructor(
    message: string,
    readonly motif: "delai" | "signal" | "introuvable" | "code",
    readonly detail: { code: number; signal?: string | null; errno?: string; delaiMs?: number },
  ) {
    super(message);
  }
}

export function erreurVoix(res: RunResult, delaiMs: number): ErreurVoix {
  const base = { code: res.code, signal: res.signal ?? null, ...(res.errno ? { errno: res.errno } : {}) };
  if (res.timedOut) return new ErreurVoix(`Voix macOS : délai dépassé (${Math.round(delaiMs / 1000)} s), say arrêté par ${res.signal ?? "SIGTERM"}.`, "delai", { ...base, delaiMs });
  if (res.errno === "ENOENT") return new ErreurVoix("Voix macOS : commande say introuvable (ENOENT).", "introuvable", base);
  if (res.signal) return new ErreurVoix(`Voix macOS : say arrêté par le signal ${res.signal}.`, "signal", base);
  return new ErreurVoix(`Voix macOS : échec (code ${res.code}${res.errno ? `, ${res.errno}` : ""}). ${res.stderr.trim()}`.trim(), "code", base);
}

/** Morceaux de voix : phrases regroupées jusqu'à ~220 caractères (la première courte, pour commencer vite). */
export function morceauxDeVoix(texte: string): string[] {
  const phrases = (texte.replace(/\s+/g, " ").trim().match(/[^.!?…]+[.!?…]+["»”)]*\s*|[^.!?…]+$/g) ?? []).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const p of phrases) {
    const dernier = out.at(-1);
    if (dernier && out.length > 1 && dernier.length + p.length < 220) out[out.length - 1] = `${dernier} ${p}`;
    else out.push(p);
  }
  return out;
}

/** Voix installées sur le Mac (`say -v ?`), par nom exact. */
export function voixInstallees(sortie: string): string[] {
  return sortie.split("\n").map((l) => /^(.+?)\s{2,}[a-z]{2}_[A-Z]{2}\b/.exec(l)?.[1]?.trim()).filter((v): v is string => !!v);
}

/**
 * Voix exacte à donner à `say` : la variante « (Enhanced) » de la voix de
 * l'identité, et elle seule (décision de Mickaël, 8 novembre 2026 : « je ne
 * veux qu'Aurélie Enhanced, pas l'autre »). Absente : aucune voix (null),
 * avec un avertissement ; jamais de repli sur la voix de base.
 */
export function choisirVoix(voix: string, installees: string[]): { voix: string | null; avertissement?: string } {
  const amelioree = /\(Enhanced\)$/.test(voix) ? voix : `${voix} (Enhanced)`;
  if (installees.includes(amelioree)) return { voix: amelioree };
  return { voix: null, avertissement: `Voix « ${amelioree} » absente de ce Mac : Shyrka ne parle pas (réponses à l'écran seulement). L'installer : Réglages Système, Accessibilité, Contenu énoncé.` };
}

/**
 * Voix macOS par `say`. Le texte passe par un fichier (`-f`) : aucun texte
 * généré n'est interprété comme une option de la commande.
 * La réplique en cours s'interrompt sur demande (`interrompre`) : le
 * processus `say` est arrêté, Shyrka continue.
 */
export class MacSaySpeaker implements Speaker {
  private enCours: AbortController | null = null;

  constructor(
    private readonly run: CommandRunner,
    private readonly opts: {
      voice: string; dir: string; rate?: number; timeoutMs?: number; writeFile?: (p: string, s: string) => void; removeFile?: (p: string) => void; now?: () => number;
      /**
       * Voix préparée avant d'être jouée (essai réel du 8 novembre 2026 : voix saccadée quand le Mac
       * transcrivait en même temps) : chaque phrase est synthétisée dans un fichier (`say -o`), puis
       * lue (`afplay`) ; la suivante se prépare pendant la lecture.
       */
      prerendu?: boolean;
    },
  ) {}

  get parle(): boolean {
    return this.enCours !== null;
  }

  interrompre(): void {
    this.enCours?.abort();
  }

  async speak(text: string): Promise<void | "interrompu"> {
    if (this.opts.prerendu) return this.speakPrerendu(text);
    const path = join(this.opts.dir, `replique-${(this.opts.now ?? Date.now)()}.txt`);
    (this.opts.writeFile ?? ((p, s) => writeFileSync(p, s, "utf8")))(path, text);
    const ctrl = new AbortController();
    this.enCours = ctrl;
    const delaiMs = this.opts.timeoutMs ?? 120_000;
    try {
      const args = ["-v", this.opts.voice, "-f", path];
      if (this.opts.rate) args.push("-r", String(this.opts.rate));
      const res = await this.run("say", args, { timeoutMs: delaiMs, signal: ctrl.signal });
      if (res.aborted || ctrl.signal.aborted) return "interrompu";
      if (res.code !== 0) throw erreurVoix(res, delaiMs);
    } finally {
      if (this.enCours === ctrl) this.enCours = null;
      try {
        (this.opts.removeFile ?? unlinkSync)(path);
      } catch {
        /* fichier déjà absent */
      }
    }
  }

  private async speakPrerendu(text: string): Promise<void | "interrompu"> {
    const ctrl = new AbortController();
    this.enCours = ctrl;
    const delaiMs = this.opts.timeoutMs ?? 120_000;
    const base = join(this.opts.dir, `replique-${(this.opts.now ?? Date.now)()}`);
    const morceaux = morceauxDeVoix(text);
    const fichiers: string[] = [];
    const preparer = async (i: number): Promise<string> => {
      const txt = `${base}-${i}.txt`;
      const aiff = `${base}-${i}.aiff`;
      fichiers.push(txt, aiff);
      (this.opts.writeFile ?? ((p, s) => writeFileSync(p, s, "utf8")))(txt, morceaux[i]!);
      const args = ["-v", this.opts.voice, "-f", txt, "-o", aiff];
      if (this.opts.rate) args.push("-r", String(this.opts.rate));
      const res = await this.run("say", args, { timeoutMs: delaiMs, signal: ctrl.signal });
      if (!res.aborted && !ctrl.signal.aborted && res.code !== 0) throw erreurVoix(res, delaiMs);
      return aiff;
    };
    try {
      let suivant = morceaux.length ? preparer(0) : null;
      for (let i = 0; i < morceaux.length && suivant; i++) {
        const aiff = await suivant;
        if (ctrl.signal.aborted) return "interrompu";
        suivant = i + 1 < morceaux.length ? preparer(i + 1) : null;
        const res = await this.run("afplay", [aiff], { timeoutMs: delaiMs, signal: ctrl.signal });
        if (res.aborted || ctrl.signal.aborted) return "interrompu";
        if (res.code !== 0) throw erreurVoix(res, delaiMs);
      }
    } finally {
      if (this.enCours === ctrl) this.enCours = null;
      for (const f of fichiers) {
        try {
          (this.opts.removeFile ?? unlinkSync)(f);
        } catch {
          /* fichier déjà absent */
        }
      }
    }
  }
}
