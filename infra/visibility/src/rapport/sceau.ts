/**
 * Sceau d'un rapport : empreinte SHA-256 du JSON canonique, signée en Ed25519.
 *
 * JSON canonique : clés triées à tous les niveaux, aucun espace, valeurs `undefined` retirées.
 * La même donnée donne donc toujours les mêmes octets, quel que soit l'ordre des clés à la lecture
 * (la base, un navigateur, un autre langage). Vérifier = recalculer l'empreinte sur le rapport reçu
 * et contrôler la signature avec la clé publique : aucune donnée de la base n'est nécessaire.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";

export function canonique(v: unknown): string {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error("JSON canonique : nombre non fini");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return `[${v.map((x) => (x === undefined ? "null" : canonique(x))).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canonique(o[k])}`).join(",")}}`;
}

export const sha256 = (s: string | Buffer) => createHash("sha256").update(s).digest("hex");

/** Clé privée depuis le secret : PEM PKCS#8, ou ce PEM encodé en base64 (une seule ligne, pratique pour un secret). */
export function lireClePrivee(secret: string): KeyObject {
  const t = secret.trim();
  const pem = t.startsWith("-----BEGIN") ? t : Buffer.from(t, "base64").toString("utf8");
  const k = createPrivateKey(pem);
  if (k.asymmetricKeyType !== "ed25519") throw new Error("clé de signature : Ed25519 attendue");
  return k;
}

export function clePublique(privee: KeyObject): { pem: string; id: string } {
  const pub = createPublicKey(privee);
  const der = pub.export({ type: "spki", format: "der" });
  return { pem: String(pub.export({ type: "spki", format: "pem" })).trim(), id: sha256(der).slice(0, 16) };
}

export interface Sceau {
  algorithme: "Ed25519";
  empreinte: string;
  signature: string;
  cle_id: string;
  scelle_le: string;
}

export function sceller(rapport: unknown, privee: KeyObject, maintenant: Date): Sceau {
  const octets = Buffer.from(canonique(rapport), "utf8");
  return {
    algorithme: "Ed25519",
    empreinte: sha256(octets),
    signature: sign(null, octets, privee).toString("base64"),
    cle_id: clePublique(privee).id,
    scelle_le: maintenant.toISOString(),
  };
}

export type Verdict = { integre: true } | { integre: false; raison: string };

/** Vérifie un rapport reçu : même empreinte, signature valide pour la clé publique donnée. */
export function verifier(rapport: unknown, sceau: Pick<Sceau, "empreinte" | "signature" | "cle_id">, clePubliquePem: string): Verdict {
  const octets = Buffer.from(canonique(rapport), "utf8");
  const pub = createPublicKey(clePubliquePem);
  const id = sha256(pub.export({ type: "spki", format: "der" })).slice(0, 16);
  if (id !== sceau.cle_id) return { integre: false, raison: `clé publique différente de celle du sceau (${id} au lieu de ${sceau.cle_id})` };
  if (sha256(octets) !== sceau.empreinte) return { integre: false, raison: "empreinte différente : le rapport a été modifié" };
  if (!verify(null, octets, pub, Buffer.from(sceau.signature, "base64"))) return { integre: false, raison: "signature invalide" };
  return { integre: true };
}
