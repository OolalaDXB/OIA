import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TextModel } from "./types.js";

/** Racine du dépôt OIA, déduite de l'emplacement de ce fichier (infra/shyrka/src). */
export const RACINE_DEPOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Chemin réel, liens symboliques résolus, même si le fichier n'existe pas
 * encore : on remonte jusqu'au premier parent existant.
 */
export function cheminReel(chemin: string): string {
  let p = resolve(chemin);
  const reste: string[] = [];
  while (!existsSync(p)) {
    const parent = dirname(p);
    if (parent === p) break;
    reste.unshift(p.slice(parent.length + 1));
    p = parent;
  }
  const base = existsSync(p) ? realpathSync(p) : p;
  return resolve(base, ...reste);
}

export function estDans(chemin: string, dossier: string): boolean {
  const rel = relative(cheminReel(dossier), cheminReel(chemin));
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Refuse tout chemin de sortie situé dans le dépôt, y compris par un lien
 * symbolique (amendement, § 4). Enregistrements, transcriptions, brouillons
 * et jetons restent hors du dépôt.
 */
export function refuserDansLeDepot(chemin: string, depot: string = RACINE_DEPOT): string {
  if (estDans(chemin, depot)) {
    throw new Error(`Refus : ${chemin} se trouve dans le dépôt (${cheminReel(chemin)}). Les données personnelles restent hors du dépôt.`);
  }
  return cheminReel(chemin);
}

/** Shyrka n'appelle aucun modèle en ligne : seul un modèle local (Ollama) ou simulé est accepté. */
export function assertModeleLocal(model: TextModel): void {
  if (!/^(ollama|simule):/.test(model.name)) {
    throw new Error(`Modèle « ${model.name} » refusé : Shyrka v0 n'appelle que des modèles locaux.`);
  }
}
