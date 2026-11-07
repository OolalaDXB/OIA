// shyrka-chat (mandat v9, bloc G) : conversation réelle avec Shyrka, en texte.
// Connexion obligatoire, réservée aux comptes de Mickaël (contrôle en base :
// shy_exiger_mickael, via oia_ia_reserver). Mistral en direct, clé du projet
// lue ici seulement. Logique : packages/shyrka/src/serveur (testée avec un
// modèle simulé). Aucune clé de service.
//
// POST { "message": string, "conversation_id"?: uuid, "prive"?: boolean }
// → { conversation_id, reponse, sources, brouillons, outils, cout_usd, alerte_budget, prive }

import {
  COUT_MAX_MESSAGE_USD,
  RefusMessage,
  estimerJetons,
  modeleMistral,
  repondre,
  type Tour,
} from "../../../../shyrka/src/serveur/conversation.ts";
import { CORS, ErreurHttp, json, reponseErreur, reserver, session } from "../_commun/oia.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ erreur: "POST seulement", code: "methode" }, 405);
  let appel: number | null = null;
  let s: Awaited<ReturnType<typeof session>> | null = null;
  try {
    s = await session(req);
    const corps = (await req.json().catch(() => ({}))) as { message?: unknown; conversation_id?: unknown; prive?: unknown };
    const message = typeof corps.message === "string" ? corps.message : "";
    const conversation = typeof corps.conversation_id === "string" && UUID.test(corps.conversation_id) ? corps.conversation_id : null;
    const prive = corps.prive === true;
    if (!message.trim()) throw new ErreurHttp(400, "message vide", "vide");
    const cle = Deno.env.get("MISTRAL_API_KEY");
    if (!cle) throw new ErreurHttp(503, "modèle non configuré", "configuration");

    // Réservation AVANT tout : identité de Mickaël vérifiée en base, plafonds appliqués.
    appel = await reserver(s, "shyrka", COUT_MAX_MESSAGE_USD, Math.min(estimerJetons(message), 4001));

    const historique: Tour[] = [];
    if (conversation && !prive) {
      const lignes = await s.lire("shy_message", { select: "role,contenu", conversation_id: `eq.${conversation}`, order: "id.desc", limit: "20" });
      historique.push(...lignes.reverse().map((l) => ({ role: l.role as Tour["role"], contenu: String(l.contenu) })));
    }
    const ses = s;
    const r = await repondre(
      { message, historique, maintenant: new Date().toISOString() },
      {
        modele: modeleMistral(cle),
        lecteur: { lire: (vue, params) => ses.lire(vue, params) },
        ecrivain: {
          async creerBrouillon(type, titre, contenu) {
            if (prive) throw new Error("mode privé : aucun brouillon conservé");
            return await ses.rpc<string>("shy_creer_brouillon", { p_conversation: conversation, p_type: type, p_titre: titre, p_contenu: contenu });
          },
        },
        // Journal des actions, sans texte ; rien n'est conservé en mode privé.
        journaliser: async (quoi, cible, resultat) => {
          if (!prive) await ses.rpc("shy_journaliser", { p_acteur: "Shyrka", p_quoi: quoi.slice(0, 60), p_cible: cible, p_resultat: resultat });
        },
      },
    );
    const bilan = await s.rpc<{ alerte: boolean }>("oia_ia_regler", {
      p_appel: appel, p_ok: true, p_cout: r.coutUsd, p_jetons_entree: r.jetonsEntree, p_jetons_sortie: r.jetonsSortie,
      p_outils: r.outils, p_nb_candidats: null, p_modele: r.local ? "aucun" : r.modele,
    });
    appel = null;
    // Mode privé, ou message exclu (Swift) : rien n'est conservé.
    const conv = prive || r.exclu ? null : await s.rpc<string>("shy_enregistrer_echange", { p_conversation: conversation, p_message: message, p_reponse: r.reponse, p_sources: r.sources });
    return json({ conversation_id: conv, reponse: r.reponse, sources: r.sources, brouillons: r.brouillons, outils: r.outils, cout_usd: r.coutUsd, alerte_budget: bilan?.alerte ?? false, prive });
  } catch (e) {
    // Échec après réservation : on retient le coût maximal, par prudence.
    if (appel !== null && s) {
      await s.rpc("oia_ia_regler", { p_appel: appel, p_ok: false, p_cout: COUT_MAX_MESSAGE_USD, p_jetons_entree: null, p_jetons_sortie: null, p_outils: [], p_nb_candidats: null, p_modele: null }).catch(() => {});
    }
    if (e instanceof RefusMessage) return json({ erreur: e.message, code: e.code }, 400);
    return reponseErreur(e);
  }
});
