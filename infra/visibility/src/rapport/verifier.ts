/**
 * Vérifier un rapport scellé, sans accès à la base :
 *   tsx src/rapport/verifier.ts rapport.json [cle-publique.pem]
 *
 * rapport.json : { rapport, sceau: { empreinte, signature, cle_id }, cle_publique? } (l'export du cockpit).
 * La clé publique à utiliser est celle publiée (docs/cles/) ; celle jointe au fichier ne prouve rien
 * seule, puisqu'un faussaire pourrait joindre la sienne : le script le signale.
 */
import { readFileSync } from "node:fs";
import { verifier } from "./sceau.js";

export function verifierFichier(contenu: string, clePubliquePem?: string) {
  const f = JSON.parse(contenu) as { rapport?: unknown; sceau?: { empreinte?: string; signature?: string; cle_id?: string }; cle_publique?: string };
  if (!f.rapport || !f.sceau?.empreinte || !f.sceau.signature || !f.sceau.cle_id) return { integre: false as const, raison: "fichier incomplet : rapport et sceau attendus", cle: "absente" };
  const cle = clePubliquePem ?? f.cle_publique;
  if (!cle) return { integre: false as const, raison: "clé publique absente", cle: "absente" };
  const v = verifier(f.rapport, { empreinte: f.sceau.empreinte, signature: f.sceau.signature, cle_id: f.sceau.cle_id }, cle);
  return { ...v, cle: clePubliquePem ? "fournie à part" : "jointe au fichier (à comparer avec la clé publiée)" };
}

if (process.argv[1]?.endsWith("verifier.ts")) {
  const [fichier, cle] = process.argv.slice(2);
  if (!fichier) {
    console.error("usage : tsx src/rapport/verifier.ts rapport.json [cle-publique.pem]");
    process.exit(2);
  }
  const r = verifierFichier(readFileSync(fichier, "utf8"), cle ? readFileSync(cle, "utf8") : undefined);
  console.log(r.integre ? `INTÈGRE : le rapport n'a pas été modifié (clé ${r.cle}).` : `NON INTÈGRE : ${"raison" in r ? r.raison : ""}`);
  process.exit(r.integre ? 0 : 1);
}
