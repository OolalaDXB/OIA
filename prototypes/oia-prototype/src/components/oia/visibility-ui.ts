export const listeOngletsVisibility = "mb-8 grid gap-5 border-y border-border py-5 sm:grid-cols-2 xl:grid-cols-4";

const etiquettes: Record<string, string> = {
  a_valider: "À valider", rapport_a_valider: "Rapport à valider", concurrents_a_valider: "Concurrents à valider",
  owner: "Propriétaire", approver: "Approbateur", viewer: "Lecteur", editor: "Éditeur", membre: "Membre",
  pending: "À décider", accepted: "Acceptée", rejected: "Rejetée", propose: "Proposée", valide: "Validée",
  proposee: "Proposée", go_donne: "GO donné", en_cours: "En cours", terminee: "Terminée", annulee: "Annulée",
  QUEUED: "En file", RUNNING: "En cours", DONE: "Terminée", FAILED: "Échec", ANALYSE: "Analyse", MESURE: "Mesure",
  non_fixe: "Non fixé", proche: "Proche du plafond", atteint: "Plafond atteint", actif: "Actif",
  baseline: "Mesure initiale", reconnaissance: "Reconnaissance", remesure: "Remesure",
  a_venir: "À venir", manquant: "Manquant", partiel: "Partiel", complet: "Complet",
  high: "élevé", medium: "moyen", low: "faible",
  fr: "Français", en: "Anglais",
  muet: "Muet", en_retard: "En retard", actif_moteur: "Actif",
};
export function libelleVisibility(valeur: string | null | undefined, defaut = "Non fourni") {
  if (!valeur) return defaut;
  return etiquettes[valeur] ?? valeur.replaceAll("_", " ").replace(/^./, (c) => c.toLocaleUpperCase("fr-FR"));
}
export function libelleFenetreVisibility(valeur: string | null | undefined) {
  if (!valeur) return "Fenêtre non fournie";
  const court = valeur.match(/-j(\d+)$/i);
  if (court) return `Fenêtre J${court[1]}`;
  if (valeur.includes("hors-panel")) return "Fenêtre hors panel";
  return valeur;
}

export const listeSousOngletsVisibility = "mb-6 grid grid-cols-2 border-b border-border";

export const ongletVisibility = "inline-flex min-h-11 min-w-0 items-center justify-center whitespace-nowrap rounded-none border-b-2 border-transparent px-3 py-2 text-center text-sm font-normal text-muted-foreground data-[state=active]:border-module-visibility data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none lg:whitespace-normal";

export const menuVisibility = "min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-ring";
