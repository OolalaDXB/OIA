import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { motifExclusion, normaliserTexte, NouvelElementSchema, type NouvelElement } from "@oia/shyrka-noyau";
import { compartimentDe, formeDe } from "../memoire/commandes.js";
import { projetsConnus } from "./config.js";

/**
 * Import À BLANC de la base personnelle du 8 novembre 2026 (mandat Knowledge
 * Engine, point 8). Prépare chaque fait comme une proposition (voie 2, « à
 * confirmer », portée Mac seulement), le valide contre le contrat de mémoire,
 * et n'écrit RIEN : ni mémoire, ni fichier. Seuls des agrégats sont affichés,
 * jamais un énoncé.
 *
 * `ingest_allowed: false` est respecté : tant que Mickaël ne l'a pas levé,
 * chaque fait est compté « refusé », même s'il est valide.
 *
 *   tsx src/executive/semence-a-blanc.ts [dossier de la semence]
 */

const DOSSIER = resolve(process.argv[2] ?? "/Volumes/Shyrka-corpus/brut/ia/Chatgpt/2026-11-08-synthese/shyrka_seed_2026-11-08");
const CONTROLE = "/Volumes/Shyrka-corpus/recette/controle-brut-2026-11-08.sha256";
const BRUT = "/Volumes/Shyrka-corpus/brut";

interface Fait { id: string; document_id: string; section: string; text: string; privacy: string; as_of: string; ingest_allowed: boolean; validation_status: string; source_type: string }

const compter = (m: Record<string, number>, k: string) => void (m[k] = (m[k] ?? 0) + 1);

// 1. Intégrité : chaque fichier de la semence a l'empreinte relevée le 8 novembre.
const controle = readFileSync(CONTROLE, "utf8").split("\n").filter(Boolean).map((l) => ({ h: l.slice(0, 64), chemin: join(BRUT, l.slice(66)) }));
const semence = controle.filter((c) => c.chemin.startsWith(DOSSIER + "/") || c.chemin === DOSSIER);
const alteres = semence.filter((c) => createHash("sha256").update(readFileSync(c.chemin)).digest("hex") !== c.h).length;

// 2. Garde-fous du manifeste.
const manifeste = JSON.parse(readFileSync(join(DOSSIER, "manifest.json"), "utf8")) as Record<string, unknown>;
const gardeFous = Object.fromEntries(["contains_sensitive_data", "safe_to_commit_to_git", "remote_processing_allowed", "memory_preapproved"].map((k) => [k, manifeste[k]]));

// 3. Chaque fait → proposition, validée mais jamais enregistrée.
const faits = readFileSync(join(DOSSIER, "facts.jsonl"), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Fait);
const projets = projetsConnus();
const vus = new Set<string>();
const agregats = { compartiment: {}, forme: {}, restriction: {}, confidentialite: {}, invalides: {}, exclusions: {} } as Record<string, Record<string, number>>;
let valides = 0, doublons = 0, refusesParManifeste = 0, importables = 0;
for (const f of faits) {
  const proposition: NouvelElement = {
    compartiment: compartimentDe(f.text, projets),
    forme: formeDe(f.text),
    contenu: f.text,
    details: { section: f.section, origine: f.source_type },
    source: { voie: "proposition", ref: `semence:2026-11-08/${f.document_id}#${f.id}`, affirmeParIA: true },
    date: new Date(`${f.as_of}T00:00:00Z`).toISOString(),
    portee: "local_seulement",
    restrictions: f.privacy === "P3" ? ["mickael_seulement"] : [],
  };
  const v = NouvelElementSchema.safeParse(proposition);
  const motif = motifExclusion(f.text);
  const cle = normaliserTexte(f.text);
  compter(agregats.confidentialite!, f.privacy);
  if (!v.success) { compter(agregats.invalides!, v.error.issues[0]?.path.join(".") ?? "?"); continue; }
  if (motif) { compter(agregats.exclusions!, motif); continue; }
  if (vus.has(cle)) { doublons++; continue; }
  vus.add(cle);
  valides++;
  compter(agregats.compartiment!, v.data.compartiment.startsWith("projet:") ? "projet:*" : v.data.compartiment);
  compter(agregats.forme!, v.data.forme);
  compter(agregats.restriction!, v.data.restrictions.join(",") || "aucune");
  if (f.ingest_allowed !== true || f.validation_status !== "approved") refusesParManifeste++;
  else importables++;
}

console.log(JSON.stringify({
  mode: "à blanc : aucune écriture",
  semence: { fichiers_controles: semence.length, alteres },
  garde_fous_du_manifeste: gardeFous,
  faits: faits.length,
  propositions_valides: valides,
  doublons,
  refuses_ingest_allowed_false: refusesParManifeste,
  importables_maintenant: importables,
  ...agregats,
  statut_a_l_import: "a_confirmer (voie proposition, affirmé par IA : jamais une preuve)",
}, null, 1));
