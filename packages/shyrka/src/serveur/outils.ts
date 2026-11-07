import { filtrerLignes } from "./filtre.ts";

/**
 * Outils de Shyrka côté serveur (mandat v9, G2 et G3). Chaque outil de lecture
 * interroge une vue du contrat AVEC LA SESSION DE MICKAËL (le `Lecteur` est
 * branché sur PostgREST avec son jeton) : les règles d'accès de la base
 * décident de ce que Shyrka voit. Chaque résultat porte sa source (vue,
 * identifiant, date). Le seul outil d'écriture prépare un brouillon : aucun
 * envoi, aucune publication, aucune suppression (CADRE.md, paliers 0 et 1).
 * L'espace personnel (Agenda, Santé, Famille) n'est pas connecté.
 */

export type Ligne = Record<string, unknown>;

export interface Lecteur {
  /** Lit une vue avec les filtres PostgREST donnés (`select`, `limit`, `order`, filtres). */
  lire(vue: string, params: Record<string, string>): Promise<Ligne[]>;
}

export interface Ecrivain {
  creerBrouillon(type: TypeBrouillon, titre: string, contenu: string): Promise<string>;
}

export type TypeBrouillon = "message" | "resume" | "plan_action" | "brouillon";

export interface Source {
  vue: string;
  id: string;
  date: string;
}

export interface ResultatOutil {
  donnees: unknown;
  sources: Source[];
  brouillon?: string;
}

interface DefinitionOutil {
  nom: string;
  description: string;
  parametres: Record<string, unknown>;
  ecrit: boolean;
  executer(args: Record<string, unknown>, d: { lecteur: Lecteur; ecrivain: Ecrivain; maintenant: string }): Promise<ResultatOutil>;
}

const PROJET = /^[a-z0-9][a-z0-9-]{1,40}$/;
const chaine = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (l: Ligne, ...cles: string[]) => String(cles.map((c) => l[c]).find((v) => typeof v === "string" && v) ?? "");

async function lireFiltre(lecteur: Lecteur, vue: string, params: Record<string, string>) {
  const { lignes, retirees } = filtrerLignes(await lecteur.lire(vue, params));
  return { lignes, retirees };
}

export const OUTILS: DefinitionOutil[] = [
  {
    nom: "etat_visibility",
    description: "État des mesures Visibility (fenêtre J0 en cours, jour N sur 5, réponses, coût) et les quatre indicateurs pour l'ensemble des moteurs.",
    parametres: { type: "object", properties: {}, additionalProperties: false },
    ecrit: false,
    async executer(_a, { lecteur, maintenant }) {
      const mesure = await lireFiltre(lecteur, "vis_mesure_v1", {
        select: "client_id,subject_id,window_id,type_fenetre,statut_fenetre,debut,fin,jours_prevus,jours_mesures,jours_manquants,reponses,reponses_jugees,questions,moteurs,versions_modele,cout_estime_usd,etat",
      });
      const apercu = await lireFiltre(lecteur, "vis_apercu_v1", {
        select: "window_id,moteur,indicateur,numerateur,denominateur,valeur,borne_basse,borne_haute,etat,raison_non_mesurable",
        moteur: "eq.tous",
      });
      return {
        donnees: { mesures: mesure.lignes, indicateurs: apercu.lignes },
        sources: [
          ...mesure.lignes.map((l) => ({ vue: "vis_mesure_v1", id: String(l.window_id), date: maintenant })),
          ...(apercu.lignes.length ? [{ vue: "vis_apercu_v1", id: "moteur=tous", date: maintenant }] : []),
        ],
      };
    },
  },
  {
    nom: "recommandations_visibility",
    description: "Recommandations et correctifs de Visibility avec leur état (en attente, validé, rejeté), et les rapports de fenêtre.",
    parametres: { type: "object", properties: {}, additionalProperties: false },
    ecrit: false,
    async executer(_a, { lecteur }) {
      const rec = await lireFiltre(lecteur, "vis_recommandations_v1", { select: "id,subject_id,type,titre,etat,risque,priorite,cree_le", order: "priorite.asc", limit: "20" });
      const rap = await lireFiltre(lecteur, "vis_rapports_v1", { select: "id,subject_id,window_id,type,statut,genere_le", limit: "10" });
      return {
        donnees: { recommandations: rec.lignes, rapports: rap.lignes },
        sources: [
          ...rec.lignes.map((l) => ({ vue: "vis_recommandations_v1", id: String(l.id), date: date(l, "cree_le") })),
          ...rap.lignes.map((l) => ({ vue: "vis_rapports_v1", id: String(l.id), date: date(l, "genere_le") })),
        ],
      };
    },
  },
  {
    nom: "opportunites",
    description: "Opportunités de Money Lookup (financements, appels d'offres, investisseurs), filtrées par projet (slug, ex. « sillon »), par mot du titre ou par nature. 15 au plus, échéance la plus proche d'abord.",
    parametres: {
      type: "object",
      properties: {
        projet: { type: "string", description: "slug du projet, en minuscules" },
        texte: { type: "string", description: "mot à chercher dans le titre" },
        nature: { type: "string", enum: ["GRANT", "TENDER", "EQUITY", "TAX_INCENTIVE", "DEBT_GUARANTEE", "PRIZE", "CONSORTIUM_CALL"] },
      },
      additionalProperties: false,
    },
    ecrit: false,
    async executer(a, { lecteur }) {
      const p: Record<string, string> = {
        select: "id,record_id,titre,emetteur,nature,categorie,montant,devise,montant_connu,echeance,statut_verification,decision_humaine,projets_decouverte,projet_etiquete,url_officielle,vu_la_derniere_fois",
        order: "echeance.asc.nullslast",
        limit: "15",
      };
      const projet = chaine(a.projet, 40).toLowerCase();
      if (projet && PROJET.test(projet)) p.projets_decouverte = `cs.{${projet}}`;
      const texte = chaine(a.texte, 40).replace(/[^\p{L}\p{N} -]/gu, "");
      if (texte) p.titre = `ilike.*${texte}*`;
      if (typeof a.nature === "string" && /^[A-Z_]{3,30}$/.test(a.nature)) p.nature = `eq.${a.nature}`;
      const r = await lireFiltre(lecteur, "ml_toutes_v1", p);
      // Total exact des correspondances (la liste est limitée à 15).
      const { select: _s, order: _o, limit: _l, ...filtres } = p;
      const total = (await lireFiltre(lecteur, "ml_toutes_v1", { ...filtres, select: "id", limit: "5000" })).lignes.length;
      return { donnees: { total_correspondantes: total, affichees: r.lignes.length, opportunites: r.lignes, retirees_par_filtre: r.retirees }, sources: r.lignes.map((l) => ({ vue: "ml_toutes_v1", id: String(l.id), date: date(l, "vu_la_derniere_fois") })) };
    },
  },
  {
    nom: "projets",
    description: "Projets suivis par Money Lookup, avec le nombre d'opportunités et de montants connus par projet.",
    parametres: { type: "object", properties: {}, additionalProperties: false },
    ecrit: false,
    async executer(_a, { lecteur, maintenant }) {
      const r = await lireFiltre(lecteur, "ml_toutes_v1", { select: "projets_decouverte,montant_connu", limit: "2000" });
      const parProjet: Record<string, { opportunites: number; montants_connus: number }> = {};
      for (const l of r.lignes) {
        for (const p of (l.projets_decouverte as string[] | null) ?? []) {
          parProjet[p] ??= { opportunites: 0, montants_connus: 0 };
          parProjet[p]!.opportunites++;
          if (l.montant_connu) parProjet[p]!.montants_connus++;
        }
      }
      return { donnees: { projets: parProjet, total_opportunites: r.lignes.length }, sources: [{ vue: "ml_toutes_v1", id: "par projet", date: maintenant }] };
    },
  },
  {
    nom: "taches_et_decisions",
    description: "Tâches ouvertes, opportunités sans décision humaine, correctifs Visibility en attente, et budget IA du mois.",
    parametres: { type: "object", properties: {}, additionalProperties: false },
    ecrit: false,
    async executer(_a, { lecteur, maintenant }) {
      const taches = await lireFiltre(lecteur, "tasks", { select: "id,title,due,status,project_slug,created_at", status: "eq.OPEN", order: "due.asc.nullslast", limit: "20" });
      const attente = await lireFiltre(lecteur, "ml_toutes_v1", { select: "id", decision_humaine: "eq.PENDING", limit: "2000" });
      const rec = await lireFiltre(lecteur, "vis_recommandations_v1", { select: "id,titre", etat: "eq.pending", limit: "20" });
      const budget = await lireFiltre(lecteur, "oia_ia_budget_v1", { select: "mois,plafond_usd,depense_usd,reste_usd,alerte", order: "mois.desc", limit: "1" });
      return {
        donnees: { taches_ouvertes: taches.lignes, opportunites_sans_decision: attente.lignes.length, correctifs_en_attente: rec.lignes, budget_ia: budget.lignes[0] ?? null },
        sources: [
          ...taches.lignes.map((l) => ({ vue: "tasks", id: String(l.id), date: date(l, "created_at") })),
          { vue: "ml_toutes_v1", id: "decision_humaine=PENDING", date: maintenant },
          ...rec.lignes.map((l) => ({ vue: "vis_recommandations_v1", id: String(l.id), date: maintenant })),
          { vue: "oia_ia_budget_v1", id: "mois courant", date: maintenant },
        ],
      };
    },
  },
  {
    nom: "preparer_brouillon",
    description: "Enregistre un brouillon (message, résumé, plan d'action) visible dans le cockpit. Ne l'envoie jamais : Mickaël relit et envoie lui-même.",
    parametres: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["message", "resume", "plan_action", "brouillon"] },
        titre: { type: "string" },
        contenu: { type: "string" },
      },
      required: ["type", "titre", "contenu"],
      additionalProperties: false,
    },
    ecrit: true,
    async executer(a, { ecrivain, maintenant }) {
      const type = (["message", "resume", "plan_action", "brouillon"] as const).find((t) => t === a.type) ?? "brouillon";
      const titre = chaine(a.titre, 200) || "Brouillon";
      const contenu = typeof a.contenu === "string" ? a.contenu.slice(0, 20000) : "";
      if (!contenu.trim()) throw new Error("brouillon vide");
      const id = await ecrivain.creerBrouillon(type, titre, contenu);
      return { donnees: { brouillon: id, statut: "brouillon", envoye: false }, sources: [{ vue: "shy_brouillon", id, date: maintenant }], brouillon: id };
    },
  },
];

/** Définitions au format « tools » de l'API de chat de Mistral. */
export function outilsPourLeModele() {
  return OUTILS.map((o) => ({ type: "function" as const, function: { name: o.nom, description: o.description, parameters: o.parametres } }));
}
