import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";
import type { ResultatEntretien } from "./session.js";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** Fiche de séance, au format de docs/shyrka/entretiens.md (« Après chaque séance »). */
export function ficheMarkdown(r: ResultatEntretien, fichiers: { transcription: string }): string {
  const min = Math.round(r.dureeMs / 60000);
  const liste = (els: { texte: string; theme?: string; statut: string }[]) =>
    els.length ? els.map((e) => `- ${e.texte}${e.theme ? ` (thème : ${e.theme})` : ""} · ${e.statut}`).join("\n") : "- (aucun)";
  return [
    `# Séance ${r.seance.numero} · ${r.seance.theme}`,
    "",
    "| Champ | Contenu |",
    "| --- | --- |",
    `| Séance | ${r.seance.numero}, ${r.seance.theme}, ${r.date}, ${min} min |`,
    `| Fichiers | ${fichiers.transcription} (aucun audio conservé par Shyrka) |`,
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

/**
 * Écrit transcription et fiche dans un dossier neuf, hors du dépôt. Refuse
 * d'écrire dans le dépôt OIA et n'écrase jamais une séance existante.
 */
export function ecrireSeance(r: ResultatEntretien, opts: { racine: string; depot: string; transcription: string }): { dossier: string } {
  const racine = resolve(opts.racine);
  const rel = relative(resolve(opts.depot), racine);
  if (!rel.startsWith("..") && !isAbsolute(rel)) {
    throw new Error(`Entretien : refus d'écrire dans le dépôt (${racine}). Choisir le volume chiffré Shyrka-corpus.`);
  }
  const base = `${r.date}_seance-${String(r.seance.numero).padStart(2, "0")}_${slug(r.seance.theme)}`;
  let dossier = join(racine, base);
  for (let i = 2; existsSync(dossier); i++) dossier = join(racine, `${base}_${i}`);
  mkdirSync(dossier, { recursive: true });
  writeFileSync(join(dossier, "transcription.txt"), opts.transcription, { encoding: "utf8", flag: "wx" });
  writeFileSync(join(dossier, "fiche.md"), ficheMarkdown(r, { transcription: join(dossier, "transcription.txt") }), { encoding: "utf8", flag: "wx" });
  return { dossier };
}
