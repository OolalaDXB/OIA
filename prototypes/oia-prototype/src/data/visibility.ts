// Données fictives des vues de mesure Visibility.
import type { Etat } from "@/data/demo";

export type Valeur = { v: number | null; min: number; max: number };
export type IdFenetre = "f1" | "f2" | "f3";
export type Fenetre = { id: IdFenetre; label: string; type: "J0" | "Remesure"; enCours: boolean; jour?: number };

export const NOTE_MESURE = "Mesures réalisées par les API des assistants, avec recherche web. Les réponses des applications grand public peuvent différer.";

export const fenetres: [Fenetre, Fenetre, Fenetre] = [
  { id: "f3", label: "9 – 13 nov. 2026", type: "Remesure", enCours: true, jour: 2 },
  { id: "f2", label: "2 – 6 nov. 2026", type: "Remesure", enCours: false },
  { id: "f1", label: "26 – 30 oct. 2026", type: "J0", enCours: false },
];

export const assistants = [
  { nom: "ChatGPT", modele: "GPT", version: "gpt-5.2 (2026-09) · exemple fictif", recherche: true, derniere: "6 nov. 2026, 23:10" },
  { nom: "Claude", modele: "Claude", version: "claude-sonnet-5 (2026-08) · exemple fictif", recherche: true, derniere: "6 nov. 2026, 23:14" },
  { nom: "Gemini", modele: "Gemini", version: "gemini-3-pro (2026-10) · exemple fictif", recherche: true, derniere: "6 nov. 2026, 23:18" },
  { nom: "Le Chat", modele: "Mistral", version: "mistral-medium-4 (2026-07) · exemple fictif", recherche: false, derniere: "6 nov. 2026, 23:21" },
  { nom: "Perplexity", modele: "Sonar", version: "sonar-pro (2026-09) · exemple fictif", recherche: true, derniere: "6 nov. 2026, 23:25" },
] as const;
export type NomAssistant = (typeof assistants)[number]["nom"];

export const familles = ["Découverte locale", "Prix et offres", "Cadeaux et famille", "Votre marque"] as const;

export const questions = [
  { id: "q1", q: "Où prendre un cours de poterie à Vannes ?", famille: "Découverte locale", langue: "fr", marque: false },
  { id: "q2", q: "Quel atelier de céramique pour débutant dans le Morbihan ?", famille: "Découverte locale", langue: "fr", marque: false },
  { id: "q3", q: "Stage de tournage le week-end en Bretagne sud", famille: "Prix et offres", langue: "fr", marque: false },
  { id: "q4", q: "Idée de cadeau originale à Vannes", famille: "Cadeaux et famille", langue: "fr", marque: false },
  { id: "q5", q: "Combien coûte un cours de céramique ?", famille: "Prix et offres", langue: "fr", marque: false },
  { id: "q6", q: "Activité créative en famille à Vannes", famille: "Cadeaux et famille", langue: "fr", marque: false },
  { id: "q7", q: "Pottery class in Brittany in English", famille: "Découverte locale", langue: "en", marque: false },
  { id: "q8", q: "Studio Ardoise est-il un bon atelier ?", famille: "Votre marque", langue: "fr", marque: true },
  { id: "q9", q: "Avis sur les stages du Studio Ardoise", famille: "Votre marque", langue: "fr", marque: true },
] as const;

export const marque = {
  nom: "Studio Ardoise", sites: ["studio-ardoise.fr"], alias: ["Atelier Ardoise", "Studio Ardoise Vannes"],
  profils: [{ reseau: "Instagram", handle: "@studio.ardoise" }, { reseau: "TikTok", handle: "@studioardoise" }, { reseau: "Facebook", handle: "Studio Ardoise Vannes" }],
};

export const concurrents = [
  { nom: "Atelier Terre de Rance", categorie: "Atelier indépendant" },
  { nom: "Les Mains d'Argile", categorie: "Atelier associatif" },
  { nom: "Céramique du Ponant", categorie: "Atelier indépendant" },
  { nom: "Tour et Émail", categorie: "Cours en ligne" },
];

/** Indicateurs par fenêtre ; en cours = valeurs provisoires jamais affichées comme définitives. */
export const indicateurs: Record<IdFenetre, { presence: Valeur; partVoix: Valeur; exactitude: Valeur; position: Valeur; sentiment: { positif: number; neutre: number; negatif: number } }> = {
  f1: { presence: { v: 9, min: 5, max: 13 }, partVoix: { v: 8, min: 5, max: 11 }, exactitude: { v: 71, min: 62, max: 80 }, position: { v: 4.1, min: 3.4, max: 4.8 }, sentiment: { positif: 58, neutre: 38, negatif: 4 } },
  f2: { presence: { v: 12, min: 8, max: 16 }, partVoix: { v: 11, min: 8, max: 14 }, exactitude: { v: 64, min: 55, max: 73 }, position: { v: 3.6, min: 3.0, max: 4.2 }, sentiment: { positif: 61, neutre: 35, negatif: 4 } },
  f3: { presence: { v: 15, min: 6, max: 24 }, partVoix: { v: 13, min: 6, max: 20 }, exactitude: { v: null, min: 0, max: 0 }, position: { v: 3.2, min: 2.1, max: 4.3 }, sentiment: { positif: 60, neutre: 36, negatif: 4 } },
};

/** Présence par assistant et par fenêtre ; null = non mesurable. */
export const presenceAssistant: Record<IdFenetre, Record<NomAssistant, Valeur>> = {
  f1: { ChatGPT: { v: 10, min: 5, max: 15 }, Claude: { v: 7, min: 3, max: 11 }, Gemini: { v: 14, min: 9, max: 19 }, "Le Chat": { v: 4, min: 1, max: 7 }, Perplexity: { v: 10, min: 5, max: 15 } },
  f2: { ChatGPT: { v: 14, min: 9, max: 19 }, Claude: { v: 9, min: 5, max: 13 }, Gemini: { v: 18, min: 12, max: 24 }, "Le Chat": { v: null, min: 0, max: 0 }, Perplexity: { v: 12, min: 7, max: 17 } },
  f3: { ChatGPT: { v: 16, min: 6, max: 26 }, Claude: { v: 11, min: 3, max: 19 }, Gemini: { v: 20, min: 10, max: 30 }, "Le Chat": { v: null, min: 0, max: 0 }, Perplexity: { v: 14, min: 5, max: 23 } },
};

export const presenceQuestion: Record<string, number | null> = { q1: 22, q2: 11, q3: 0, q4: 18, q5: null, q6: 9, q7: 0, q8: 74, q9: 66 };

/** Série temporelle de présence (%) par fenêtre, marque puis concurrents. */
export const serie = {
  fenetres: ["26 – 30 oct.", "2 – 6 nov.", "9 – 13 nov."],
  lignes: [
    { nom: "Studio Ardoise", marque: true, v: [9, 12, 15] },
    { nom: "Atelier Terre de Rance", marque: false, v: [44, 41, 40] },
    { nom: "Les Mains d'Argile", marque: false, v: [30, 33, 31] },
    { nom: "Céramique du Ponant", marque: false, v: [24, 22, 23] },
    { nom: "Tour et Émail", marque: false, v: [15, 17, 16] },
  ],
};

/** Part de voix par concurrent et par assistant (fenêtre définitive f2). */
export const partVoix = {
  global: [{ nom: "Atelier Terre de Rance", v: 34 }, { nom: "Les Mains d'Argile", v: 27 }, { nom: "Céramique du Ponant", v: 18 }, { nom: "Tour et Émail", v: 10 }, { nom: "Studio Ardoise", v: 11 }],
  parAssistant: { ChatGPT: 12, Claude: 8, Gemini: 16, "Le Chat": null, Perplexity: 11 } as Record<NomAssistant, number | null>,
  parQuestion: { q1: 18, q2: 9, q3: 0, q4: 15, q5: null, q6: 7, q7: 0, q8: 81, q9: 70 } as Record<string, number | null>,
};

export type Sentiment = "positif" | "neutre" | "negatif";
export const reponses = [
  { id: "r1", question: "q1", assistant: "ChatGPT", date: "4 nov. 2026, 14:02", fenetre: "f2", sentiment: "positif" as Sentiment,
    texte: "À Vannes, plusieurs ateliers proposent des cours de poterie. Atelier Terre de Rance est souvent recommandé pour ses cours hebdomadaires. Studio Ardoise propose des initiations au tour dans un cadre chaleureux, avec de petits groupes. Les Mains d'Argile organise aussi des ateliers associatifs.",
    sources: ["tripadvisor.fr", "studio-ardoise.fr", "ouest-france.fr"], recherches: ["cours poterie Vannes", "atelier céramique Vannes avis"], pages: ["tripadvisor.fr/Attractions-Vannes", "studio-ardoise.fr/cours", "ouest-france.fr/vannes/poterie"] },
  { id: "r2", question: "q5", assistant: "Claude", date: "4 nov. 2026, 14:10", fenetre: "f2", sentiment: "neutre" as Sentiment,
    texte: "Un cours de céramique coûte généralement entre 25 et 60 € la séance. Céramique du Ponant affiche ses tarifs en ligne. Je n'ai pas trouvé de prix publiés pour d'autres ateliers de la région.",
    sources: ["ceramique-ponant.fr", "pagesjaunes.fr"], recherches: ["prix cours céramique Bretagne", "tarif atelier poterie Morbihan"], pages: ["ceramique-ponant.fr/tarifs", "pagesjaunes.fr/poterie-vannes"] },
  { id: "r3", question: "q8", assistant: "Gemini", date: "5 nov. 2026, 09:31", fenetre: "f2", sentiment: "positif" as Sentiment,
    texte: "Studio Ardoise est un atelier de céramique à Vannes apprécié pour son accueil et la qualité de ses stages du week-end. Les avis soulignent la pédagogie. Certains avis indiquent une adresse rue du Port, d'autres place Lucien Laroche.",
    sources: ["google.com/maps", "studio-ardoise.fr", "instagram.com/studio.ardoise"], recherches: ["Studio Ardoise Vannes avis", "Studio Ardoise adresse"], pages: ["google.com/maps/studio-ardoise", "instagram.com/studio.ardoise"] },
  { id: "r4", question: "q4", assistant: "Perplexity", date: "5 nov. 2026, 10:05", fenetre: "f2", sentiment: "positif" as Sentiment,
    texte: "Pour un cadeau original à Vannes : une carte cadeau pour un stage de céramique chez Studio Ardoise, un atelier chez Les Mains d'Argile, ou une balade en mer dans le golfe.",
    sources: ["studio-ardoise.fr", "golfe-du-morbihan.fr", "reddit.com"], recherches: ["idée cadeau Vannes expérience", "carte cadeau atelier Vannes"], pages: ["studio-ardoise.fr/cartes-cadeaux", "golfe-du-morbihan.fr/idees"] },
  { id: "r5", question: "q3", assistant: "ChatGPT", date: "5 nov. 2026, 11:20", fenetre: "f2", sentiment: "neutre" as Sentiment,
    texte: "Pour un stage de tournage le week-end en Bretagne sud, Atelier Terre de Rance et Tour et Émail proposent des formules de deux jours. Réservez tôt en saison.",
    sources: ["terre-de-rance.fr", "tour-et-email.com"], recherches: ["stage tournage week-end Bretagne", "stage poterie 2 jours Morbihan"], pages: ["terre-de-rance.fr/stages", "tour-et-email.com/stages"] },
  { id: "r6", question: "q9", assistant: "Claude", date: "5 nov. 2026, 15:44", fenetre: "f2", sentiment: "negatif" as Sentiment,
    texte: "Les stages du Studio Ardoise reçoivent de bons avis, mais quelques participants regrettent que les prix ne soient pas indiqués clairement avant la réservation.",
    sources: ["tripadvisor.fr", "studio-ardoise.fr"], recherches: ["Studio Ardoise stages avis", "Studio Ardoise prix stage"], pages: ["tripadvisor.fr/studio-ardoise", "studio-ardoise.fr/stages"] },
  { id: "r7", question: "q2", assistant: "Le Chat", date: "6 nov. 2026, 08:12", fenetre: "f2", sentiment: "neutre" as Sentiment,
    texte: "Dans le Morbihan, Les Mains d'Argile et Céramique du Ponant accueillent les débutants avec des cours d'initiation.",
    sources: [], recherches: [], pages: [] },
  { id: "r8", question: "q6", assistant: "Gemini", date: "6 nov. 2026, 09:50", fenetre: "f2", sentiment: "positif" as Sentiment,
    texte: "En famille à Vannes, essayez un atelier parent enfant : Studio Ardoise en organise le samedi matin, et Les Mains d'Argile pendant les vacances.",
    sources: ["studio-ardoise.fr", "vannes-tourisme.com"], recherches: ["activité famille Vannes atelier", "atelier parent enfant Vannes"], pages: ["vannes-tourisme.com/famille", "studio-ardoise.fr/famille"] },
];

export const citations = [
  { source: "tripadvisor.fr", n: 31, aVous: false, type: "Avis" },
  { source: "pagesjaunes.fr", n: 22, aVous: false, type: "Annuaire" },
  { source: "ouest-france.fr", n: 14, aVous: false, type: "Presse" },
  { source: "studio-ardoise.fr", n: 9, aVous: true, type: "Site" },
  { source: "terre-de-rance.fr", n: 8, aVous: false, type: "Concurrent" },
  { source: "instagram.com/studio.ardoise", n: 4, aVous: true, type: "Profil social" },
  { source: "reddit.com", n: 5, aVous: false, type: "Forum" },
  { source: "vannes-tourisme.com", n: 3, aVous: false, type: "Tourisme" },
];

export const opportunites = [
  { sujet: "Prix des cours de céramique", source: "ceramique-ponant.fr", concurrents: ["Céramique du Ponant"], piste: "Publier une page de tarifs lisible sans JavaScript, avec les prix par formule." },
  { sujet: "Stages du week-end en Bretagne sud", source: "terre-de-rance.fr", concurrents: ["Atelier Terre de Rance", "Tour et Émail"], piste: "Créer une page dédiée aux stages de deux jours, avec dates et niveau." },
  { sujet: "Cours en anglais", source: "reddit.com", concurrents: ["Tour et Émail"], piste: "Traduire la page des stages et la signaler aux annuaires anglophones." },
  { sujet: "Presse locale", source: "ouest-france.fr", concurrents: ["Atelier Terre de Rance", "Les Mains d'Argile"], piste: "Proposer un sujet à la rédaction locale sur les ateliers parent enfant." },
];

export const reseaux = [
  { reseau: "Instagram", handle: "@studio.ardoise", citations: 4, controles: [
    { nom: "Nom", etat: "conforme" as Etat, detail: "Studio Ardoise" }, { nom: "Ville", etat: "conforme" as Etat, detail: "Vannes" },
    { nom: "Offres", etat: "verifier" as Etat, detail: "Cours particuliers absents" }, { nom: "Lien vers le site", etat: "conforme" as Etat, detail: "studio-ardoise.fr" } ] },
  { reseau: "TikTok", handle: "@studioardoise", citations: 0, controles: [
    { nom: "Nom", etat: "conforme" as Etat, detail: "Studio Ardoise" }, { nom: "Ville", etat: "bloquant" as Etat, detail: "Ville absente" },
    { nom: "Offres", etat: "verifier" as Etat, detail: "Aucune offre décrite" }, { nom: "Lien vers le site", etat: "bloquant" as Etat, detail: "Lien manquant" } ] },
  { reseau: "Facebook", handle: "Studio Ardoise Vannes", citations: 1, controles: [
    { nom: "Nom", etat: "verifier" as Etat, detail: "Studio Ardoise Vannes" }, { nom: "Ville", etat: "conforme" as Etat, detail: "Vannes" },
    { nom: "Offres", etat: "conforme" as Etat, detail: "Trois offres" }, { nom: "Lien vers le site", etat: "conforme" as Etat, detail: "studio-ardoise.fr" } ] },
];

/** Comparaison avant et après sur les questions communes à J0 et à la remesure. */
export const rapports = [
  { id: "f1", titre: "Rapport J0", fenetre: "26 – 30 oct. 2026", statut: "Définitif" },
  { id: "f2", titre: "Remesure 1", fenetre: "2 – 6 nov. 2026", statut: "Définitif" },
  { id: "f3", titre: "Remesure 2", fenetre: "9 – 13 nov. 2026", statut: "Mesure en cours, jour 2 sur 5" },
];
export const comparaison = [
  { question: "q1", avant: 15, apres: 22 }, { question: "q2", avant: 8, apres: 11 }, { question: "q4", avant: 18, apres: 18 },
  { question: "q5", avant: null, apres: null }, { question: "q8", avant: 70, apres: 74 }, { question: "q9", avant: 69, apres: 66 },
];

export const etatCollecte = { questions: 9, reponses: 135, frequence: "Une fenêtre de cinq jours par semaine", derniere: "6 nov. 2026, 23:25" };

/** Un écart n'est significatif que si les intervalles ne se recouvrent pas. */
export function significatif(a: Valeur, b: Valeur) { return a.v !== null && b.v !== null && (a.max < b.min || b.max < a.min); }
