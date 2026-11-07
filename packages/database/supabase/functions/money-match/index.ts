// money-match (mandat v9, bloc D) : recherche assistée de Money Lookup.
// Connexion obligatoire, réservée aux membres du studio (contrôle en base :
// oia_ia_reserver). Candidats choisis par les règles dans ml_toutes_v1, lue
// avec la session de l'appelant ; Mistral classe et explique. Plafonds :
// 2 000 jetons d'entrée, 30 appels par jour, budget commun de 5 $ par mois.
// Journal : date, coût, nombre de candidats ; jamais le texte de la demande.
//
// POST { "texte": string, "projet"?: string }
// → { correspondances: [{ id, rang, titre, explication, informations_manquantes, source }], candidats, cout_usd, alerte_budget, message? }

import { modeleMistral } from "../../../../shyrka/src/serveur/conversation.ts";
import { COUT_MAX_RECHERCHE_USD, rechercher, type Opportunite } from "../../../../money-lookup/src/recherche.ts";
import { CORS, ErreurHttp, json, reponseErreur, reserver, session } from "../_commun/oia.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "POST seulement", code: "methode" }, 405);
  let appel: number | null = null;
  let s: Awaited<ReturnType<typeof session>> | null = null;
  try {
    s = await session(req);
    const corps = (await req.json().catch(() => ({}))) as { texte?: unknown; projet?: unknown };
    const texte = typeof corps.texte === "string" ? corps.texte.trim() : "";
    const projet = typeof corps.projet === "string" && /^[a-z0-9][a-z0-9-]{1,40}$/.test(corps.projet) ? corps.projet : undefined;
    if (!texte) throw new ErreurHttp(400, "demande vide", "vide");
    if (texte.length > 1000) throw new ErreurHttp(400, "demande trop longue (1 000 caractères au plus)", "trop_long");
    const cle = Deno.env.get("MISTRAL_API_KEY");
    if (!cle) throw new ErreurHttp(503, "modèle non configuré", "configuration");

    appel = await reserver(s, "money-match", COUT_MAX_RECHERCHE_USD, Math.ceil(texte.length / 3));
    const toutes = (await s.lire("ml_toutes_v1", {
      select: "id,titre,emetteur,nature,categorie,montant,devise,echeance,recommandation,gate_ok,projets_decouverte,projet_etiquete",
      limit: "5000",
    })) as unknown as Opportunite[];
    const r = await rechercher(texte, toutes, modeleMistral(cle), projet);
    const bilan = await s.rpc<{ alerte: boolean }>("oia_ia_regler", {
      p_appel: appel, p_ok: true, p_cout: r.coutUsd, p_jetons_entree: r.jetonsEntree, p_jetons_sortie: r.jetonsSortie,
      p_outils: [], p_nb_candidats: r.candidats, p_modele: r.local ? "aucun" : r.modele,
    });
    appel = null;
    return json({ correspondances: r.correspondances, candidats: r.candidats, cout_usd: r.coutUsd, alerte_budget: bilan?.alerte ?? false, ...(r.message ? { message: r.message } : {}) });
  } catch (e) {
    if (appel !== null && s) {
      await s.rpc("oia_ia_regler", { p_appel: appel, p_ok: false, p_cout: COUT_MAX_RECHERCHE_USD, p_jetons_entree: null, p_jetons_sortie: null, p_outils: [], p_nb_candidats: null, p_modele: null }).catch(() => {});
    }
    return reponseErreur(e);
  }
});
