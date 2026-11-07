/**
 * Clavier de la CLI de Shyrka.
 *
 * - En temps normal : lecture ligne par ligne (Entrée valide), écho du terminal.
 * - Pendant que Shyrka parle (`pendantParole`) : mode brut, une touche suffit.
 *   Entrée ou Espace interrompt la réplique ; Ctrl+C ferme la session.
 *
 * Aucune écoute du micro ici : seulement le clavier.
 */

export interface EntreeClavier {
  on(evt: "data", f: (chunk: Buffer | string) => void): unknown;
  on(evt: "end", f: () => void): unknown;
  off?(evt: "data", f: (chunk: Buffer | string) => void): unknown;
  resume?(): unknown;
  pause?(): unknown;
  isTTY?: boolean;
  setRawMode?(raw: boolean): unknown;
}

export type Touche = "interrompre" | "fermer" | "autre";

/** Ce que veut dire une touche pressée pendant la parole. */
export function toucheDe(c: string): Touche {
  if (c === "\u0003") return "fermer"; // Ctrl+C en mode brut
  if (c === " " || c === "\r" || c === "\n") return "interrompre";
  return "autre";
}

export class Clavier {
  private tampon = "";
  private readonly lignes: string[] = [];
  private readonly attente: ((l: string | null) => void)[] = [];
  private fini = false;
  private surTouche: ((t: Touche) => void) | null = null;

  constructor(
    private readonly input: EntreeClavier,
    private readonly ecrire: (s: string) => void = (s) => process.stdout.write(s),
  ) {
    input.on("data", this.recevoir);
    input.on("end", () => {
      this.fini = true;
      if (this.tampon) this.livrer(this.tampon);
      this.tampon = "";
      while (this.attente.length) this.attente.shift()!(null);
    });
    input.resume?.();
  }

  private readonly recevoir = (chunk: Buffer | string): void => {
    const texte = String(chunk);
    if (this.surTouche) {
      for (const c of texte) {
        const t = toucheDe(c);
        if (t !== "autre") this.surTouche(t);
      }
      return; // les touches pressées pendant la parole ne deviennent pas une ligne
    }
    this.tampon += texte;
    let i: number;
    while ((i = this.tampon.search(/\r?\n/)) >= 0) {
      const ligne = this.tampon.slice(0, i);
      this.tampon = this.tampon.slice(i + (this.tampon[i] === "\r" ? 2 : 1));
      this.livrer(ligne);
    }
  };

  private livrer(l: string): void {
    if (this.attente.length) this.attente.shift()!(l);
    else this.lignes.push(l);
  }

  /** Lit une ligne ; null en fin de flux. */
  lire(invite: string): Promise<string | null> {
    this.ecrire(invite);
    if (this.lignes.length) return Promise.resolve(this.lignes.shift()!);
    if (this.fini) return Promise.resolve(null);
    return new Promise((r) => this.attente.push(r));
  }

  /**
   * Pendant que la promesse court (réplique parlée), une touche agit tout de
   * suite : Entrée ou Espace appelle `interrompre`, Ctrl+C appelle `fermer`.
   * Le terminal revient ensuite en lecture par ligne.
   */
  async pendantParole<T>(promesse: Promise<T>, actions: { interrompre: () => void; fermer: () => void }): Promise<T> {
    const brut = Boolean(this.input.isTTY && this.input.setRawMode);
    if (brut) this.input.setRawMode!(true);
    this.surTouche = (t) => (t === "fermer" ? actions.fermer() : actions.interrompre());
    try {
      return await promesse;
    } finally {
      this.surTouche = null;
      if (brut) this.input.setRawMode!(false);
    }
  }

  fermer(): void {
    this.surTouche = null;
    if (this.input.isTTY && this.input.setRawMode) this.input.setRawMode(false);
    this.input.off?.("data", this.recevoir);
    this.input.pause?.();
  }
}
