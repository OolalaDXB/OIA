import { z } from "zod";

/**
 * Contrat de données « Shyrka exécutive » v1 (mandat v10, F4 ;
 * docs/interface/contrat-donnees-shyrka-executive-v1.md).
 *
 * Lovable possède l'interface ; ce contrat décrit les données. Il ne change
 * aucune vue v1 existante (contrat-donnees-v1.md, contrat-donnees-shyrka.md).
 * Chaque vue porte son état de connexion : une interface distingue connecté,
 * déconnecté, ancien, non autorisé et non implémenté.
 */

export const ETATS_VUE = ["connecte", "deconnecte", "ancien", "non_autorise", "non_implemente"] as const;

const Enveloppe = <T extends z.ZodTypeAny>(donnees: T) =>
  z.object({
    vue: z.string(),
    version: z.literal(1),
    etat: z.enum(ETATS_VUE),
    /** Date de production de la vue ; la date de chaque donnée source est portée par ses lignes. */
    produiteLe: z.string().datetime(),
    /** Origine : toujours le Mac de Mickaël en v1 ; jamais une adresse locale présentée comme accessible du cloud. */
    origine: z.literal("mac-local"),
    donnees: donnees.nullable(),
    motif: z.string().nullable(),
  });

export const SujetBriefV1 = z.object({
  titre: z.string(),
  nature: z.enum(["fait_observe", "recommandation"]),
  impact: z.string(),
  preuve: z.string(),
  recommandation: z.string(),
  action: z.string(),
  cible: z.string().nullable(),
});

export const BriefV1 = Enveloppe(
  z.object({
    depuis: z.string().nullable(),
    changements: z.array(z.string()),
    sujets: z.array(SujetBriefV1).max(3),
    opportunites: z
      .object({ total: z.number().int(), verifiees: z.number().int(), aRevoir: z.number().int(), dateDonnee: z.string().nullable(), pistes: z.array(z.object({ id: z.string(), titre: z.string(), echeance: z.string(), aConfirmer: z.boolean() })), regles: z.array(z.string()) })
      .nullable(),
    decisionsOuvertes: z.number().int(),
    budget: z.array(z.string()),
    dependances: z.array(z.string()),
  }),
);

export const CouvertureV1 = Enveloppe(
  z.array(
    z.object({
      produit: z.string(),
      controle: z.string(),
      cible: z.string(),
      etat: z.enum(["actif", "non_configure", "acces_manquant", "erreur"]),
      resultat: z.enum(["ok", "anomalie", "inconnu"]),
      detail: z.string(),
      preuve: z.string(),
      dateDonnee: z.string().nullable(),
      collecteLe: z.string(),
    }),
  ),
);

export const IncidentsV1 = Enveloppe(
  z.array(
    z.object({
      id: z.string().uuid(),
      produit: z.string(),
      source: z.string(),
      observation: z.string(),
      gravite: z.enum(["critique", "majeure", "mineure", "info"]),
      statut: z.enum(["nouveau", "confirme", "en_traitement", "resolu", "ignore_avec_motif"]),
      premiere: z.string(),
      derniere: z.string(),
      occurrences: z.number().int(),
      reapparitions: z.number().int(),
      preuve: z.string(),
      prochaineAction: z.string(),
      motif: z.string().nullable(),
    }),
  ),
);

export const MissionsV1 = Enveloppe(
  z.array(
    z.object({
      id: z.string().uuid(),
      objectif: z.string(),
      statut: z.enum(["proposee", "autorisee", "en_file", "en_cours", "en_verification", "attente_validation", "terminee", "bloquee", "echouee", "annulee"]),
      automatisation: z.enum(["automatique", "assiste", "simule"]),
      tentatives: z.number().int(),
      tentativesMax: z.number().int(),
      empreinteDiff: z.string().nullable(),
      pr: z.string().nullable(),
      causeBlocage: z.string().nullable(),
      coutUsd: z.number().nullable(),
      majLe: z.string(),
    }),
  ),
);

export const DecisionsV1 = Enveloppe(
  z.array(
    z.object({
      /** `mission:<uuid>`, `incident:<uuid>` ou `roadmap:<ligne>` : jamais un rang D01 comme clé. */
      cle: z.string(),
      intitule: z.string(),
      source: z.string(),
      action: z.string(),
    }),
  ),
);

/** Mémoire autorisée pour le cockpit : seulement la portée `cockpit`. En v1, aucune n'y est servie (non implémenté). */
export const MemoireAutoriseeV1 = Enveloppe(z.array(z.object({ id: z.string().uuid(), compartiment: z.string(), forme: z.string(), contenu: z.string(), statut: z.string(), provenance: z.string() })));

export const VuesExecutiveV1 = z.object({
  format: z.literal("shyrka.executive.vues"),
  version: z.literal(1),
  brief_v1: BriefV1,
  couverture_v1: CouvertureV1,
  incidents_v1: IncidentsV1,
  missions_v1: MissionsV1,
  decisions_v1: DecisionsV1,
  memoire_autorisee_v1: MemoireAutoriseeV1,
});
export type VuesExecutive = z.infer<typeof VuesExecutiveV1>;
