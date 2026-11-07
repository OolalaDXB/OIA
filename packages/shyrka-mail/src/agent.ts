import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { horsDepot } from "./chemins.js";
import { EXCLUSIONS_PAR_DEFAUT, verifierEntete, verifierMessage, type ConfigExclusions } from "./exclusions.js";
import { GROUPES, LIBELLES, type BoiteAuxLettres, type Classeur, type Groupe, type Message, type Redacteur } from "./types.js";

export interface ResultatMatin {
  date: string;
  /** Nombre de messages exclus (liste de Mickaël, ou doute) : ni lus par un modèle, ni classés, ni résumés. */
  exclus: number;
  groupes: Record<Groupe, { id: string; de: string; objet: string; brouillon?: string }[]>;
  brouillons: number;
}

/** Retire le gabarit (commentaires et lignes d'aide) de docs/shyrka/style.md : il ne reste que ce que Mickaël a écrit. */
export function lireStyle(contenu: string): string {
  return contenu
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .filter((l) => !l.startsWith("#") && !l.startsWith(">") && l.trim() !== "")
    .join("\n")
    .trim();
}

/**
 * Tri du matin (mandat v6, B3) :
 * 1. liste les en-têtes, et écarte les exclus sans lire leur corps ;
 * 2. lit les autres, et écarte ceux dont le corps mentionne un mot exclu ;
 * 3. classe le reste en quatre groupes, avec un classeur local ;
 * 4. prépare un brouillon pour chaque « réponse simple », si le palier le permet ;
 * 5. produit le résumé du matin en Markdown.
 *
 * Aucun envoi : la boîte n'en a pas la fonction.
 */
export async function trierLeMatin(deps: {
  boite: BoiteAuxLettres;
  classeur: Classeur;
  redacteur: Redacteur;
  style: string;
  /** Palier de l'agent courrier, lu par palierCourrier() : 1 ou plus pour créer des brouillons. */
  palier: 0 | 1 | 2;
  exclusions?: ConfigExclusions;
  limite?: number;
  date?: string;
}): Promise<ResultatMatin> {
  const cfg = deps.exclusions ?? EXCLUSIONS_PAR_DEFAUT;
  const groupes = Object.fromEntries(GROUPES.map((g) => [g, []])) as unknown as ResultatMatin["groupes"];
  let exclus = 0;
  let brouillons = 0;
  for (const e of await deps.boite.lister({ limite: deps.limite ?? 50 })) {
    if (verifierEntete(e, cfg).exclu) {
      exclus += 1;
      continue;
    }
    let m: Message;
    try {
      m = await deps.boite.lire(e.id);
    } catch {
      exclus += 1; // illisible : doute, donc exclu
      continue;
    }
    if (verifierMessage(m, cfg).exclu) {
      exclus += 1;
      continue;
    }
    const g = await deps.classeur.classer(m);
    const ligne: ResultatMatin["groupes"][Groupe][number] = { id: m.id, de: m.de, objet: m.objet };
    if (g === "reponse-simple" && deps.palier >= 1) {
      const corps = await deps.redacteur.rediger(m, deps.style);
      const { id } = await deps.boite.creerBrouillon({ a: m.de, objet: m.objet.startsWith("Re:") ? m.objet : `Re: ${m.objet}`, corps, enReponseA: m.id });
      ligne.brouillon = id;
      brouillons += 1;
    }
    groupes[g].push(ligne);
  }
  return { date: deps.date ?? new Date().toISOString().slice(0, 10), exclus, groupes, brouillons };
}

/** Résumé du matin, en Markdown. La ligne « Courrier : » est lue à voix haute par `pnpm shyrka:resume`. */
export function resumeMarkdown(r: ResultatMatin): string {
  const n = (g: Groupe) => r.groupes[g].length;
  const lignes = [
    `# Courrier du ${r.date}`,
    "",
    `Courrier : ${n("pour-toi")} pour toi, ${n("reponse-simple")} réponses simples (${r.brouillons} brouillons prêts, rien n'est envoyé), ${n("information")} informations, ${n("bruit")} bruit.${r.exclus ? ` ${r.exclus} messages exclus, non lus.` : ""}`,
    "",
  ];
  for (const g of GROUPES) {
    lignes.push(`## ${LIBELLES[g]} (${n(g)})`, "");
    if (!n(g)) lignes.push("- (aucun)");
    for (const l of r.groupes[g]) lignes.push(`- ${l.de.replace(/\s*<[^>]*>/, "")} · ${l.objet}${l.brouillon ? " · brouillon prêt" : ""}`);
    lignes.push("");
  }
  return lignes.join("\n");
}

/** Écrit le résumé hors du dépôt (refus sinon, lien symbolique compris). */
export function ecrireResume(r: ResultatMatin, dossier: string): string {
  const chemin = horsDepot(join(dossier, `resume-${r.date}.md`));
  mkdirSync(dirname(chemin), { recursive: true });
  writeFileSync(chemin, resumeMarkdown(r), "utf8");
  return chemin;
}
