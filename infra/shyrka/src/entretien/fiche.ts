import { existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { cheminReel, estDans, refuserDansLeDepot, RACINE_DEPOT } from "../local.js";
import type { ResultatEntretien } from "./session.js";

export const VOLUME_CORPUS = "/Volumes/Shyrka-corpus";
export const DOSSIER_ENTRETIENS = `${VOLUME_CORPUS}/brut/entretiens`;

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Un volume est monté si sa racine existe et n'est pas sur le même périphérique que son parent. */
export function volumeMonte(racine: string, stat: (p: string) => { dev: number } = statSync): boolean {
  if (!existsSync(racine)) return false;
  try {
    return stat(racine).dev !== stat(dirname(racine)).dev;
  } catch {
    return false;
  }
}

/**
 * Prépare le dossier de la séance. Refuse de démarrer si le volume chiffré
 * n'est pas monté, si le dossier de sortie n'est pas sur ce volume, ou s'il se
 * trouve dans le dépôt, y compris par un lien symbolique. N'écrase jamais une
 * séance existante.
 */
export function preparerDossierSeance(opts: {
  numero: number;
  theme: string;
  date: string;
  sortie?: string;
  volume?: string;
  depot?: string;
  estMonte?: (racine: string) => boolean;
}): string {
  const volume = opts.volume ?? VOLUME_CORPUS;
  const sortie = opts.sortie ?? join(volume, "brut", "entretiens");
  if (!(opts.estMonte ?? volumeMonte)(volume)) {
    throw new Error(`Entretien : le volume chiffré ${volume} n'est pas monté. Ouvre-le dans le Finder, puis relance.`);
  }
  refuserDansLeDepot(sortie, opts.depot ?? RACINE_DEPOT);
  if (!estDans(sortie, volume)) throw new Error(`Entretien : ${sortie} n'est pas sur le volume chiffré ${volume}.`);
  const base = `${opts.date}_seance-${String(opts.numero).padStart(2, "0")}_${slug(opts.theme)}`;
  let dossier = join(cheminReel(sortie), base);
  for (let i = 2; existsSync(dossier); i++) dossier = join(cheminReel(sortie), `${base}_${i}`);
  mkdirSync(dossier, { recursive: true });
  return dossier;
}

/** Fiche de séance, au format de docs/shyrka/entretiens.md (« Après chaque séance »). */
export function ficheMarkdown(r: ResultatEntretien, dossier: string): string {
  const min = Math.round(r.dureeMs / 60000);
  const liste = (els: { texte: string; theme?: string; statut: string }[]) =>
    els.length ? els.map((e) => `- ${e.texte}${e.theme ? ` (thème : ${e.theme})` : ""} · ${e.statut}`).join("\n") : r.extractionManquante ? "- À extraire (modèle local indisponible pendant la séance)." : "- (aucun)";
  return [
    `# Séance ${r.seance.numero} · ${r.seance.theme}`,
    "",
    "| Champ | Contenu |",
    "| --- | --- |",
    `| Séance | ${r.seance.numero}, ${r.seance.theme}, ${r.date}, ${min} min |`,
    `| Fichiers | ${dossier} : ${r.echanges.length} enregistrements, transcription.txt |`,
    "",
    "Tout ce qui suit est au statut « à valider » : rien n'entre dans la mémoire avant ta relecture.",
    "",
    "## À nettoyer avant validation",
    r.aNettoyer.length ? r.aNettoyer.map((x) => `- ${x}`).join("\n") : "- Rien de repéré automatiquement. Relire quand même : Swift, noms de tiers.",
    "",
    "## Règles",
    liste(r.regles),
    "",
    "## Exemples",
    liste(r.exemples),
    "",
    "## Formules",
    liste(r.formules),
    "",
    "## Contre-pied, à relire en ouverture de la séance suivante",
    r.contrePied ? `Voici ce que j'ai compris. ${r.contrePied} Où est-ce que je me trompe ?` : "- À préparer.",
    "",
    "## Contradictions",
    "- À relever en séance 10, en comparant avec les fiches précédentes.",
    "",
    "## Questions ouvertes",
    r.passees.length ? r.passees.map((q) => `- Passée : ${q}`).join("\n") : "- (aucune)",
    "",
    "## Retraits",
    r.retraits.length ? r.retraits.map((x) => `- Motif : ${x.motif}`).join("\n") : "- (aucun)",
    "",
  ].join("\n");
}

/** Écrit transcription et fiche dans le dossier de la séance (créé par preparerDossierSeance). */
export function ecrireFiche(r: ResultatEntretien, dossier: string, transcription: string, depot: string = RACINE_DEPOT): void {
  refuserDansLeDepot(dossier, depot);
  writeFileSync(join(dossier, "transcription.txt"), transcription, { encoding: "utf8", flag: "wx" });
  writeFileSync(join(dossier, "fiche.md"), ficheMarkdown(r, dossier), { encoding: "utf8", flag: "wx" });
}
