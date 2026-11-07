import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { RACINE_DEPOT, estDans } from "./local.js";

/**
 * Contexte en lecture seule pour Shyrka (mandat v6, B1 ; amendement, § 3) :
 * rapports, état de J0, décisions en attente, budget. Rien d'autre, aucune
 * écriture. Chaque lecture passe par une liste blanche de chemins.
 */
export const LISTE_BLANCHE = [
  "infra/visibility/reports",
  "infra/shyrka/reports",
  "infra/visibility/subjects",
  "infra/visibility/scripts/cost-guard.sh",
  "docs/roadmap-oia-shyrka-souffleur.md",
] as const;

/** Dans les sujets, seuls les fichiers de fenêtre de mesure sont lus (état de J0). */
const FICHIERS_SUJET = /\/subjects\/[^/]+\/measurement\.yaml$/;

export function lectureAutorisee(chemin: string, depot: string = RACINE_DEPOT): boolean {
  const rel = relative(depot, chemin).split("\\").join("/");
  if (rel.startsWith("..") || !estDans(chemin, depot)) return false;
  const ok = LISTE_BLANCHE.some((p) => rel === p || rel.startsWith(`${p}/`));
  if (!ok) return false;
  if (rel.startsWith("infra/visibility/subjects/")) return FICHIERS_SUJET.test(`/${rel}`);
  return true;
}

function lire(chemin: string, depot: string): string | null {
  if (!lectureAutorisee(chemin, depot)) throw new Error(`Lecture refusée hors du périmètre de Shyrka : ${relative(depot, chemin)}`);
  return existsSync(chemin) ? readFileSync(chemin, "utf8") : null;
}

export interface EtatOia {
  rapports: { fichier: string; titre: string }[];
  fenetres: { sujet: string; id: string; statut: string; debut?: string; jours?: number }[];
  decisions: string[];
  budget: { plafond: number; alerte: number };
  resumeCourrier?: string;
}

/** Construit l'état d'OIA depuis les fichiers du dépôt. Aucune écriture, aucun réseau. */
export function etatOia(depot: string = RACINE_DEPOT): EtatOia {
  const rapports: EtatOia["rapports"] = [];
  for (const dossier of ["infra/visibility/reports", "infra/shyrka/reports"]) {
    const abs = join(depot, dossier);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs).filter((n) => /^\d{4}-\d{2}-\d{2}.*\.md$/.test(n))) {
      const texte = lire(join(abs, f), depot) ?? "";
      rapports.push({ fichier: `${dossier}/${f}`, titre: (/^#\s+(.+)$/m.exec(texte)?.[1] ?? f).trim() });
    }
  }
  rapports.sort((a, b) => b.fichier.split("/").pop()!.localeCompare(a.fichier.split("/").pop()!));

  const fenetres: EtatOia["fenetres"] = [];
  const sujets = join(depot, "infra/visibility/subjects");
  if (existsSync(sujets)) {
    for (const s of readdirSync(sujets)) {
      const texte = lire(join(sujets, s, "measurement.yaml"), depot);
      if (!texte) continue;
      const bloc = texte.split(/^windows:\s*$/m)[1]?.split(/^\S/m)[0] ?? "";
      for (const w of bloc.split(/^\s+- id:\s*/m).slice(1)) {
        const id = w.split("\n")[0]!.trim();
        const statut = /status:\s*(\S+)/.exec(w)?.[1] ?? "inconnu";
        const debut = /start:\s*"?([\d-]+)"?/.exec(w)?.[1];
        const jours = /days:\s*(\d+)/.exec(w)?.[1];
        fenetres.push({ sujet: s, id, statut, ...(debut ? { debut } : {}), ...(jours ? { jours: Number(jours) } : {}) });
      }
    }
  }

  const roadmap = lire(join(depot, "docs/roadmap-oia-shyrka-souffleur.md"), depot) ?? "";
  const section = roadmap.split(/^## Décisions ouvertes\s*$/m)[1]?.split(/^## /m)[0] ?? "";
  const decisions = [...section.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1]!.replace(/`/g, "").trim());

  const guard = lire(join(depot, "infra/visibility/scripts/cost-guard.sh"), depot) ?? "";
  const plafond = Number(/cap="\$\{cap:-(\d+)\}"/.exec(guard)?.[1] ?? 30);
  const alerte = Number(/alert="\$\{alert:-(\d+)\}"/.exec(guard)?.[1] ?? 24);

  return { rapports, fenetres, decisions, budget: { plafond, alerte } };
}

/** Résumé du jour, en phrases courtes, lisible à voix haute. */
export function resumeDuJour(e: EtatOia, aujourdhui: Date = new Date()): string {
  const lignes: string[] = [];
  const enCours = e.fenetres.filter((f) => f.statut === "running");
  for (const f of enCours) {
    const jour = f.debut ? Math.floor((Date.UTC(aujourdhui.getUTCFullYear(), aujourdhui.getUTCMonth(), aujourdhui.getUTCDate()) - Date.parse(`${f.debut}T00:00:00Z`)) / 86_400_000) + 1 : undefined;
    lignes.push(`La fenêtre ${f.id.toUpperCase()} de ${f.sujet} est en cours${jour && f.jours ? `, jour ${Math.min(jour, f.jours)} sur ${f.jours}` : ""}.`);
  }
  if (enCours.length === 0) lignes.push("Aucune fenêtre de mesure n'est en cours.");
  lignes.push(`Budget : plafond de ${e.budget.plafond} dollars par mois, alerte à ${e.budget.alerte}. La dépense réelle se lit chez chaque fournisseur.`);
  lignes.push(e.decisions.length ? `${e.decisions.length} décisions t'attendent. La première : ${e.decisions[0]}` : "Aucune décision ouverte dans la roadmap.");
  if (e.rapports[0]) lignes.push(`Dernier rapport : ${e.rapports[0].titre}.`);
  if (e.resumeCourrier) lignes.push(e.resumeCourrier);
  return lignes.join("\n");
}
