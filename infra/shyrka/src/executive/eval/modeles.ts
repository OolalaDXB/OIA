import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { dossierEval, empreinte, executerCapacite, fichierTenu, DOSSIER_JEUX } from "./registre.js";
import { JeuRoutage, type CasRoutage } from "./routage.js";
import { intervalleWilson, texteMesure, type Mesure } from "./stats.js";

/**
 * Comparaison des méthodes pour le routage (mandat v11, B4, T11). Même
 * jeu, même notation. Candidats : les règles du code (main), un modèle
 * local déjà installé (Ollama). Un candidat qu'on ne peut pas évaluer dans
 * les règles est NON_TESTE, jamais « inférieur » :
 * - Claude Code : aucun appel autonome autorisé tant que la facturation
 *   n'est pas prouvée ;
 * - Mistral : v11 n'engage aucun appel supplémentaire par défaut.
 * Le modèle ne reçoit que les répliques fictives, jamais les réponses
 * attendues ni une donnée personnelle.
 */

export type Classe = { genre: "liste"; depuis: "debut" | "fin"; n: number } | { genre: "liste_complete" } | { genre: "explication"; id: string } | { genre: "pas_liste" };

export function classeCorrecte(attendu: CasRoutage["attendu"], c: Classe | null): boolean {
  if (!c) return false;
  if (attendu.genre === "pas_liste") return c.genre !== "liste" && c.genre !== "liste_complete";
  if (attendu.genre !== c.genre) return false;
  if (attendu.genre === "liste" && c.genre === "liste") return attendu.depuis === c.depuis && attendu.n === c.n;
  if (attendu.genre === "explication" && c.genre === "explication") return attendu.id === c.id;
  return true;
}

const CONSIGNE = `Tu classes une réplique de Mickaël sur les « décisions ouvertes » de sa roadmap (D01 à D26, dans l'ordre).
Réponds UNIQUEMENT en JSON, une de ces formes :
{"genre":"liste","depuis":"debut"|"fin","n":<entier>}  — il demande d'énumérer les N premières ou dernières décisions ;
{"genre":"liste_complete"}                             — il demande toutes les décisions ;
{"genre":"explication","id":"Dxx"}                    — il demande d'expliquer une décision précise (y compris par une référence à la décision dont on vient de parler) ;
{"genre":"pas_liste"}                                  — autre chose : une affirmation, ou une question sur une propriété ou un jugement (urgence, blocage, combien…).`;

export async function classerOllama(c: Pick<CasRoutage, "texte" | "avant">, modele = "qwen3:8b"): Promise<{ classe: Classe | null; ms: number }> {
  const t0 = Date.now();
  const contexte = c.avant?.length ? `Tours précédents de Mickaël : ${c.avant.map((a) => `« ${a} »`).join(", ")}.\n` : "";
  const r = await fetch("http://127.0.0.1:11434/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: modele, stream: false, format: "json", think: false, options: { temperature: 0, seed: 1 }, messages: [{ role: "system", content: CONSIGNE }, { role: "user", content: `${contexte}Réplique : « ${c.texte} »` }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const j = (await r.json()) as { message?: { content?: string } };
  try {
    return { classe: JSON.parse(j.message?.content ?? "") as Classe, ms: Date.now() - t0 };
  } catch {
    return { classe: null, ms: Date.now() - t0 };
  }
}

export interface Comparaison {
  le: string;
  ensemble: string;
  empreinteJeu: string;
  candidats: { methode: string; statut: "TESTE" | "NON_TESTE"; exactitude?: Mesure; fauxPositifsListe?: number; latenceMedianeMs?: number; confidentialite: string; coutMarginal: string; raison?: string }[];
}

function mediane(x: number[]): number {
  const s = [...x].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)]! : 0;
}

export async function comparerMethodes(ensembles = ["developpement", "regression", "tenu"]): Promise<Comparaison[]> {
  const out: Comparaison[] = [];
  const regles = executerCapacite("routage.decisions", { ensembles, consigner: false });
  for (const ensemble of ensembles) {
    const fichier = ensemble === "tenu" ? fichierTenu("routage") : join(DOSSIER_JEUX, `routage.${ensemble}.json`);
    if (!existsSync(fichier)) continue;
    const cas = JeuRoutage.parse(JSON.parse(readFileSync(fichier, "utf8"))).cas.filter((c) => c.famille !== "continuite");
    const r = regles.find((x) => x.capacite === "routage.decisions" && x.ensemble === ensemble);
    const latR: number[] = [];
    let ok = 0;
    let fp = 0;
    for (const c of cas) {
      const o = await classerOllama(c);
      latR.push(o.ms);
      if (classeCorrecte(c.attendu, o.classe)) ok++;
      if (c.attendu.genre !== "liste" && c.attendu.genre !== "liste_complete" && (o.classe?.genre === "liste" || o.classe?.genre === "liste_complete")) fp++;
    }
    out.push({
      le: new Date().toISOString(), ensemble, empreinteJeu: empreinte(fichier),
      candidats: [
        { methode: "règles du code (main)", statut: "TESTE", exactitude: r?.mesures.exactitude, fauxPositifsListe: r?.compteurs.fauxPositifsListe, latenceMedianeMs: 0, confidentialite: "local, aucune donnée exportée", coutMarginal: "0" },
        { methode: "Ollama qwen3:8b (classification, rendu par le code)", statut: "TESTE", exactitude: intervalleWilson(ok, cas.length), fauxPositifsListe: fp, latenceMedianeMs: mediane(latR), confidentialite: "local (127.0.0.1), aucune donnée exportée", coutMarginal: "0 (électricité du Mac)" },
        { methode: "Claude Code", statut: "NON_TESTE", confidentialite: "distant", coutMarginal: "inconnu (quota de l'abonnement, dépassement non vérifiable)", raison: "aucun appel autonome autorisé en v11 (T12)" },
        { methode: "Mistral", statut: "NON_TESTE", confidentialite: "distant", coutMarginal: "plafond v9 5 USD/mois", raison: "v11 n'engage aucun appel supplémentaire par défaut" },
      ],
    });
  }
  mkdirSync(dossierEval(), { recursive: true, mode: 0o700 });
  for (const c of out) appendFileSync(join(dossierEval(), "modeles.jsonl"), `${JSON.stringify(c)}\n`, { mode: 0o600 });
  return out;
}

export function texteComparaison(c: Comparaison): string {
  return [`[${c.ensemble}] jeu ${c.empreinteJeu.slice(0, 12)}`, ...c.candidats.map((x) => `  ${x.statut.padEnd(9)} ${x.methode} · ${x.exactitude ? texteMesure(x.exactitude) : "—"}${x.fauxPositifsListe !== undefined ? ` · FP ${x.fauxPositifsListe}` : ""}${x.latenceMedianeMs !== undefined ? ` · latence médiane ${x.latenceMedianeMs} ms` : ""} · ${x.confidentialite} · coût ${x.coutMarginal}${x.raison ? ` · ${x.raison}` : ""}`)].join("\n");
}
