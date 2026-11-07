import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { RACINE_DEPOT } from "../local.js";
import type { ProjetConnu } from "../memoire/commandes.js";

/**
 * Configuration de Shyrka exécutive (mandat v10, blocs B à F). Les noms des
 * produits vivent dans `infra/shyrka/executive/portefeuille.json`, jamais
 * dans le moteur. Les réglages se changent par variables d'environnement,
 * sans recoder.
 */
export const DOSSIER_CONFIG = join(RACINE_DEPOT, "infra/shyrka/executive");

const env = process.env;
export const REGLAGES = {
  /** Données de fonctionnement (incidents, missions, notifications) : hors du dépôt, 0700. */
  dossierOps: env.SHYRKA_EXEC_DIR ?? join(homedir(), ".oia", "shyrka-executive"),
  /** Contrôles HTTP toutes les 15 minutes ; métadonnées GitHub toutes les 30. */
  intervalleHttpMin: Number(env.SHYRKA_EXEC_HTTP_MIN ?? 15),
  intervalleGithubMin: Number(env.SHYRKA_EXEC_GITHUB_MIN ?? 30),
  /** Observations successives avant une alerte de disponibilité ordinaire. */
  observationsAvantAlerte: Number(env.SHYRKA_EXEC_SEUIL ?? 2),
  /** Briefing : 08:00, Asia/Dubai. */
  heureBrief: env.SHYRKA_EXEC_BRIEF ?? "08:00",
  fuseau: env.SHYRKA_EXEC_FUSEAU ?? "Asia/Dubai",
  /** Une source plus vieille que ce seuil est « ancienne ». */
  fraicheurHeures: Number(env.SHYRKA_EXEC_FRAICHEUR_H ?? 26),
  /** Plafond de sortie d'une collecte HTTP. */
  maxOctetsHttp: 512 * 1024,
  delaiHttpMs: 10_000,
};

const Http = z.object({ url: z.string().url().startsWith("https://"), confirme: z.boolean(), preuve: z.string(), attendu: z.array(z.number()).optional() });
const Produit = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  nom: z.string(),
  noms: z.array(z.string()),
  priorite: z.enum(["approfondie", "standard"]),
  depots: z.array(z.object({ repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/), branche: z.string(), confirme: z.boolean() })),
  http: z.array(Http),
  vercel: z.array(z.object({ projet: z.string(), id: z.string(), confirme: z.boolean() })),
  supabase: z.object({ ref: z.string(), confirme: z.boolean(), preuve: z.string() }).nullable().optional(),
  local: z.array(z.enum(["visibility", "money-lookup"])).optional(),
  ambiguites: z.array(z.string()),
});
export type Produit = z.infer<typeof Produit>;
const Portefeuille = z.object({ format: z.literal("shyrka.portefeuille"), version: z.literal(1), verifie_le: z.string(), produits: z.array(Produit) });

export function chargerPortefeuille(fichier = join(DOSSIER_CONFIG, "portefeuille.json")): Produit[] {
  return Portefeuille.parse(JSON.parse(readFileSync(fichier, "utf8"))).produits;
}

/** Projets connus de la mémoire : slugs et noms du portefeuille. */
export function projetsConnus(): ProjetConnu[] {
  try {
    return chargerPortefeuille().map((p) => ({ slug: p.slug, noms: [p.nom, ...p.noms] }));
  } catch {
    return [];
  }
}

/** Liste blanche des hôtes HTTP : seulement les URL confirmées du portefeuille. */
export function hotesAutorises(produits: Produit[]): Set<string> {
  return new Set(produits.flatMap((p) => p.http.filter((h) => h.confirme).map((h) => new URL(h.url).host)));
}

/**
 * Chemins du code de Shyrka : ce qui, modifié, change le comportement du
 * service. Les mandats, rapports et notes Markdown n'en font pas partie
 * (défaut v10 : un mandat non suivi dans infra/shyrka/mandats faisait
 * refuser le service et demander une réinstallation inutile).
 */
export const CHEMINS_CODE = ["infra/shyrka", "packages/shyrka", ":(exclude)infra/shyrka/mandats", ":(exclude)infra/shyrka/reports", ":(exclude,glob)infra/shyrka/*.md", ":(exclude,glob)packages/shyrka/*.md"];

/** Révision du code qui tourne : SHA de HEAD, et vrai si le code de Shyrka a des modifications locales. */
export function revision(depot = RACINE_DEPOT): { sha: string; modifie: boolean } {
  try {
    const sha = execFileSync("git", ["-C", depot, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    const etat = execFileSync("git", ["-C", depot, "status", "--porcelain", "--", ...CHEMINS_CODE], { encoding: "utf8" }).trim();
    return { sha, modifie: etat.length > 0 };
  } catch {
    return { sha: "inconnu", modifie: true };
  }
}

/**
 * Pourquoi le service refuse un passage. Réinstaller n'est demandé que si le
 * code a changé depuis la révision installée ; des modifications locales
 * non commitées sur la même révision demandent de committer ou d'annuler,
 * pas de réinstaller (défaut v10).
 */
export function motifRefusService(codeChange: boolean, modifie: boolean): { cle: string; titre: string; journal: string } | null {
  if (codeChange) return { cle: "revision", titre: "Shyrka : le code a changé depuis la révision installée, réinstaller le service", journal: "code de Shyrka changé depuis la révision installée" };
  if (modifie) return { cle: "local", titre: "Shyrka : modifications locales non commitées du code ; la révision installée est la bonne, ne pas réinstaller", journal: "modifications locales non commitées du code de Shyrka" };
  return null;
}
