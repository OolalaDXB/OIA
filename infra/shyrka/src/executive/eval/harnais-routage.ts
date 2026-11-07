import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/**
 * Harnais du banc de routage (mandat v11, A2). Processus enfant, lancé par
 * le vérificateur sous sandbox-exec : il reçoit sur l'entrée standard des
 * répliques SANS réponse attendue, les joue dans une vraie session de
 * Shyrka chargée depuis `--code <racine>` (main ou copie candidate), et
 * rend ce qui a été observé. La notation se fait dans le parent, qui seul
 * connaît les réponses attendues.
 *
 * Le modèle est simulé : on mesure le routage par le code (liste,
 * explication, modèle), pas la qualité d'une réponse de modèle.
 */

export interface Replique {
  id: string;
  /** Tours précédents (continuité : « Explique D01 » puis « pourquoi celle-là ? »). */
  avant?: string[];
  texte: string;
}

export interface Observation {
  id: string;
  reponse: string;
  appelsModele: number;
  erreur?: string;
}

async function main(): Promise<void> {
  const i = process.argv.indexOf("--code");
  const racine = i >= 0 ? process.argv[i + 1]! : join(import.meta.dirname, "../../../../..");
  const src = (f: string) => pathToFileURL(join(racine, "infra/shyrka/src", f)).href;
  const { ShyrkaSession } = (await import(src("session.ts"))) as typeof import("../../session.js");
  const { SimulatedTextModel, RecordingSpeaker } = (await import(src("adapters/simulated.ts"))) as typeof import("../../adapters/simulated.js");
  const { IDENTITY_V0 } = (await import(src("identity.ts"))) as typeof import("../../identity.js");
  const repliques = JSON.parse(readFileSync(0, "utf8")) as Replique[];
  const out: Observation[] = [];
  for (const r of repliques) {
    const model = new SimulatedTextModel("réponse simulée du modèle");
    const s = new ShyrkaSession({ model, speaker: new RecordingSpeaker(), identity: { ...IDENTITY_V0, voixEnSortie: false }, print: () => {} });
    try {
      for (const a of r.avant ?? []) await s.textTurn(a);
      const avant = model.calls.length;
      const t = await s.textTurn(r.texte);
      out.push({ id: r.id, reponse: t.answer ?? "", appelsModele: model.calls.length - avant });
    } catch (e) {
      out.push({ id: r.id, reponse: "", appelsModele: 0, erreur: (e as Error).message.slice(0, 200) });
    }
  }
  process.stdout.write(JSON.stringify(out));
}

void main();
