// Données entièrement fictives , prototype de design OIA Visibility.
export type Etat = "conforme" | "verifier" | "bloquant";

export const utilisateur = { prenom: "Mickaël" };

export const modulesPersonnels = [
  { slug: "agenda", nom: "Agenda" },
  { slug: "sante", nom: "Santé" },
  { slug: "famille", nom: "Famille" },
] as const;

export const commandesShyrka = [
  "Résumer la journée",
  "Qu'est-ce qui attend ma validation ?",
  "Confier une mission à SEO Command",
] as const;

export type ReponseShyrka = { texte: string; actions: string[]; decisions: string[]; simulee: true };

export function simulerShyrka(demande: string): ReponseShyrka {
  const q = demande.toLocaleLowerCase("fr");
  if (q.includes("validation") || q.includes("valider")) {
    return { texte: `Cinq décisions attendent ta validation : ${aDecider.map((a) => a.titre.toLocaleLowerCase("fr")).join(" ; ")}. Aucune validation n’a été effectuée.`, actions: ["Examiner les cinq décisions en attente"], decisions: [], simulee: true };
  }
  if (q.includes("mission") || q.includes("seo command")) {
    return { texte: "Je note une mission pour SEO Command : rendre les prix de Studio Ardoise lisibles sans JavaScript. Elle reste à valider. Aucun agent n’a été lancé et aucune correction n’a été appliquée.", actions: [demande === commandesShyrka[2] ? "Préparer la mission SEO Command : rendre les prix lisibles" : demande], decisions: ["Garder la mission en attente de validation"], simulee: true };
  }
  if (q.includes("résum") || q.includes("journée")) {
    return { texte: "Aujourd’hui, trois sites sont suivis. Studio Ardoise affiche une présence de 12 % dans les assistants IA et trois points bloquants. Cinq décisions sont en attente ; les six agents SEO sont en veille. Aucune dépense engagée.", actions: ["Relire le résumé de la journée"], decisions: [], simulee: true };
  }
  if (q.includes("décid") || q.includes("choisis") || q.includes("priorité")) {
    return { texte: "Je consigne ton choix dans le journal de démonstration. Rien n’est appliqué à un site ou à un service extérieur.", actions: [], decisions: [demande], simulee: true };
  }
  return { texte: "Ta demande est notée dans le journal de démonstration. Je peux résumer la journée, rappeler les validations en attente ou préparer une mission pour SEO Command. Rien n’est envoyé ni exécuté.", actions: [demande], decisions: [], simulee: true };
}

export const aDecider = [
  { titre: "Valider le schéma des preuves", module: "Visibility", detail: "Structure des captures conservées pour chaque mesure." },
  { titre: "Créer les comptes prestataires et connecter Google", module: "Visibility", detail: "Nécessaire avant la première lecture Search Console." },
  { titre: "Valider le panel d'un site", module: "Visibility", detail: "Studio Ardoise : dix questions proposées." },
  { titre: "Pousser le travail de la nuit", module: "Visibility", detail: "Quatre corrections prêtes, en attente de relecture." },
  { titre: "Relire le cadre de l'assistant", module: "Visibility", detail: "Règles de ton et limites d'intervention." },
];

export const sites = [
  { slug: "studio-ardoise", nom: "Studio Ardoise", url: "studio-ardoise.fr", panel: "10 questions", depart: "2 nov. 2026", ia: 12, google: "Position moy. 18,4", etat: "verifier" as Etat },
  { slug: "studio-ardoise", nom: "Maison Kerlo", url: "maison-kerlo.fr", panel: "En attente", depart: "En attente", ia: null, google: "Non connecté", etat: "bloquant" as Etat },
  { slug: "studio-ardoise", nom: "Le Comptoir Iodé", url: "comptoir-iode.fr", panel: "12 questions", depart: "21 oct. 2026", ia: 27, google: "Position moy. 9,7", etat: "conforme" as Etat },
];

export const agents = ["Orchestrateur", "Technique", "SEO", "Contenu", "AEO", "Conversion"];
export const depenses = { montant: 0, plafond: 30 };

export const onboarding = {
  url: "studio-ardoise.fr",
  constats: [
    "48 pages lues",
    "Langues : français et anglais",
    "Trois offres repérées",
    "Prix présents mais invisibles sans JavaScript",
    "Quatre concurrents probables",
    "Trois points bloquants",
  ],
  activite: "Atelier de céramique",
  lieu: "Vannes, Morbihan",
  langues: "Français, anglais",
  offres: ["Cours d'initiation", "Stages du week-end", "Cours particuliers", "Cartes cadeaux"],
  concurrents: ["Atelier Terre de Rance", "Les Mains d'Argile", "Céramique du Ponant", "Tour et Émail"],
  connexions: [
    { nom: "Google Search Console", module: "Visibility", detail: "Requêtes, clics et pages indexées." },
    { nom: "Le dépôt du site", module: "Visibility", detail: "Permet de proposer des corrections précises." },
    { nom: "La fiche Google", module: "Visibility", detail: "Horaires, avis et catégorie de l'établissement." },
  ],
  questions: [
    { q: "Où prendre un cours de poterie à Vannes ?", marque: false },
    { q: "Quel atelier de céramique pour débutant dans le Morbihan ?", marque: false },
    { q: "Stage de tournage le week-end en Bretagne sud", marque: false },
    { q: "Idée de cadeau originale à Vannes", marque: false },
    { q: "Combien coûte un cours de céramique ?", marque: false },
    { q: "Cours particulier de poterie près de Vannes", marque: false },
    { q: "Activité créative en famille à Vannes", marque: false },
    { q: "Atelier céramique en anglais en Bretagne", marque: false },
    { q: "Studio Ardoise est-il un bon atelier ?", marque: true },
    { q: "Avis sur les stages du Studio Ardoise", marque: true },
  ],
  assistants: ["ChatGPT", "Claude", "Gemini", "Le Chat", "Perplexity"],
  bloquants: [
    "Vos prix n'apparaissent qu'une fois la page chargée : les IA ne les voient pas.",
    "La page des stages n'est pas autorisée à être lue par certains assistants.",
    "Votre adresse est écrite différemment sur le site et sur la fiche Google.",
  ],
  familles: [
    ["Exploration et accès des robots", 5, 1, 1],
    ["Indexation", 8, 0, 1],
    ["Rendu sans JavaScript", 3, 2, 0],
    ["Données structurées", 4, 1, 2],
    ["Identité de l'établissement", 5, 1, 0],
    ["Contenu des offres", 6, 0, 1],
    ["Prix et disponibilités", 2, 1, 1],
    ["Avis et preuves", 4, 0, 2],
    ["Multilingue", 4, 1, 1],
    ["Performance", 8, 0, 1],
    ["Liens internes", 8, 0, 0],
    ["Sources externes", 3, 0, 2],
    ["Conversion", 5, 0, 1],
  ] as [string, number, number, number][],
};

export const vueSite = {
  nom: "Studio Ardoise",
  url: "studio-ardoise.fr",
  presence: 12, min: 8, max: 16, jours: 5,
  parAssistant: [
    { nom: "ChatGPT", v: 14 }, { nom: "Claude", v: 9 }, { nom: "Gemini", v: 18 },
    { nom: "Le Chat", v: 6 }, { nom: "Perplexity", v: 12 },
  ],
  sources: [
    { nom: "tripadvisor.fr", n: 31 }, { nom: "pagesjaunes.fr", n: 22 },
    { nom: "ouest-france.fr", n: 14 }, { nom: "studio-ardoise.fr", n: 9 }, { nom: "reddit.com", n: 5 },
  ],
  concurrents: [
    { nom: "Atelier Terre de Rance", v: 41 }, { nom: "Les Mains d'Argile", v: 33 },
    { nom: "Céramique du Ponant", v: 22 }, { nom: "Tour et Émail", v: 17 },
  ],
  recommandations: [
    { etat: "bloquant" as Etat, titre: "Rendre les prix lisibles sans JavaScript", effet: "Questions sur les tarifs" },
    { etat: "bloquant" as Etat, titre: "Autoriser la lecture de la page des stages", effet: "3 questions du panel" },
    { etat: "bloquant" as Etat, titre: "Harmoniser l'adresse avec la fiche Google", effet: "Questions locales" },
    { etat: "verifier" as Etat, titre: "Ajouter une page en anglais pour les stages", effet: "1 question du panel" },
    { etat: "verifier" as Etat, titre: "Obtenir une mention dans la presse locale", effet: "Sources citées" },
    { etat: "conforme" as Etat, titre: "Décrire les cartes cadeaux en détail", effet: "Déjà en place" },
  ],
  historique: [
    { fenetre: "2 – 6 nov. 2026", v: 12, min: 8, max: 16, statut: "Mesure de départ" },
  ],
};

export const modules = [
  { slug: "visibility", nom: "Visibility", etat: "Priorité", statut: "verifier", role: "Mesurer et améliorer la présence des sites dans Google et les IA.", cle: "3 sites suivis · présence IA : 12 %", couleur: "module-visibility" },
  { slug: "money-lookup", nom: "Money Lookup", etat: "En veille", statut: "verifier", role: "Tout l'argent à aller chercher : financements, appels d'offres, investisseurs.", cle: "7 opportunités · 2 ferment sous 10 jours", couleur: "module-funding" },
  { slug: "crm", nom: "CRM", etat: "Briques en place", statut: "conforme", role: "Organiser les relations et leur suivi.", cle: "Cadre relationnel posé", couleur: "module-crm" },
  { slug: "portefeuille", nom: "Portefeuille", etat: "Briques en place", statut: "conforme", role: "Suivre les projets du studio et leur avancement.", cle: "4 projets suivis", couleur: "module-ventures" },
  { slug: "data", nom: "Data", etat: "À cadrer", statut: "verifier", role: "Rassembler et rendre les données exploitables.", cle: "Périmètre à définir", couleur: "module-data" },
  { slug: "training", nom: "Training", etat: "À cadrer", statut: "verifier", role: "Structurer les apprentissages et les parcours de formation.", cle: "Parcours à définir", couleur: "module-training" },
] as const;
export const activiteRecente = [
  { heure: "09:40", module: "Visibility", texte: "Fenêtre de mesure de Studio Ardoise terminée." },
  { heure: "09:15", module: "Visibility", texte: "Quatre corrections préparées pour relecture." },
  { heure: "08:50", module: "Shyrka", texte: "Cadre de l’assistante proposé à la validation." },
];
export const presenceInitiale = { microActif: false, pause: false };
export function etatPresence(microActif: boolean, pause: boolean, parle: boolean) {
  return pause ? "En pause" : parle ? "Shyrka parle" : microActif ? "Écoute" : "Micro coupé";
}
