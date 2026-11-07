import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { RACINE_DEPOT } from "../local.js";
import { REGLAGES } from "./config.js";
import { creerCopie, diffCopie, empreinteDiff, type Copie } from "./copie.js";
import { Missions, RefusMission, type Mission } from "./missions.js";
import type { BaseOps } from "./operations.js";

/**
 * Dispatcher borné (mandat v11, bloc C). Prend une mission autorisée, la
 * réserve atomiquement (bail), lance un exécuteur VÉRIFIÉ dans un processus
 * séparé, surveille bail et délai, collecte la sortie, déclenche la
 * vérification séparée et consigne qui a fait quoi.
 *
 * Il refuse de démarrer : départs en pause, exécuteur non vérifié ou
 * indisponible, quota du jour atteint, mission d'écriture déjà en cours,
 * périmètre vide ou incohérent. Aucun repli caché vers une API payante :
 * l'exécuteur Claude Code est déclaré mais désactivé tant que sa route de
 * facturation n'est pas prouvée (T12).
 */

export const LIMITES = {
  missionsDevParJour: Number(process.env.SHYRKA_DISPATCH_DEV_JOUR ?? 2),
  ecrituresSimultanees: 1,
  tentativesParMission: 2,
  delaiDiagnosticMs: 5 * 60_000,
  bailMs: 10 * 60_000,
};

export interface Disponibilite {
  ok: boolean;
  raison: string;
}

export interface Executeur {
  id: string;
  /** diagnostic : sans écriture de code ; developpement : patch dans une copie isolée. */
  genre: "diagnostic" | "developpement";
  automatisation: "automatique" | "assiste";
  disponible(): Disponibilite;
}

/** Diagnostic local par Ollama : aucun réseau sortant du Mac, aucune dépense. */
export const EXECUTEUR_OLLAMA: Executeur = {
  id: "ollama-diagnostic",
  genre: "diagnostic",
  automatisation: "automatique",
  disponible() {
    const r = spawnSync("curl", ["-s", "-m", "3", "http://127.0.0.1:11434/api/tags"], { encoding: "utf8" });
    if (r.status !== 0) return { ok: false, raison: "Ollama ne répond pas sur 127.0.0.1:11434" };
    return /"qwen3:8b"/.test(r.stdout) ? { ok: true, raison: "qwen3:8b local" } : { ok: false, raison: "qwen3:8b absent d'Ollama" };
  },
};

/**
 * Claude Code non interactif (`claude -p`). Constaté le 2026-11-08 :
 * authentification claude.ai (abonnement Max), aucune variable
 * ANTHROPIC_API_KEY, aucun apiKeyHelper. NON constaté : le comportement en
 * dépassement de quota (usage supplémentaire facturé ou arrêt), ni une
 * séparation démontrée entre le canal du modèle et les outils isolés.
 * Désactivé tant que Mickaël n'a pas confirmé les deux (variable
 * SHYRKA_CLAUDE_CODE_AUTORISE=1 ET preuve consignée).
 */
export const EXECUTEUR_CLAUDE_CODE: Executeur = {
  id: "claude-code",
  genre: "developpement",
  automatisation: "automatique",
  disponible() {
    if (process.env.ANTHROPIC_API_KEY) return { ok: false, raison: "une clé API est présente dans l'environnement : risque de facturation à l'usage, refus" };
    if (process.env.SHYRKA_CLAUDE_CODE_AUTORISE !== "1") return { ok: false, raison: "route de facturation non prouvée (dépassement de quota non vérifiable depuis le CLI) et séparation réseau non démontrée : exécution autonome désactivée, mode assisté" };
    return { ok: false, raison: "autorisation présente, mais l'adaptateur de lancement n'est pas encore écrit ni testé (v11 : PARTIEL)" };
  },
};

/** Développement assisté : une session Claude Code interactive écrit le patch dans la copie préparée par le dispatcher. */
export const EXECUTEUR_ASSISTE: Executeur = {
  id: "assiste",
  genre: "developpement",
  automatisation: "assiste",
  disponible: () => ({ ok: true, raison: "patch écrit hors du dispatcher, dans la copie isolée qu'il a préparée" }),
};

export const EXECUTEURS: Record<string, Executeur> = { [EXECUTEUR_OLLAMA.id]: EXECUTEUR_OLLAMA, [EXECUTEUR_CLAUDE_CODE.id]: EXECUTEUR_CLAUDE_CODE, [EXECUTEUR_ASSISTE.id]: EXECUTEUR_ASSISTE };

function jour(iso: string): string {
  return iso.slice(0, 10);
}

/** Contrôles avant tout départ. Rend la raison du refus, ou null. */
export function refusDepart(ops: BaseOps, m: Mission, ex: Executeur, dispo: Disponibilite = ex.disponible()): string | null {
  if (ops.lireControle("pause") === "1") return "départs suspendus (pause)";
  if (ops.lireControle("arret") === "1") return "arrêt d'urgence actif";
  if (m.statut !== "en_file") return `mission ${m.statut}, pas en file`;
  if (!dispo.ok) return `exécuteur ${ex.id} indisponible : ${dispo.raison}`;
  if (ex.genre === "developpement") {
    if (!m.perimetre.fichiers.length || !m.perimetre.commandes.length) return "périmètre vide ou incohérent : fichiers et commandes de vérification requis";
    if (m.perimetre.fichiers.some((f) => f.includes("..") || f.startsWith("/"))) return "périmètre incohérent : chemin hors dépôt";
    const aujourdhui = jour(ops.maintenant());
    const departs = (ops.db.prepare("SELECT count(*) n FROM mission_journal WHERE note LIKE 'dispatch:depart developpement%' AND substr(le, 1, 10) = ?").get(aujourdhui) as { n: number }).n;
    if (departs >= LIMITES.missionsDevParJour) return `quota atteint : ${departs}/${LIMITES.missionsDevParJour} mission(s) de développement aujourd'hui, arrêt sans repli payant`;
  } else if (!m.objectif.trim() || !m.preuvesEntree.length) return "mission de diagnostic sans objectif ou sans preuve d'entrée";
  if (m.budgetUsd > 0) return "budget non nul : v11 n'autorise aucune dépense";
  return null;
}

function journal(ops: BaseOps, id: string, acteur: string, note: string): void {
  ops.db.prepare("INSERT INTO mission_journal (mission, le, acteur, de, vers, note) VALUES (?, ?, ?, NULL, NULL, ?)").run(id, ops.maintenant(), acteur, note.slice(0, 1000));
}

export interface SortieDiagnostic {
  diagnostic: string;
  cause_probable: string | null;
  preuves_citees: string[];
  confiance: "faible" | "moyenne" | "elevee";
  abstention: boolean;
}

/** Vérificateur séparé d'un diagnostic : forme, et aucune preuve citée qui ne soit pas dans la mission. */
export function verifierDiagnostic(m: Mission, brut: string): { verdict: "conforme" | "refuse"; motifs: string[]; sortie: SortieDiagnostic | null } {
  let s: SortieDiagnostic;
  try {
    s = JSON.parse(brut) as SortieDiagnostic;
  } catch {
    return { verdict: "refuse", motifs: ["sortie non JSON"], sortie: null };
  }
  const motifs: string[] = [];
  if (typeof s.diagnostic !== "string" || !s.diagnostic.trim()) motifs.push("diagnostic vide");
  if (!Array.isArray(s.preuves_citees)) motifs.push("preuves_citees absent");
  else for (const p of s.preuves_citees) if (!m.preuvesEntree.includes(p)) motifs.push(`preuve inventée ou hors mission : ${String(p).slice(0, 80)}`);
  if (!["faible", "moyenne", "elevee"].includes(s.confiance)) motifs.push("confiance non déclarée");
  if (!s.abstention && Array.isArray(s.preuves_citees) && s.preuves_citees.length === 0) motifs.push("conclusion sans preuve citée et sans abstention");
  return { verdict: motifs.length ? "refuse" : "conforme", motifs, sortie: s };
}

function attendre(cmd: string, args: string[], input: string, delaiMs: number, battement: () => void): Promise<{ code: number; stdout: string; stderr: string; pid: number | undefined; tue: boolean }> {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" } });
    let stdout = "";
    let stderr = "";
    let tue = false;
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => ((tue = true), p.kill("SIGTERM")), delaiMs);
    const b = setInterval(() => {
      try {
        battement();
      } catch {
        tue = true;
        p.kill("SIGTERM");
      }
    }, 20_000);
    p.on("close", (code) => {
      clearTimeout(t);
      clearInterval(b);
      resolve({ code: code ?? -1, stdout, stderr, pid: p.pid, tue });
    });
    p.stdin.end(input);
  });
}

export interface ResultatDispatch {
  mission: string;
  executeur: string;
  pid?: number;
  statut: string;
  detail: string;
}

/**
 * Lance une mission de diagnostic en file : réserve, exécute le processus
 * local, vérifie séparément, passe en attente de validation ou bloque.
 */
export async function dispatcherDiagnostic(ops: BaseOps, ref: string, par = "dispatcher", opts: { modele?: string } = {}): Promise<ResultatDispatch> {
  const ms = new Missions(ops);
  ms.reprendreExpires();
  const m0 = ms.obtenir(ref);
  const ex = EXECUTEURS[m0.agent === "diagnostic" ? EXECUTEUR_OLLAMA.id : m0.agent] ?? EXECUTEUR_OLLAMA;
  const refus = refusDepart(ops, m0, ex);
  if (refus) {
    journal(ops, m0.id, par, `dispatch:refus ${refus}`);
    throw new RefusMission(refus);
  }
  const m = ms.prendre(m0.id, par, LIMITES.bailMs);
  journal(ops, m.id, par, `dispatch:depart ${ex.genre} exécuteur ${ex.id} (${ex.automatisation})`);
  const tsx = join(RACINE_DEPOT, "infra/shyrka/node_modules/.bin/tsx");
  const script = join(RACINE_DEPOT, "infra/shyrka/src/executive/executeurs/diagnostic-ollama.ts");
  const t0 = Date.now();
  const r = await attendre(tsx, [script, ...(opts.modele ? ["--modele", opts.modele] : [])], JSON.stringify({ objectif: m.objectif, preuves: m.preuvesEntree }), LIMITES.delaiDiagnosticMs, () => ms.battement(m.id, par, LIMITES.bailMs));
  journal(ops, m.id, `executeur:${ex.id}`, `dispatch:sortie pid ${r.pid} code ${r.code}${r.tue ? " (arrêté : délai ou bail perdu)" : ""} en ${Date.now() - t0} ms`);
  const dossier = join(REGLAGES.dossierOps, "missions", m.id);
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  writeFileSync(join(dossier, `diagnostic-tentative-${m.tentatives}.json`), r.stdout, { mode: 0o600 });
  ms.passer(m.id, "en_verification", par, "sortie collectée, vérification séparée");
  const v = verifierDiagnostic(m, r.stdout.trim());
  journal(ops, m.id, "verificateur:diagnostic", `dispatch:verdict ${v.verdict}${v.motifs.length ? ` (${v.motifs.join(" ; ")})` : ""}`);
  const resultats = { executeur: ex.id, pid: r.pid, dureeMs: Date.now() - t0, sortie: join(dossier, `diagnostic-tentative-${m.tentatives}.json`), verdict: v.verdict, motifs: v.motifs, empreinteDiff: empreinteDiff(r.stdout) };
  if (v.verdict === "conforme") {
    const x = ms.passer(m.id, "attente_validation", "verificateur:diagnostic", "diagnostic conforme : à relire par Mickaël", { resultats });
    return { mission: m.id, executeur: ex.id, pid: r.pid, statut: x.statut, detail: v.sortie!.diagnostic.slice(0, 300) };
  }
  const x = m.tentatives >= m.tentativesMax ? ms.passer(m.id, "bloquee", "verificateur:diagnostic", "diagnostic refusé, tentatives épuisées", { resultats, cause: v.motifs.join(" ; ") }) : ms.passer(m.id, "echouee", "verificateur:diagnostic", "diagnostic refusé", { resultats, cause: v.motifs.join(" ; ") });
  return { mission: m.id, executeur: ex.id, pid: r.pid, statut: x.statut, detail: v.motifs.join(" ; ") };
}

/**
 * Développement assisté : le dispatcher réserve la mission et prépare la
 * copie isolée ; l'auteur (session Claude Code) y écrit ; `collecter` rend
 * le patch et son empreinte. Aucune intégration à main.
 */
export function preparerDeveloppement(ops: BaseOps, ref: string, par = "dispatcher"): { mission: Mission; copie: Copie } {
  const ms = new Missions(ops);
  ms.reprendreExpires();
  const m0 = ms.obtenir(ref);
  const ex = EXECUTEURS[m0.agent] ?? EXECUTEUR_ASSISTE;
  const refus = refusDepart(ops, m0, ex);
  if (refus) {
    journal(ops, m0.id, par, `dispatch:refus ${refus}`);
    throw new RefusMission(refus);
  }
  const m = ms.prendre(m0.id, par, 4 * 3_600_000);
  journal(ops, m.id, par, `dispatch:depart developpement exécuteur ${ex.id} (${ex.automatisation})`);
  const copie = creerCopie(m.shaBase);
  journal(ops, m.id, par, `dispatch:copie ${copie.racine} (git archive ${copie.sha.slice(0, 12)}, sans branche ni worktree)`);
  return { mission: ms.obtenir(m.id), copie };
}

export function collecterPatch(copie: Copie, sortie: string): { fichiers: string[]; empreinte: string; lignes: number } {
  const d = diffCopie(copie);
  writeFileSync(sortie, d.diff, { mode: 0o600 });
  return { fichiers: d.fichiers, empreinte: d.empreinte, lignes: d.diff.split("\n").length };
}

/** T15 : le patch présenté à Mickaël a-t-il changé depuis l'approbation ? */
export function patchInchange(fichier: string, empreinte: string): boolean {
  return existsSync(fichier) && empreinteDiff(readFileSync(fichier, "utf8")) === empreinte;
}
