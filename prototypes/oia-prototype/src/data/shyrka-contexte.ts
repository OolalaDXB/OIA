// Données fictives de la zone Contexte de Shyrka.
export type StatutContexte = "À valider" | "Validé" | "Retiré";
export type CategorieContexte = "Toi" | "Projets" | "Personnes" | "Préférences" | "Décisions";
export type ElementContexte = { id: string; categorie: CategorieContexte; texte: string; source: string; date: string; statut: StatutContexte };
export const categoriesContexte: CategorieContexte[] = ["Toi", "Projets", "Personnes", "Préférences", "Décisions"];
export const contexteInitial: ElementContexte[] = [
  { id: "c1", categorie: "Toi", texte: "Mickaël dirige un studio de projets entre Vannes et Dubaï.", source: "Conversation", date: "2 nov. 2026", statut: "Validé" },
  { id: "c2", categorie: "Projets", texte: "Visibility est le module prioritaire jusqu'à la première boucle complète.", source: "Module Visibility", date: "3 nov. 2026", statut: "Validé" },
  { id: "c3", categorie: "Personnes", texte: "Claire suit la comptabilité de Studio Ardoise.", source: "Courrier", date: "4 nov. 2026", statut: "À valider" },
  { id: "c4", categorie: "Préférences", texte: "Réponses courtes, sans tiret cadratin.", source: "Conversation", date: "5 nov. 2026", statut: "Validé" },
  { id: "c5", categorie: "Décisions", texte: "Plafond de dépense Visibility fixé à 30 $ par mois.", source: "Réglages", date: "5 nov. 2026", statut: "Validé" },
  { id: "c6", categorie: "Projets", texte: "Funding reprend après Visibility.", source: "Conversation", date: "1 nov. 2026", statut: "Retiré" },
];
export const sourcesShyrka = [
  { id: "oia", nom: "Modules d'OIA", perimetre: "Visibility, Money Lookup, CRM, Portefeuille" },
  { id: "courrier", nom: "Courrier", perimetre: "Boîte professionnelle, 90 derniers jours" },
  { id: "whatsapp", nom: "WhatsApp professionnel", perimetre: "Conversations clients uniquement" },
  { id: "corpus", nom: "Corpus", perimetre: "Documents déposés dans Data" },
  { id: "entretiens", nom: "Entretiens", perimetre: "Transcriptions validées" },
];
export const paliers = ["Aucun", "Lire", "Préparer", "Répondre après validation", "Envoyer seule"] as const;
export type Palier = (typeof paliers)[number];
export const canaux = ["Courrier", "WhatsApp professionnel", "Modules d'OIA", "Agenda"] as const;
export const categoriesPermission = ["Clients", "Partenaires", "Administration", "Personnel"] as const;
export function permissionsInitiales(): Record<string, Palier> {
  const p: Record<string, Palier> = {};
  for (const c of canaux) for (const k of categoriesPermission) p[`${c}|${k}`] = "Aucun";
  return p;
}
export const cadreInitial = "Shyrka assiste Mickaël. Elle prépare, propose et résume ; elle n'agit jamais seule sans validation. Elle signale toujours ce qui est simulé ou non vérifié. Elle parle en français, sobrement, sans tiret cadratin.";
export const identite = {
  apparence: "Sphère dense de points lumineux bleus, qui suggère un visage quand elle parle.",
  voix: "Voix féminine posée, débit lent, aucune voix réelle utilisée dans ce prototype.",
  personnalite: "Calme, précise, discrète ; propose plus qu'elle n'affirme.",
  versions: [
    { version: "0.3", date: "7 nov. 2026", note: "Sphère de particules et visage en parole." },
    { version: "0.2", date: "5 nov. 2026", note: "Présence plein écran avec micro simulé." },
    { version: "0.1", date: "2 nov. 2026", note: "Nuage de points et conversation simulée." },
  ],
};
export const applications = [
  { nom: "OIA", etat: "Présente", lire: "Modules, décisions, journal", faire: "Préparer des missions et des résumés" },
  { nom: "Courrier", etat: "Prévue", lire: "Rien pour l'instant", faire: "Rien pour l'instant" },
  { nom: "WhatsApp professionnel", etat: "Prévue", lire: "Rien pour l'instant", faire: "Rien pour l'instant" },
];
