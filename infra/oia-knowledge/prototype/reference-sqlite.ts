/**
 * Référence SQLite, sur les MÊMES extraits et les MÊMES vecteurs bge-m3 que
 * Postgres : FTS5 pour les mots (comme le corpus actuel de Shyrka), calcul
 * exact du sens en mémoire, et la même fusion pour la combinaison. Sert à
 * savoir si un gain vient de la base ou du modèle.
 */
import { Database } from "bun:sqlite";
import type { Candidat } from "./recherche.ts";
import { identifiantsQuestion } from "./recherche.ts";
import type { Extrait } from "./corpus.ts";

export function referenceSqlite(extraits: Extrait[], vecteurs: number[][]) {
  const db = new Database(":memory:");
  db.run("create virtual table x using fts5(corps, titre, rang unindexed, tokenize = 'unicode61 remove_diacritics 2')");
  const ins = db.prepare("insert into x values (?, ?, ?)");
  db.transaction(() => extraits.forEach((e, i) => ins.run(e.texte, `${e.titre} ${e.section}`, i)))();
  const dim = vecteurs[0]!.length;
  const mat = new Float32Array(extraits.length * dim);
  const normes = new Float32Array(extraits.length);
  vecteurs.forEach((v, i) => { let n = 0; for (let d = 0; d < dim; d++) { mat[i * dim + d] = v[d]!; n += v[d]! * v[d]!; } normes[i] = Math.sqrt(n); });
  const ids = extraits.map((e) => new Set(e.identifiants));

  const mots = (q: string, k = 60): { i: number; s: number }[] => {
    const termes = [...new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])];
    if (!termes.length) return [];
    return (db.prepare("select rang, bm25(x, 1.0, 3.0) as b from x where x match ? order by b limit ?").all(termes.map((m) => `"${m}"`).join(" OR "), k) as { rang: number; b: number }[]).map((r) => ({ i: r.rang, s: -r.b }));
  };
  const sens = (qv: number[], k = 60): { i: number; s: number }[] => {
    let nq = 0; for (const x of qv) nq += x * x; nq = Math.sqrt(nq);
    const s = new Float32Array(extraits.length);
    for (let i = 0; i < extraits.length; i++) { let p = 0; const o = i * dim; for (let d = 0; d < dim; d++) p += mat[o + d]! * qv[d]!; s[i] = p / (normes[i]! * nq); }
    const ordre = Array.from(s.keys()).sort((a, b) => s[b]! - s[a]!).slice(0, k);
    return ordre.map((i) => ({ i, s: s[i]! }));
  };

  return (mode: "fts5" | "sqlite-sens" | "sqlite-combine" | "sqlite-sens-id", q: string, qv: number[], k = 10): Candidat[] => {
    const m = mode === "sqlite-sens" || mode === "sqlite-sens-id" ? [] : mots(q);
    const v = mode === "fts5" ? [] : sens(qv);
    const qid = mode === "sqlite-combine" || mode === "sqlite-sens-id" ? identifiantsQuestion(q) : [];
    const rm = new Map(m.map((x, r) => [x.i, { s: x.s, r: r + 1 }]));
    const rv = new Map(v.map((x, r) => [x.i, { s: x.s, r: r + 1 }]));
    const cand = new Set<number>([...rm.keys(), ...rv.keys()]);
    if (qid.length) extraits.forEach((_, i) => { if (qid.some((x) => ids[i]!.has(x))) cand.add(i); });
    const parDoc = new Map<string, Candidat>();
    for (const i of cand) {
      const e = extraits[i]!;
      const ident = qid.some((x) => ids[i]!.has(x));
      const score = mode === "fts5" ? rm.get(i)?.s ?? 0 : mode === "sqlite-sens" ? rv.get(i)?.s ?? 0 : (ident ? 1 : 0) + (rv.has(i) ? 1 / (60 + rv.get(i)!.r) : 0) + (rm.has(i) ? 0.35 / (60 + rm.get(i)!.r) : 0);
      const c: Candidat = { source: e.source, classification: e.classification, score, sens: rv.get(i)?.s ?? 0, mots: rm.get(i)?.s ?? 0, identifiant: ident };
      const d = parDoc.get(e.source);
      if (!d) parDoc.set(e.source, c);
      else { d.score = Math.max(d.score, c.score); d.sens = Math.max(d.sens, c.sens); d.mots = Math.max(d.mots, c.mots); d.identifiant ||= c.identifiant; }
    }
    return [...parDoc.values()].sort((a, b) => b.score - a.score).slice(0, k);
  };
}
