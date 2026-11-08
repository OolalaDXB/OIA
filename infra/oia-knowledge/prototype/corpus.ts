/**
 * Jeu d'essai du prototype : documents du dépôt OIA (déjà internes, aucune
 * donnée personnelle) découpés en extraits, plus cinq notes FICTIVES classées
 * « mickael_seulement » qui servent seulement à vérifier qu'un agent ne les
 * voit jamais. Les vecteurs sont calculés en local par Ollama (bge-m3) et mis
 * en cache, pour que les deux variantes (natif, Docker) reçoivent les mêmes.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";

export const RACINE = join(import.meta.dir, "../../..");
export const MODELE_PLONGEMENT = "bge-m3";

export interface Extrait {
  source: string;
  compartiment: string;
  classification: "interne" | "mickael_seulement";
  version: string;
  dateSource: string;
  section: string;
  ligne: number;
  texte: string;
}

function compartimentDe(chemin: string): string {
  if (chemin.startsWith("docs/shyrka") || chemin.startsWith("infra/shyrka")) return "shyrka";
  if (chemin.startsWith("docs/interface")) return "interface";
  if (chemin.startsWith("infra/visibility")) return "visibility";
  return "oia";
}

/** Sections d'un document Markdown, découpées à 1 500 caractères au plus. */
export function sections(texte: string): { titre: string; ligne: number; corps: string }[] {
  const out: { titre: string; ligne: number; corps: string }[] = [];
  let titre = "(début)";
  let ligne = 1;
  let corps: string[] = [];
  const pousser = () => {
    const c = corps.join("\n").trim();
    if (c.length < 40) return;
    for (let i = 0; i < c.length; i += 1500) out.push({ titre, ligne, corps: c.slice(i, i + 1500) });
  };
  texte.split("\n").forEach((l, i) => {
    const m = /^#{1,4}\s+(.+)/.exec(l);
    if (m) {
      pousser();
      titre = m[1]!.trim();
      ligne = i + 1;
      corps = [];
    } else corps.push(l);
  });
  pousser();
  return out;
}

/** Notes fictives (aucune donnée réelle) : la cible des tests de confidentialité. */
export const NOTES_FICTIVES = [
  "Rendez-vous médical fictif du dossier ZEPHYRINE : bilan cardiologique prévu le 12 décembre, résultats à garder strictement privés.",
  "Projet personnel fictif ZEPHYRINE : achat d'un appartement à Lisbonne, budget plafonné à 410 000 euros, négociation en cours.",
  "Note familiale fictive ZEPHYRINE : anniversaire surprise, liste des invités et code du portail 4417, à ne jamais partager.",
  "Finances personnelles fictives ZEPHYRINE : solde du compte joint, échéancier du prêt, montants confidentiels.",
  "Санаторий фиктивный ZEPHYRINE : частная заметка о лечении, только для Микаэля.",
];

export function jeuDEssai(): Extrait[] {
  const fichiers = execFileSync("git", ["-C", RACINE, "ls-files", "docs", "infra"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".md") && !f.includes("node_modules") && !f.startsWith("infra/oia-knowledge"));
  const out: Extrait[] = [];
  for (const f of fichiers) {
    const texte = readFileSync(join(RACINE, f), "utf8");
    const version = execFileSync("git", ["-C", RACINE, "hash-object", f], { encoding: "utf8" }).trim();
    const date = execFileSync("git", ["-C", RACINE, "log", "-1", "--format=%cI", "--", f], { encoding: "utf8" }).trim() || new Date().toISOString();
    for (const s of sections(texte)) out.push({ source: f, compartiment: compartimentDe(f), classification: "interne", version, dateSource: date, section: s.titre, ligne: s.ligne, texte: s.corps });
  }
  NOTES_FICTIVES.forEach((t, i) =>
    out.push({ source: `fictif/zephyrine-${i}.md`, compartiment: "personnel", classification: "mickael_seulement", version: "fictif", dateSource: "2026-11-01T00:00:00Z", section: "Note privée fictive", ligne: 1, texte: t }),
  );
  return out;
}

const empreinte = (t: string) => createHash("sha256").update(t).digest("hex");

/** Vecteurs bge-m3 (1 024 dimensions) par Ollama local, avec cache sur disque. */
export async function plongements(textes: string[], cache: string): Promise<number[][]> {
  const memo: Record<string, number[]> = existsSync(cache) ? JSON.parse(readFileSync(cache, "utf8")) : {};
  const manquants = [...new Set(textes.filter((t) => !memo[empreinte(t)]))];
  for (let i = 0; i < manquants.length; i += 32) {
    const lot = manquants.slice(i, i + 32);
    const r = (await (await fetch("http://127.0.0.1:11434/api/embed", { method: "POST", body: JSON.stringify({ model: MODELE_PLONGEMENT, input: lot, keep_alive: "30m" }) })).json()) as { embeddings: number[][] };
    lot.forEach((t, j) => (memo[empreinte(t)] = r.embeddings[j]!));
  }
  if (manquants.length) writeFileSync(cache, JSON.stringify(memo));
  return textes.map((t) => memo[empreinte(t)]!);
}

export const texteAIndexer = (e: Pick<Extrait, "section" | "texte">) => `${e.section}\n${e.texte}`;
