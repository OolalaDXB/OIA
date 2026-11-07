import { readFileSync, writeFileSync } from "node:fs";
import { refCourte, type ExportMemoire } from "@oia/shyrka-noyau";
import { compartimentDe, formeDe } from "../memoire/commandes.js";
import { MemoireLocale } from "../memoire/sqlite.js";
import { dossierVerifie } from "../memoire/volume.js";
import { projetsConnus } from "./config.js";

/**
 * `shyrka:executive memoire …` : la mémoire hors conversation, une commande
 * par processus. Sous-dossier du volume : `memoire` (réel) ; la recette passe
 * `SHYRKA_MEMOIRE_SOUS_DOSSIER=recette/…`, toujours sous le volume vérifié.
 */
export function ouvrirMemoire(): MemoireLocale {
  return new MemoireLocale(dossierVerifie(process.env.SHYRKA_MEMOIRE_SOUS_DOSSIER ?? "memoire"));
}

const MICKAEL = { type: "mickael" as const, via: "cli" };

export function commandeMemoire(args: string[]): number {
  const [sous, ...reste] = args;
  const texte = reste.join(" ").trim();
  const m = ouvrirMemoire();
  try {
    switch (sous) {
      case "retenir": {
        const e = m.enregistrer({ compartiment: compartimentDe(texte, projetsConnus()), forme: formeDe(texte), contenu: texte, source: { voie: "instruction", ref: `cli ${new Date().toISOString().slice(0, 16)}Z` } }, MICKAEL);
        console.log(JSON.stringify({ id: e.id, ref: refCourte(e.id), compartiment: e.compartiment, forme: e.forme, statut: e.statut, version: e.version }));
        return 0;
      }
      case "proposer": {
        // Proposition d'un agent ou d'un outil (voie 2) : reste « à confirmer », jamais validée par son auteur.
        const [compartiment, forme, auteur, ...mots] = reste;
        const e = m.enregistrer(
          { compartiment: compartiment as never, forme: forme as never, contenu: mots.join(" "), source: { voie: "proposition", ref: `agent ${auteur} ${new Date().toISOString().slice(0, 16)}Z`, affirmeParIA: true } },
          { type: "agent", id: auteur ?? "inconnu" },
        );
        console.log(JSON.stringify({ id: e.id, statut: e.statut, compartiment: e.compartiment, forme: e.forme }));
        return 0;
      }
      case "lister":
      case "chercher": {
        const r = m.retrouver(sous === "chercher" ? { texte, limite: 20 } : { limite: 50 }, { type: "mickael" });
        for (const x of r) console.log(JSON.stringify({ id: x.element.id, contenu: x.element.contenu, statut: x.element.statut, version: x.element.version, compartiment: x.element.compartiment, portee: x.element.portee, provenance: x.provenance }));
        if (!r.length) console.log("(aucun)");
        return 0;
      }
      case "corriger": {
        const [ref, ...nouveau] = reste;
        const e = m.corriger(m.resoudre(ref ?? ""), { contenu: nouveau.join(" ") }, MICKAEL);
        console.log(JSON.stringify({ id: e.id, version: e.version, contenu: e.contenu }));
        return 0;
      }
      case "oublier": {
        console.log(JSON.stringify(m.oublier(m.resoudre(reste[0] ?? ""), MICKAEL)));
        return 0;
      }
      case "exporter": {
        const exp = m.exporter(MICKAEL);
        if (!reste[0]) throw new Error("chemin de sortie requis (hors du dépôt)");
        writeFileSync(reste[0], JSON.stringify(exp, null, 2), { mode: 0o600 });
        console.log(`${exp.elements.length} version(s), ${exp.oublis.length} empreinte(s) d'oubli → ${reste[0]}`);
        return 0;
      }
      case "restaurer": {
        const s = JSON.parse(readFileSync(reste[0] ?? "", "utf8")) as ExportMemoire;
        console.log(JSON.stringify(m.restaurer(s, MICKAEL)));
        return 0;
      }
      case "etat": {
        console.log(JSON.stringify({ chemin: m.chemin, ...m.comptes() }));
        return 0;
      }
      default:
        console.log("Usage : memoire retenir <texte> | proposer <compartiment> <forme> <auteur> <texte> | lister | chercher <mots> | corriger <réf> <texte> | oublier <réf> | exporter <fichier> | restaurer <fichier> | etat");
        return 2;
    }
  } finally {
    m.fermer();
  }
}
