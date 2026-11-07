/**
 * Table des preuves locale d'une fenêtre (F2 en local, en attendant la table
 * Supabase de P3, migrations/0001_evidence.sql) : un fichier JSONL hors du
 * dépôt, en AJOUT SEUL.
 *
 *  - une preuve déjà présente (même id, même empreinte) n'est jamais ajoutée
 *    deux fois : une relance de la clôture ne duplique rien ;
 *  - une preuve présente avec une autre empreinte est refusée : on ne réécrit
 *    jamais une réponse déjà consignée ;
 *  - l'empreinte SHA-256 de chaque réponse se vérifie à tout moment.
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { EvidenceRow } from "./elmo-import.js";

export const sha256Hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export function readEvidence(file: string): EvidenceRow[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as EvidenceRow);
}

export function appendEvidence(file: string, rows: EvidenceRow[]): { added: number; skipped: number } {
  const existing = new Map(readEvidence(file).map((e) => [e.id, e.rawSha256Hex]));
  const fresh: EvidenceRow[] = [];
  let skipped = 0;
  for (const r of rows) {
    if (sha256Hex(r.rawText) !== r.rawSha256Hex) throw new Error(`preuve ${r.id} : empreinte incohérente avec son texte`);
    const known = existing.get(r.id);
    if (known === r.rawSha256Hex) {
      skipped++;
      continue;
    }
    if (known !== undefined) throw new Error(`preuve ${r.id} déjà consignée avec une autre empreinte : refus de la réécrire`);
    existing.set(r.id, r.rawSha256Hex);
    fresh.push(r);
  }
  if (fresh.length) {
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, fresh.map((r) => `${JSON.stringify(r)}\n`).join(""));
  }
  return { added: fresh.length, skipped };
}

/** Preuves dont le texte ne correspond plus à l'empreinte consignée. */
export function corruptedEvidence(rows: EvidenceRow[]): string[] {
  return rows.filter((r) => sha256Hex(r.rawText) !== r.rawSha256Hex).map((r) => r.id);
}
