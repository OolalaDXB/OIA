import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { etatOia } from "../../contexte.js";
import { RACINE_DEPOT } from "../../local.js";
import { DOSSIER_CONFIG, REGLAGES, revision } from "../config.js";
import { evaluerMemoire, evaluerRecherche, JeuMemoire, JeuRecherche } from "./connaissances.js";
import { evaluerRoutage, JeuRoutage, type ResultatBanc } from "./routage.js";
import { intervalleWilson, texteMesure, type Mesure } from "./stats.js";

/**
 * Registre des capacités et banc d'évaluation (mandat v11, bloc A).
 *
 * - Les définitions (périmètre, métrique, seuil fixé AVANT le test) sont
 *   versionnées : `infra/shyrka/executive/capacites.json`.
 * - Les résultats sont consignés hors du dépôt, en ajout seul :
 *   `~/.oia/shyrka-executive/eval/resultats.jsonl`.
 * - Le jeu tenu à l'écart vit dans `~/.oia/shyrka-executive/eval/tenu/`
 *   (0600) : seuls son empreinte et le résultat agrégé sont consignés et
 *   affichés, jamais ses cas ni ses réponses attendues.
 */

export const STATUTS_CAPACITE = ["NON_TESTE", "LIMITE", "VALIDE", "REGRESSE"] as const;
export type StatutCapacite = (typeof STATUTS_CAPACITE)[number];

const Capacite = z.object({
  id: z.string(),
  perimetre: z.string(),
  outil: z.string(),
  metrique: z.string(),
  seuil: z.record(z.number()),
  effectifMin: z.number().int().positive(),
  ensembles: z.array(z.string()),
  familles: z.array(z.string()).optional(),
  environnement: z.enum(["reel", "simule", "aucun"]),
  automatisation: z.string(),
  commande: z.string().nullable(),
  source: z.string().optional(),
  nonTesteParce: z.string().optional(),
});
export type Capacite = z.infer<typeof Capacite>;
const Registre = z.object({ format: z.literal("shyrka.capacites"), version: z.literal(1), regle: z.string(), capacites: z.array(Capacite) });

export const DOSSIER_JEUX = join(DOSSIER_CONFIG, "eval");
export const dossierEval = () => join(REGLAGES.dossierOps, "eval");
export const fichierTenu = (banc: string) => join(dossierEval(), "tenu", `${banc}.json`);

export function chargerCapacites(fichier = join(DOSSIER_CONFIG, "capacites.json")): Capacite[] {
  return Registre.parse(JSON.parse(readFileSync(fichier, "utf8"))).capacites;
}

/** Un résultat consigné : agrégé, daté, rattaché au code mesuré et à l'empreinte du jeu. */
export interface Resultat {
  le: string;
  capacite: string;
  ensemble: string;
  code: { sha: string; modifie: boolean; racine: string; candidat: string | null };
  empreinteJeu: string;
  environnement: "reel" | "simule";
  isole: boolean;
  mesures: Record<string, Mesure>;
  compteurs: Record<string, number>;
  /** Détail par cas : jamais pour le jeu tenu à l'écart. */
  echecs?: string[];
  erreur?: string;
}

export function empreinte(fichier: string): string {
  return createHash("sha256").update(readFileSync(fichier)).digest("hex");
}

export function consigner(r: Resultat, dossier = dossierEval()): void {
  mkdirSync(dossier, { recursive: true, mode: 0o700 });
  appendFileSync(join(dossier, "resultats.jsonl"), `${JSON.stringify(r)}\n`, { mode: 0o600 });
}

export function resultats(dossier = dossierEval()): Resultat[] {
  const f = join(dossier, "resultats.jsonl");
  if (!existsSync(f)) return [];
  return readFileSync(f, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Resultat);
}

function jeuRoutage(ensemble: string): { cas: z.infer<typeof JeuRoutage>["cas"]; fichier: string } | null {
  const fichier = ensemble === "tenu" ? fichierTenu("routage") : join(DOSSIER_JEUX, `routage.${ensemble}.json`);
  if (!existsSync(fichier)) return null;
  return { cas: JeuRoutage.parse(JSON.parse(readFileSync(fichier, "utf8"))).cas, fichier };
}

/** Mesures d'un banc de routage restreint à des familles. */
export function mesuresRoutage(b: ResultatBanc, familles?: string[]): { mesures: Record<string, Mesure>; compteurs: Record<string, number> } {
  const v = familles ? b.verdicts.filter((x) => familles.includes(x.famille)) : b.verdicts;
  return {
    mesures: { exactitude: intervalleWilson(v.filter((x) => x.correct).length, v.length) },
    compteurs: { n: v.length, fauxPositifsListe: v.filter((x) => x.fauxPositifListe).length, fauxNegatifsListe: v.filter((x) => x.fauxNegatifListe).length, appelsInutiles: v.filter((x) => x.appelInutile).length },
  };
}

export interface OptionsRun {
  /** Racine d'une copie candidate (vérificateur) ; main par défaut. */
  code?: string;
  candidat?: string | null;
  ensembles?: string[];
  consigner?: boolean;
}

/**
 * Exécute les bancs d'une capacité. Pour le jeu tenu à l'écart, ne rend que
 * l'agrégat (aucun identifiant de cas, aucun texte).
 */
export function executerCapacite(id: string, opts: OptionsRun = {}): Resultat[] {
  const caps = chargerCapacites();
  const cap = caps.find((c) => c.id === id);
  if (!cap) throw new Error(`capacité inconnue : ${id}`);
  const rev = revision();
  const base = { le: new Date().toISOString(), code: { sha: rev.sha, modifie: rev.modifie, racine: opts.code ?? RACINE_DEPOT, candidat: opts.candidat ?? null } };
  const out: Resultat[] = [];
  if (id === "routage.decisions" || id === "routage.continuite") {
    const decisions = etatOia(RACINE_DEPOT).decisionsDetail ?? [];
    for (const ensemble of opts.ensembles ?? ["developpement", "regression", "tenu"]) {
      const j = jeuRoutage(ensemble);
      if (!j) {
        out.push({ ...base, capacite: id, ensemble, empreinteJeu: "absent", environnement: "reel", isole: false, mesures: {}, compteurs: {}, erreur: "jeu absent" });
        continue;
      }
      const b = evaluerRoutage(j.cas, decisions, { ensemble, ...(opts.code ? { racineCode: opts.code } : {}) });
      // Un même passage du banc note les deux capacités de routage, chacune sur ses familles.
      for (const c of id === "routage.decisions" ? caps.filter((x) => x.id.startsWith("routage.")) : [cap]) {
        if (!c.ensembles.includes(ensemble)) continue;
        const m = mesuresRoutage(b, c.familles);
        if (!m.compteurs.n) continue;
        const echecs = ensemble === "tenu" ? undefined : b.verdicts.filter((v) => c.familles?.includes(v.famille) && !v.correct).map((v) => `${v.id} : attendu ${v.attendu}, observé ${v.observe}${v.observe === v.attendu ? " (identifiants ou intitulés différents)" : ""}`);
        out.push({ ...base, capacite: c.id, ensemble, empreinteJeu: empreinte(j.fichier), environnement: "reel", isole: b.isole, mesures: m.mesures, compteurs: m.compteurs, ...(echecs ? { echecs } : {}), ...(b.erreur ? { erreur: b.erreur } : {}) });
      }
    }
  } else if (id === "memoire.rappel") {
    const fichier = join(DOSSIER_JEUX, "memoire.regression.json");
    const r = evaluerMemoire(JeuMemoire.parse(JSON.parse(readFileSync(fichier, "utf8"))));
    out.push({ ...base, capacite: id, ensemble: "regression", empreinteJeu: empreinte(fichier), environnement: "reel", isole: false, mesures: { rappel: r.rappel, premierRang: r.premierRang, oublisRespectes: r.oublisRespectes }, compteurs: { n: r.rappel.n, processus: r.processus, restaurationEcartee: r.restaurationEcartee ? 1 : 0 } });
  } else if (id === "recherche.sourcee") {
    const fichier = join(DOSSIER_JEUX, "recherche.regression.json");
    const r = evaluerRecherche(JeuRecherche.parse(JSON.parse(readFileSync(fichier, "utf8"))));
    out.push({ ...base, capacite: id, ensemble: "regression", empreinteJeu: empreinte(fichier), environnement: "reel", isole: false, mesures: { sourceTrouvee: r.sourceTrouvee, sansPreuveRefuse: r.sansPreuveRefuse, referencesCompletes: r.referencesCompletes }, compteurs: { n: r.sourceTrouvee.n + r.sansPreuveRefuse.n }, echecs: r.echecs });
  } else throw new Error(`${id} : pas de banc exécutable (${cap.nonTesteParce ?? `mesurée par ${cap.source ?? "—"}`})`);
  if (opts.consigner !== false) for (const r of out) consigner(r);
  return out;
}

/** Vrai si un résultat atteint chacun des seuils de sa capacité. */
export function atteintSeuil(cap: Capacite, r: Resultat): boolean {
  if (r.erreur) return false;
  return Object.entries(cap.seuil).every(([k, s]) => {
    if (k in r.mesures) {
      const m = r.mesures[k]!;
      return m.n > 0 && m.k / m.n >= s;
    }
    if (k in r.compteurs) return r.compteurs[k]! <= s;
    return false;
  });
}

export interface EtatCapacite {
  capacite: Capacite;
  statut: StatutCapacite;
  raison: string;
  derniers: Resultat[];
}

/**
 * Verdict d'une capacité à partir des derniers résultats sur main (pas
 * d'un candidat), ensemble par ensemble. Jamais VALIDE sur un seul cas, un
 * test simulé, un effectif insuffisant ou sans le jeu tenu à l'écart requis.
 */
export function statutCapacite(cap: Capacite, tous: Resultat[], externe?: { statut: StatutCapacite; raison: string }): EtatCapacite {
  if (externe) return { capacite: cap, statut: externe.statut, raison: externe.raison, derniers: [] };
  const surMain = tous.filter((r) => r.capacite === cap.id && !r.code.candidat);
  if (!cap.ensembles.length || !surMain.length) return { capacite: cap, statut: "NON_TESTE", raison: cap.nonTesteParce ?? "aucun résultat consigné", derniers: [] };
  const derniers = cap.ensembles.map((e) => surMain.filter((r) => r.ensemble === e).at(-1)).filter((r): r is Resultat => Boolean(r));
  const manquants = cap.ensembles.filter((e) => !derniers.some((r) => r.ensemble === e));
  const n = derniers.reduce((a, r) => a + (r.compteurs.n ?? 0), 0);
  const tousAtteints = derniers.every((r) => atteintSeuil(cap, r));
  // REGRESSE : un ensemble a déjà atteint son seuil sur main, et son dernier résultat ne l'atteint plus.
  const regresse = derniers.some((r) => !atteintSeuil(cap, r) && surMain.some((p) => p.ensemble === r.ensemble && p.le < r.le && atteintSeuil(cap, p)));
  if (regresse) return { capacite: cap, statut: "REGRESSE", raison: "sous le seuil après l'avoir atteint", derniers };
  if (derniers.some((r) => r.environnement !== "reel")) return { capacite: cap, statut: "LIMITE", raison: "test simulé seulement", derniers };
  if (manquants.length) return { capacite: cap, statut: "LIMITE", raison: `ensemble(s) non exécuté(s) : ${manquants.join(", ")}`, derniers };
  if (n < cap.effectifMin) return { capacite: cap, statut: "LIMITE", raison: `effectif ${n} < ${cap.effectifMin}`, derniers };
  if (!tousAtteints) return { capacite: cap, statut: "LIMITE", raison: `seuil non atteint sur : ${derniers.filter((r) => !atteintSeuil(cap, r)).map((r) => r.ensemble).join(", ")}`, derniers };
  return { capacite: cap, statut: "VALIDE", raison: `seuils atteints sur ${derniers.map((r) => r.ensemble).join(", ")} (n = ${n})`, derniers };
}

export function texteResultat(r: Resultat): string {
  const m = Object.entries(r.mesures).map(([k, v]) => `${k} ${texteMesure(v)}`).join(" · ");
  const c = Object.entries(r.compteurs).filter(([k]) => k !== "n").map(([k, v]) => `${k} ${v}`).join(" · ");
  return `${r.capacite} [${r.ensemble}] ${m}${c ? ` · ${c}` : ""}${r.isole ? " · isolé" : ""}${r.erreur ? ` · ERREUR ${r.erreur}` : ""} · jeu ${r.empreinteJeu.slice(0, 12)} · code ${r.code.candidat ? `candidat ${r.code.candidat.slice(0, 12)}` : r.code.sha.slice(0, 12)}`;
}
