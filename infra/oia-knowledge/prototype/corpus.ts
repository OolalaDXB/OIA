/**
 * Jeu d'essai du prototype (version 2) : documents du dépôt OIA (internes,
 * aucune donnée personnelle), notes FICTIVES « mickael_seulement » pour les
 * tests de confidentialité, et documentation publique installée sur le Mac
 * (Homebrew, node_modules) pour la montée en charge et comme distracteurs.
 *
 * Version 2 : extraits de 900 caractères au plus, chevauchement de 150, en-tête
 * de contexte (document › section) ; identifiants exacts extraits à part
 * (vues SQL, fichiers, migrations, décisions) pour une recherche qui ne
 * dépend pas des plongements. Vecteurs bge-m3 calculés en local, en cache.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { basename, join } from "node:path";

export const RACINE = join(import.meta.dir, "../../..");
export const MODELE_PLONGEMENT = "bge-m3";
const TAILLE = 900;
const CHEVAUCHEMENT = 150;

export interface Extrait {
  source: string;
  compartiment: string;
  classification: "interne" | "mickael_seulement";
  version: string;
  dateSource: string;
  titre: string;
  section: string;
  ligne: number;
  texte: string;
  identifiants: string[];
}

function compartimentDe(chemin: string): string {
  if (chemin.startsWith("docs/shyrka") || chemin.startsWith("infra/shyrka")) return "shyrka";
  if (chemin.startsWith("docs/interface")) return "interface";
  if (chemin.startsWith("infra/visibility")) return "visibility";
  return "oia";
}

/**
 * Identifiants exacts : mots avec _ . / ou chiffres collés (ml_toutes_v1,
 * 0008_money_lookup_v2.sql, cost-guard.sh, D07, v11). En minuscules.
 */
export function identifiants(texte: string): string[] {
  const out = new Set<string>();
  for (const m of texte.matchAll(/[A-Za-z0-9][A-Za-z0-9]*(?:[_./-][A-Za-z0-9]+)+/g)) {
    const t = m[0].toLowerCase().replace(/[.]+$/, "");
    if (/[_./]/.test(t) || /\d/.test(t)) if (t.length >= 4 && t.length <= 80 && !/^\d+([./-]\d+)*$/.test(t)) out.add(t);
  }
  for (const m of texte.matchAll(/\b[DdPp]\d{2,3}\b/g)) out.add(m[0].toLowerCase());
  return [...out];
}

/** Sections Markdown, puis fenêtres de TAILLE caractères avec chevauchement. */
export function sections(texte: string): { titre: string; ligne: number; corps: string }[] {
  const out: { titre: string; ligne: number; corps: string }[] = [];
  let titre = "(début)";
  let ligne = 1;
  let corps: string[] = [];
  const pousser = () => {
    const c = corps.join("\n").trim();
    if (c.length < 40) return;
    for (let i = 0; i < c.length; i += TAILLE - CHEVAUCHEMENT) {
      out.push({ titre, ligne, corps: c.slice(i, i + TAILLE) });
      if (i + TAILLE >= c.length) break;
    }
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

const titreDu = (texte: string, chemin: string) => /^#\s+(.+)/m.exec(texte)?.[1]?.trim() ?? basename(chemin);

/** Notes fictives (aucune donnée réelle) : la cible des tests de confidentialité. */
export const NOTES_FICTIVES = [
  "Rendez-vous médical fictif du dossier ZEPHYRINE : bilan cardiologique prévu le 12 décembre, résultats à garder strictement privés.",
  "Projet personnel fictif ZEPHYRINE : achat d'un appartement à Lisbonne, budget plafonné à 410 000 euros, négociation en cours.",
  "Note familiale fictive ZEPHYRINE : anniversaire surprise, liste des invités et code du portail 4417, à ne jamais partager.",
  "Finances personnelles fictives ZEPHYRINE : solde du compte joint, échéancier du prêt, montants confidentiels.",
  "Санаторий фиктивный ZEPHYRINE : частная заметка о лечении, только для Микаэля.",
];

export function jeuOia(): Extrait[] {
  const fichiers = execFileSync("git", ["-C", RACINE, "ls-files", "docs", "infra"], { encoding: "utf8" })
    .split("\n")
    .filter((f) => f.endsWith(".md") && !f.includes("node_modules") && !f.startsWith("infra/oia-knowledge"));
  const out: Extrait[] = [];
  for (const f of fichiers) {
    const texte = readFileSync(join(RACINE, f), "utf8");
    const version = execFileSync("git", ["-C", RACINE, "hash-object", f], { encoding: "utf8" }).trim();
    const date = execFileSync("git", ["-C", RACINE, "log", "-1", "--format=%cI", "--", f], { encoding: "utf8" }).trim() || new Date().toISOString();
    const titre = titreDu(texte, f);
    for (const s of sections(texte))
      out.push({ source: f, compartiment: compartimentDe(f), classification: "interne", version, dateSource: date, titre, section: s.titre, ligne: s.ligne, texte: s.corps, identifiants: identifiants(`${s.titre} ${s.corps}`) });
  }
  NOTES_FICTIVES.forEach((t, i) =>
    out.push({ source: `fictif/zephyrine-${i}.md`, compartiment: "personnel", classification: "mickael_seulement", version: "fictif", dateSource: "2026-11-01T00:00:00Z", titre: "Notes privées fictives", section: "Note privée fictive", ligne: 1, texte: t, identifiants: [] }),
  );
  return out;
}

/** Documentation publique installée (liste de chemins), HTML ramené au texte. Jusqu'à `max` extraits. */
export function jeuPublic(liste: string, max: number): Extrait[] {
  const out: Extrait[] = [];
  for (const chemin of readFileSync(liste, "utf8").split("\n").filter(Boolean)) {
    if (out.length >= max) break;
    let texte: string;
    try {
      texte = readFileSync(chemin, "utf8");
    } catch {
      continue;
    }
    if (chemin.endsWith(".html"))
      texte = texte.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<h[1-4][^>]*>/gi, "\n# ").replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/gi, " ").replace(/[ \t]+/g, " ");
    const titre = titreDu(texte, chemin);
    const id = `public/${chemin.replace(/^\/(opt\/homebrew|Users\/[^/]+\/OIA)\//, "")}`;
    for (const s of sections(texte)) {
      if (out.length >= max) break;
      out.push({ source: id, compartiment: "public", classification: "interne", version: "installe", dateSource: "2026-10-01T00:00:00Z", titre, section: s.titre, ligne: s.ligne, texte: s.corps, identifiants: identifiants(`${s.titre} ${s.corps}`) });
    }
  }
  return out;
}

const empreinte = (t: string) => createHash("sha256").update(t).digest("hex");

/** Vecteurs bge-m3 (1 024 dimensions) par Ollama local, en cache dans une petite base SQLite (binaire). */
export async function plongements(textes: string[], cache: string): Promise<number[][]> {
  const { Database } = await import("bun:sqlite");
  const db = new Database(cache);
  db.run("create table if not exists c (h text primary key, v blob not null)");
  const lire = db.prepare("select v from c where h = ?");
  const ecrire = db.prepare("insert or replace into c values (?, ?)");
  const cle = textes.map(empreinte);
  const manquants = [...new Set(textes.filter((_, k) => !lire.get(cle[k]!)))];
  for (let i = 0; i < manquants.length; i += 32) {
    const lot = manquants.slice(i, i + 32);
    const r = (await (await fetch("http://127.0.0.1:11434/api/embed", { method: "POST", body: JSON.stringify({ model: MODELE_PLONGEMENT, input: lot, keep_alive: "30m", truncate: true }) })).json()) as { embeddings: number[][] };
    db.transaction(() => lot.forEach((t, j) => ecrire.run(empreinte(t), new Uint8Array(new Float32Array(r.embeddings[j]!).buffer))))();
  }
  const out = cle.map((h) => Array.from(new Float32Array((lire.get(h) as { v: Uint8Array }).v.buffer.slice(0))));
  db.close();
  return out;
}

/** Texte indexé : en-tête de contexte (document › section) puis l'extrait. */
export const texteAIndexer = (e: Pick<Extrait, "titre" | "section" | "texte">) => `${e.titre} › ${e.section}\n${e.texte}`;
