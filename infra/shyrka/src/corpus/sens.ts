/**
 * Recherche par le sens, mode retenu par l'ADR 0005 (mesures du 8 novembre
 * 2026) : vecteurs bge-m3 calculés en local par Ollama, plus un canal
 * d'identifiants exacts (`ml_toutes_v1`, chemins, migrations, décisions D07).
 * Sans les mots : la fusion avec la recherche lexicale dégradait le résultat.
 * Dans SQLite, calcul exact (pas d'index approché) : à cette taille, quelques
 * millisecondes.
 */

export const MODELE_SENS = "bge-m3";
export const DIMENSIONS = 1024;
/** Seuil de proximité calibré sur le jeu de mise au point de l'ADR 0005 (0,516). */
export const SEUIL_SENS = 0.516;

/** Identifiants exacts d'un texte (même règle à l'indexation et pour la question). */
export function identifiants(texte: string): string[] {
  const out = new Set<string>();
  for (const m of texte.matchAll(/[A-Za-z0-9][A-Za-z0-9]*(?:[_./-][A-Za-z0-9]+)+/g)) {
    const t = m[0].toLowerCase().replace(/[.]+$/, "");
    if ((/[_./]/.test(t) || /\d/.test(t)) && t.length >= 4 && t.length <= 80 && !/^\d+([./-]\d+)*$/.test(t)) out.add(t);
  }
  for (const m of texte.matchAll(/\b[DdPp]\d{2,3}\b/g)) out.add(m[0].toLowerCase());
  return [...out];
}

/** Texte vectorisé pour un extrait : titre et section en tête (format mesuré dans l'ADR). */
export const texteAVectoriser = (titre: string, section: string, texte: string) => `${titre} › ${section}\n${texte}`;

export type Vectoriseur = (textes: string[]) => Promise<Float32Array[]>;

/** bge-m3 par Ollama, local. Aucun repli en ligne : indisponible = erreur, et la recherche revient aux mots. */
export function vectoriseurOllama(url = process.env.SHYRKA_OLLAMA_URL ?? "http://127.0.0.1:11434", delaiMs = 60_000): Vectoriseur {
  return async (textes) => {
    const out: Float32Array[] = [];
    for (let i = 0; i < textes.length; i += 16) {
      const r = await fetch(`${url}/api/embed`, { method: "POST", body: JSON.stringify({ model: MODELE_SENS, input: textes.slice(i, i + 16), keep_alive: "30m" }), signal: AbortSignal.timeout(delaiMs) });
      if (!r.ok) throw new Error(`bge-m3 indisponible (HTTP ${r.status})`);
      const { embeddings } = (await r.json()) as { embeddings: number[][] };
      for (const v of embeddings) out.push(normer(Float32Array.from(v)));
    }
    return out;
  };
}

export function normer(v: Float32Array): Float32Array {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

export const produit = (a: Float32Array, b: Float32Array) => {
  let p = 0;
  for (let i = 0; i < a.length; i++) p += a[i]! * b[i]!;
  return p;
};

export const versOctets = (v: Float32Array) => new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
export const depuisOctets = (b: Uint8Array) => new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
