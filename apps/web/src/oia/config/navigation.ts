import type { Etat } from "@/data/demo";

/**
 * Navigation de l'interface OIA (/oia) : fichier unique, à changer sans
 * toucher au code (mandat v7, F2). Structure proposée, à valider par Mickaël
 * (docs/interface/integration-console.md).
 */

export interface PageExistante {
  id: string;
  label: string;
  /** Page actuelle de la console, affichée telle quelle dans la nouvelle coquille. */
  href: string;
}

export interface ModuleNav {
  slug: string;
  nom: string;
  /** État affiché en clair, et son point discret. */
  etat: string;
  statut: Etat;
  role: string;
  cle: string;
  /** Classe de couleur sourde (jetons de packages/ui-tokens). */
  couleur: string;
  /** Pages existantes réutilisées. Absent : page « Module en préparation ». */
  pages?: PageExistante[];
}

export const modules: ModuleNav[] = [
  {
    slug: "visibility",
    nom: "Visibility",
    etat: "Priorité",
    statut: "verifier",
    role: "Mesurer et améliorer la présence des sites dans Google et les IA.",
    cle: "En ligne : données de démonstration. Vraies données : pnpm vis:j0-view, en local.",
    couleur: "module-visibility",
  },
  {
    slug: "opportunites",
    nom: "Opportunités",
    etat: "En pause",
    statut: "verifier",
    role: "Financements, appels d'offres, investisseurs, veille et montants.",
    cle: "Pages actuelles de la console, reprises telles quelles.",
    couleur: "module-opportunites",
    pages: [
      { id: "financements", label: "Financements", href: "/grants/" },
      { id: "appels-offres", label: "Appels d'offres", href: "/tenders/" },
      { id: "investisseurs", label: "Investisseurs", href: "/investors/" },
      { id: "veille", label: "Veille", href: "/alerts/" },
      { id: "montants", label: "Montants", href: "/money/" },
    ],
  },
  {
    slug: "crm",
    nom: "CRM",
    etat: "Page en place",
    statut: "conforme",
    role: "Les contacts et leur suivi.",
    cle: "Page Contacts de la console.",
    couleur: "module-crm",
    pages: [{ id: "contacts", label: "Contacts", href: "/contacts/" }],
  },
  {
    slug: "portefeuille",
    nom: "Portefeuille",
    etat: "Page en place",
    statut: "conforme",
    role: "Les projets du studio et leurs fiches.",
    cle: "Page Projets de la console.",
    couleur: "module-portefeuille",
    pages: [{ id: "projets", label: "Projets", href: "/projects/" }],
  },
  { slug: "data", nom: "Data", etat: "À cadrer", statut: "verifier", role: "Rassembler et rendre les données exploitables.", cle: "Périmètre à définir.", couleur: "module-data" },
  { slug: "training", nom: "Training", etat: "À cadrer", statut: "verifier", role: "Structurer les apprentissages et les parcours de formation.", cle: "Parcours à définir.", couleur: "module-training" },
];

export const modulesPersonnels = [
  { slug: "agenda", nom: "Agenda" },
  { slug: "sante", nom: "Santé" },
  { slug: "famille", nom: "Famille" },
] as const;

/**
 * Dépense du mois, toujours visible sous la colonne. Aucune source en ligne
 * sûre aujourd'hui : la dépense réelle vit hors du dépôt (journal de
 * cost-guard.sh) et chez chaque fournisseur. Valeur de démonstration, signalée.
 */
export const depenseDuMois = { montant: 0, plafond: 30, source: "démonstration" as const };

/**
 * Bascule (mandat v7, F6) : une seule ligne fait de /oia la page d'accueil et
 * redirige les anciennes adresses. Désactivée : c'est Mickaël qui décidera.
 * Elle n'a d'effet que si /oia est elle-même allumée (oia-flag.mjs).
 */
export const BASCULE_ACCUEIL = false;

/** Redirections appliquées seulement après la bascule. */
export const REDIRECTIONS: Record<string, string> = {
  "/": "/oia/opportunites/?onglet=financements",
  "/digest/": "/oia/",
  "/grants/": "/oia/opportunites/?onglet=financements",
  "/tenders/": "/oia/opportunites/?onglet=appels-offres",
  "/investors/": "/oia/opportunites/?onglet=investisseurs",
  "/alerts/": "/oia/opportunites/?onglet=veille",
  "/money/": "/oia/opportunites/?onglet=montants",
  "/metrics/": "/oia/opportunites/?onglet=montants",
  "/projects/": "/oia/portefeuille/",
  "/contacts/": "/oia/crm/",
  "/workspace/": "/oia/",
  "/tasks/": "/oia/",
  "/notes/": "/oia/",
};
