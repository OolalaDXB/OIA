import { masquerSensibles, toucheSwift } from "./filtre.ts";
import { datesSansSource } from "./garde.ts";
import { OUTILS, outilsPourLeModele, type Ecrivain, type Lecteur, type Source } from "./outils.ts";

/**
 * Conversation de Shyrka côté serveur (mandat v9, bloc G) : plusieurs tours,
 * réponses générées par le modèle, outils de lecture d'OIA, brouillons. Le
 * modèle est injecté (`Modele`) : Mistral en production, un modèle simulé en
 * test. Compatible Deno et Node.
 *
 * Budget (G6) : l'appelant réserve le coût maximal d'un message
 * (`COUT_MAX_MESSAGE_USD`) avant d'appeler `repondre`, puis règle le coût réel
 * rendu ici. Chaque appel au modèle reste sous `JETONS_ENTREE_MAX`.
 */

export const MODELE = "mistral-large-latest";
/** Prix de Mistral Large (docs.mistral.ai/inference/pricing, repris dans infra/visibility/src/cost-grid.ts). */
export const PRIX_USD_PAR_MILLION = { entree: 0.7, sortie: 2.1 };
export const JETONS_ENTREE_MAX = 4000;
export const JETONS_SORTIE_MAX = 600;
export const APPELS_MAX_PAR_MESSAGE = 3;
export const COUT_MAX_MESSAGE_USD =
  Math.ceil(APPELS_MAX_PAR_MESSAGE * (JETONS_ENTREE_MAX * PRIX_USD_PAR_MILLION.entree + JETONS_SORTIE_MAX * PRIX_USD_PAR_MILLION.sortie)) / 1e6;

/** Estimation prudente (3 caractères par jeton) : on surestime plutôt que l'inverse. */
export const estimerJetons = (t: string) => Math.ceil(t.length / 3);
export const coutUsd = (entree: number, sortie: number) => (entree * PRIX_USD_PAR_MILLION.entree + sortie * PRIX_USD_PAR_MILLION.sortie) / 1e6;

export const CONSIGNES = `Tu es Shyrka, l'assistante de Mickaël Thomas dans le cockpit OIA. Cadre : docs/shyrka/CADRE.md.
- Tu tutoies Mickaël. Tu réponds dans sa langue (français par défaut), court : phrases courtes, un fait par phrase.
- Pas de tiret cadratin. Pas de définition par la négation. « Swift » en graphie officielle.
- Tu distingues toujours les FAITS récupérés par tes outils de tes INTERPRÉTATIONS (préfixe « Mon avis : »).
- Chaque fait chiffré cite sa source entre parenthèses : (source : <vue>, <identifiant>, <date>), avec la vue et l'identifiant EXACTS rendus par un outil dans cet échange. Pour un fait d'un tour précédent, rappelle l'outil. Sans outil, pas de chiffre.
- N'invente jamais un lien, une adresse, un identifiant, une date ni un chiffre. Un brouillon se retrouve dans la zone Contexte du cockpit : ne donne pas d'adresse.
- Six lignes au plus, sauf si Mickaël demande le détail.
- Tu conseilles franchement, y compris en contredisant. Tu changes d'avis sur un fait, jamais sur une préférence exprimée.
- Tu peux préparer des brouillons (outil preparer_brouillon). Tu n'envoies rien, ne publies rien, ne supprimes ni ne modifies aucune donnée : dis-le si on te le demande.
- Tu n'as AUCUN accès au web : tu ne consultes ni ne vérifies aucune page. Une donnée absente des outils est « inconnue » et tu le dis.
- Agenda, Santé et Famille ne sont pas connectés. Tu ne traites rien qui touche à Swift.
- Si une donnée manque, dis-le simplement.`;

export interface MessageModele {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
  name?: string;
}

export interface ReponseModele {
  message: { content: string | null; tool_calls?: MessageModele["tool_calls"] };
  usage: { prompt_tokens: number; completion_tokens: number };
  model: string;
}

export type Modele = (req: { model: string; messages: MessageModele[]; tools: unknown[]; max_tokens: number }) => Promise<ReponseModele>;

export interface Tour {
  role: "mickael" | "shyrka";
  contenu: string;
}

export interface Resultat {
  reponse: string;
  sources: Source[];
  outils: string[];
  brouillons: string[];
  jetonsEntree: number;
  jetonsSortie: number;
  coutUsd: number;
  modele: string;
  appelsModele: number;
  /** Vrai si la réponse a été produite sans appeler le modèle (exclusion, refus). */
  local: boolean;
  /** Vrai si le message a été exclu (Swift) : il ne doit être ni envoyé ni conservé. */
  exclu: boolean;
  /** Dates de la réponse absentes des données des outils (garde des faits). */
  nonSourcees: string[];
  masques: string[];
}

export class RefusMessage extends Error {
  constructor(message: string, readonly code: "trop_long" | "vide") {
    super(message);
  }
}

const tronquer = (t: string, max: number) => (t.length > max ? `${t.slice(0, max)}… [tronqué]` : t);

export async function repondre(
  entree: { message: string; historique: Tour[]; maintenant: string },
  d: { modele: Modele; lecteur: Lecteur; ecrivain: Ecrivain; journaliser?: (quoi: string, cible: string | null, resultat: "autorise" | "refuse" | "info") => Promise<void> },
): Promise<Resultat> {
  const journal = d.journaliser ?? (async () => {});
  const brut = entree.message.trim();
  if (!brut) throw new RefusMessage("message vide", "vide");
  const base: Omit<Resultat, "reponse"> = { sources: [], outils: [], brouillons: [], jetonsEntree: 0, jetonsSortie: 0, coutUsd: 0, modele: MODELE, appelsModele: 0, local: true, exclu: false, nonSourcees: [], masques: [] };

  // Exclusions avant tout appel : le message ne part pas.
  if (toucheSwift(brut)) {
    await journal("exclusion.swift", null, "refuse");
    return { ...base, exclu: true, reponse: "Je ne traite rien qui touche à Swift ici. Rien n'a été envoyé au modèle ni conservé." };
  }
  const { texte: message, masques } = masquerSensibles(brut);
  if (masques.length) await journal("exclusion.donnees_sensibles", masques.join(","), "info");

  const systeme: MessageModele = { role: "system", content: `${CONSIGNES}\nDate du jour : ${entree.maintenant.slice(0, 10)}.` };
  const outils = outilsPourLeModele();
  const fixe = estimerJetons(systeme.content) + estimerJetons(JSON.stringify(outils)) + estimerJetons(message);
  if (fixe > JETONS_ENTREE_MAX) throw new RefusMessage(`message trop long : ${JETONS_ENTREE_MAX} jetons au plus en entrée`, "trop_long");

  // Historique : les tours les plus récents qui tiennent dans le budget d'entrée (moitié au plus).
  const histo: MessageModele[] = [];
  let place = Math.floor((JETONS_ENTREE_MAX - fixe) / 2);
  for (const t of [...entree.historique].reverse()) {
    if (toucheSwift(t.contenu)) continue;
    const c = masquerSensibles(t.contenu).texte;
    const j = estimerJetons(c);
    if (j > place) break;
    place -= j;
    histo.unshift({ role: t.role === "mickael" ? "user" : "assistant", content: c });
  }
  const messages: MessageModele[] = [systeme, ...histo, { role: "user", content: message }];
  let nHisto = histo.length;
  // Les définitions d'outils comptent dans l'entrée de chaque appel.
  const placeMessages = JETONS_ENTREE_MAX - estimerJetons(JSON.stringify(outils));
  const r: Resultat = { ...base, reponse: "", local: false, masques };
  const donneesOutils: string[] = [];

  for (let appel = 1; appel <= APPELS_MAX_PAR_MESSAGE; appel++) {
    // Chaque appel reste sous le plafond d'entrée : les résultats d'outils les plus anciens sont réduits.
    while (estimerJetons(JSON.stringify(messages)) > placeMessages) {
      const i = messages.findIndex((m) => m.role === "tool" && !m.content.startsWith("[réduit]"));
      if (i < 0) break;
      messages[i] = { ...messages[i]!, content: `[réduit] ${tronquer(messages[i]!.content, 300)}` };
    }
    // Puis l'historique, du plus ancien au plus récent.
    while (estimerJetons(JSON.stringify(messages)) > placeMessages && nHisto > 0) {
      messages.splice(1, 1);
      nHisto--;
    }
    const dernier = appel === APPELS_MAX_PAR_MESSAGE;
    const rep = await d.modele({ model: MODELE, messages, tools: dernier ? [] : outils, max_tokens: JETONS_SORTIE_MAX });
    r.appelsModele++;
    r.jetonsEntree += rep.usage.prompt_tokens;
    r.jetonsSortie += rep.usage.completion_tokens;
    r.modele = rep.model || MODELE;
    const appels = rep.message.tool_calls ?? [];
    if (!appels.length || dernier) {
      r.reponse = (rep.message.content ?? "").trim() || "Je n'ai pas de réponse utile. Reformule ?";
      break;
    }
    messages.push({ role: "assistant", content: rep.message.content ?? "", tool_calls: appels });
    for (const a of appels) {
      const outil = OUTILS.find((o) => o.nom === a.function.name);
      let contenu: string;
      if (!outil) {
        await journal("outil.inconnu", a.function.name.slice(0, 60), "refuse");
        contenu = JSON.stringify({ erreur: "outil inconnu : action refusée" });
      } else {
        try {
          const args = JSON.parse(a.function.arguments || "{}") as Record<string, unknown>;
          const res = await outil.executer(args, { lecteur: d.lecteur, ecrivain: d.ecrivain, maintenant: entree.maintenant });
          r.outils.push(outil.nom);
          r.sources.push(...res.sources);
          if (res.brouillon) r.brouillons.push(res.brouillon);
          await journal(`outil.${outil.nom}`, null, "autorise");
          donneesOutils.push(JSON.stringify(res.donnees));
          contenu = tronquer(JSON.stringify({ donnees: res.donnees, sources: res.sources.slice(0, 20) }), 6000);
        } catch (e) {
          await journal(`outil.${outil.nom}`, null, "refuse");
          contenu = JSON.stringify({ erreur: (e as Error).message.slice(0, 200) });
        }
      }
      messages.push({ role: "tool", content: contenu, tool_call_id: a.id, name: a.function.name });
    }
  }
  r.coutUsd = coutUsd(r.jetonsEntree, r.jetonsSortie);
  // Garde des faits : une date sans source est signalée, jamais laissée passer.
  r.nonSourcees = datesSansSource(r.reponse, donneesOutils, entree.maintenant.slice(0, 10));
  if (r.nonSourcees.length) {
    r.reponse += `\n\nAttention : aucune donnée d'OIA ne contient ${r.nonSourcees.length > 1 ? "ces dates" : "cette date"} (${r.nonSourcees.join(", ")}). Ne t'y fie pas sans vérifier la source officielle.`;
    await journal("garde.date_sans_source", r.nonSourcees.join(",").slice(0, 200), "refuse");
  }
  // Sources dédoublonnées.
  r.sources = [...new Map(r.sources.map((s) => [`${s.vue}|${s.id}`, s])).values()];
  return r;
}

/** Adaptateur Mistral (API de chat). La clé n'est lue que par l'appelant serveur. */
export function modeleMistral(cle: string, fetchFn: typeof fetch = fetch): Modele {
  return async (req) => {
    const corps: Record<string, unknown> = { model: req.model, messages: req.messages, max_tokens: req.max_tokens, temperature: 0.1 };
    if (req.tools.length) Object.assign(corps, { tools: req.tools, tool_choice: "auto" });
    const rep = await fetchFn("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cle}` },
      body: JSON.stringify(corps),
    });
    if (!rep.ok) throw new Error(`Mistral : HTTP ${rep.status}`);
    const j = (await rep.json()) as { choices: { message: ReponseModele["message"] }[]; usage: ReponseModele["usage"]; model: string };
    return { message: j.choices[0]!.message, usage: j.usage, model: j.model };
  };
}
