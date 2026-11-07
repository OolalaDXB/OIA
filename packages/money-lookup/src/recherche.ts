import { masquerSensibles, toucheSwift } from "../../shyrka/src/serveur/filtre.ts";
import type { Modele } from "../../shyrka/src/serveur/conversation.ts";

/**
 * Recherche assistée de Money Lookup (mandat v9, bloc D) : un texte libre →
 * opportunités classées et expliquées.
 *
 *  1. Sélection des candidats PAR LES RÈGLES, sans modèle : vue ml_toutes_v1
 *     lue avec la session de l'appelant, opportunités rejetées écartées,
 *     score = mots du texte retrouvés dans le titre et l'émetteur, projet
 *     demandé, nature (typologie financière) reconnue dans le texte, gate.
 *  2. Mistral classe ces candidats, explique chaque correspondance et signale
 *     les informations manquantes. Il ne peut citer que des candidats :
 *     tout identifiant inventé est écarté.
 *
 * Plafonds : 2 000 jetons d'entrée par appel (candidats réduits jusqu'à
 * tenir), un seul appel au modèle par recherche. Compatible Deno et Node.
 */
export const MODELE_RECHERCHE = "mistral-large-latest";
export const JETONS_ENTREE_MAX = 2000;
export const JETONS_SORTIE_MAX = 800;
export const PRIX = { entree: 0.7, sortie: 2.1 };
export const COUT_MAX_RECHERCHE_USD = Math.ceil(JETONS_ENTREE_MAX * PRIX.entree + JETONS_SORTIE_MAX * PRIX.sortie) / 1e6;
export const CANDIDATS_MAX = 12;
const estimer = (t: string) => Math.ceil(t.length / 3);

export interface Opportunite {
  id: string;
  titre: string;
  emetteur: string;
  nature: string;
  categorie: string;
  montant: number | null;
  devise: string | null;
  echeance: string | null;
  recommandation: string;
  gate_ok: boolean;
  projets_decouverte: string[] | null;
  projet_etiquete: string | null;
}

export interface Correspondance {
  id: string;
  rang: number;
  titre: string;
  explication: string;
  informations_manquantes: string[];
  source: { vue: "ml_toutes_v1"; id: string };
}

export interface ResultatRecherche {
  correspondances: Correspondance[];
  candidats: number;
  ecartes_inventes: number;
  jetonsEntree: number;
  jetonsSortie: number;
  coutUsd: number;
  modele: string;
  /** Vrai si rien n'est parti vers le modèle (exclusion, aucun candidat). */
  local: boolean;
  message?: string;
}

const NATURES: [RegExp, string][] = [
  [/subvention|grant|aide non rembours/i, "GRANT"],
  [/appel d.offres?|march[ée] public|tender|rfp/i, "TENDER"],
  [/investiss|levée|capital|equity|vc\b|fonds/i, "EQUITY"],
  [/pr[eê]t|garantie|loan|dette/i, "DEBT_GUARANTEE"],
  [/fiscal|cr[ée]dit d.imp[ôo]t|tax/i, "TAX_INCENTIVE"],
  [/prix|concours|award|prize/i, "PRIZE"],
];
const VIDES = new Set(["pour", "dans", "avec", "des", "les", "une", "sur", "qui", "que", "est", "aux", "par", "the", "and", "for", "with", "mon", "nos", "notre", "projet", "cherche", "trouve"]);
const mots = (t: string) =>
  [...new Set(t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]{3,}/g) ?? [])].filter((m) => !VIDES.has(m));

/** Étape 1 : candidats par les règles, du plus au moins pertinent. */
export function candidats(texte: string, toutes: Opportunite[], projet?: string): Opportunite[] {
  const m = mots(texte);
  const natures = NATURES.filter(([r]) => r.test(texte)).map(([, n]) => n);
  return toutes
    .filter((o) => o.recommandation !== "REJECT" && !toucheSwift(JSON.stringify(o)))
    .map((o) => {
      const cible = mots(`${o.titre} ${o.emetteur}`);
      let score = m.filter((x) => cible.some((c) => c.startsWith(x) || x.startsWith(c))).length * 3;
      const projets = [...(o.projets_decouverte ?? []), o.projet_etiquete ?? ""];
      if (projet && projets.includes(projet)) score += 5;
      if (m.some((x) => projets.includes(x))) score += 4;
      if (natures.includes(o.nature)) score += 2;
      if (o.gate_ok) score += 1;
      return { o, score };
    })
    .filter((x) => x.score >= 3)
    .sort((a, b) => b.score - a.score || (a.o.echeance ?? "9999").localeCompare(b.o.echeance ?? "9999"))
    .slice(0, CANDIDATS_MAX)
    .map((x) => x.o);
}

const CONSIGNES = `Tu classes des opportunités de financement pour Mickaël Thomas (OIA, Money Lookup).
Tu reçois une demande et une liste de CANDIDATS (identifiant court c1, c2, …). Tu ne cites QUE ces candidats.
Réponds en JSON : {"correspondances":[{"c":"c1","rang":1,"explication":"…","informations_manquantes":["…"]}]}.
- Explication : une ou deux phrases en français, faits du candidat seulement ; n'invente ni montant, ni date, ni critère.
- Informations manquantes : ce qu'il faudrait vérifier (montant, échéance, éligibilité…).
- Écarte les candidats sans rapport. 8 correspondances au plus.`;

/** Étape 2 : classement et explications par le modèle, sous plafond d'entrée. */
export async function rechercher(texte: string, toutes: Opportunite[], modele: Modele, projet?: string): Promise<ResultatRecherche> {
  const vide: ResultatRecherche = { correspondances: [], candidats: 0, ecartes_inventes: 0, jetonsEntree: 0, jetonsSortie: 0, coutUsd: 0, modele: MODELE_RECHERCHE, local: true };
  if (toucheSwift(texte)) return { ...vide, message: "Recherche refusée : rien de ce qui touche à Swift n'est traité. Rien n'a été envoyé au modèle." };
  const demande = masquerSensibles(texte.trim().slice(0, 1000)).texte;
  let liste = candidats(demande, toutes, projet);
  if (!liste.length) return { ...vide, message: "Aucune opportunité ne correspond par les règles : rien n'a été envoyé au modèle." };

  const fiche = (o: Opportunite, i: number) => ({
    c: `c${i + 1}`, titre: o.titre.slice(0, 160), emetteur: o.emetteur.slice(0, 80), nature: o.nature, categorie: o.categorie,
    montant: o.montant === null ? "inconnu" : `${o.montant} ${o.devise ?? ""}`.trim(), echeance: o.echeance ?? "inconnue", projets: o.projets_decouverte ?? [],
  });
  const messages = () => [
    { role: "system" as const, content: CONSIGNES },
    { role: "user" as const, content: JSON.stringify({ demande, projet: projet ?? null, candidats: liste.map(fiche) }) },
  ];
  while (liste.length > 1 && estimer(JSON.stringify(messages())) > JETONS_ENTREE_MAX) liste = liste.slice(0, -1);
  if (estimer(JSON.stringify(messages())) > JETONS_ENTREE_MAX) return { ...vide, message: `Demande trop longue : ${JETONS_ENTREE_MAX} jetons au plus.` };

  const rep = await modele({ model: MODELE_RECHERCHE, messages: messages(), tools: [], max_tokens: JETONS_SORTIE_MAX });
  let brut: { correspondances?: { c?: unknown; rang?: unknown; explication?: unknown; informations_manquantes?: unknown }[] } = {};
  try {
    brut = JSON.parse((rep.message.content ?? "{}").replace(/^```(?:json)?\s*|\s*```$/g, ""));
  } catch {
    brut = {};
  }
  const parCode = new Map(liste.map((o, i) => [`c${i + 1}`, o]));
  let inventes = 0;
  const correspondances: Correspondance[] = [];
  for (const x of brut.correspondances ?? []) {
    const o = typeof x.c === "string" ? parCode.get(x.c) : undefined;
    if (!o || correspondances.some((c) => c.id === o.id)) {
      inventes++;
      continue;
    }
    correspondances.push({
      id: o.id,
      rang: correspondances.length + 1,
      titre: o.titre,
      explication: typeof x.explication === "string" ? x.explication.slice(0, 600) : "",
      informations_manquantes: Array.isArray(x.informations_manquantes) ? x.informations_manquantes.filter((s): s is string => typeof s === "string").slice(0, 6) : [],
      source: { vue: "ml_toutes_v1", id: o.id },
    });
  }
  const coutUsd = (rep.usage.prompt_tokens * PRIX.entree + rep.usage.completion_tokens * PRIX.sortie) / 1e6;
  return { correspondances, candidats: liste.length, ecartes_inventes: inventes, jetonsEntree: rep.usage.prompt_tokens, jetonsSortie: rep.usage.completion_tokens, coutUsd, modele: rep.model || MODELE_RECHERCHE, local: false };
}
