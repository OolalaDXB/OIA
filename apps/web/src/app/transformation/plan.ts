/** Personal 13-week transformation plan. Planning guidance, not a diagnosis or prescription. */
export const START = "2026-10-31";
export const END = "2027-01-31";
export const START_WEIGHT = 90;
export const HEIGHT_CM = 176;

export type IntakeKind = "repas" | "boisson" | "complement" | "medicament";
export type IntakeItem = {
  id: string;
  at: string;
  kind: IntakeKind;
  name: string;
  quantity: string;
  calories?: number;
  protein?: number;
};
export type DailyEntry = {
  date: string;
  weight?: number;
  waist?: number;
  sleepHours?: number;
  sleepQuality?: number;
  energy?: number;
  stress?: number;
  steps?: number;
  waterMl?: number;
  proteinG?: number;
  activityMinutes?: number;
  training?: string;
  diary?: string;
  intake: IntakeItem[];
  done: string[];
  updatedAt: string;
};

export const RITUALS = [
  { id: "morning", title: "Rituel du matin", detail: "15–25 min : mobilisation douce, gainage adapté, respiration ; arrêt si douleur." },
  { id: "skin", title: "Peau & protection", detail: "Nettoyant doux, hydratation, SPF 50 ; actif vitaminé seulement si bien toléré." },
  { id: "movement", title: "Bouger avec intention", detail: "Marche, renforcement progressif ou padel uniquement si mollet prêt." },
  { id: "evening", title: "Récupération du soir", detail: "10–20 min : stretching doux, soin peau, déconnexion, sommeil." },
];

export const WEEKS = [
  { title: "Point de départ", body: "Photos standardisées, poids/tour de taille, consultation sport si mollet fragile. 2 séances de renforcement très progressives et marche tolérée." },
  { title: "Régularité", body: "2 séances complètes sans douleur, mobilité matinale, sommeil stable. Padel uniquement après reprise fonctionnelle validée." },
  { title: "Construire la base", body: "2–3 renforcements selon tolérance, activité aérobie douce, alimentation documentée sans restriction excessive." },
  { title: "Premier bilan", body: "Photos comparatives, tour de taille, énergie et sommeil. Ajuster l'effort, pas la vitesse à tout prix." },
  { title: "Progression", body: "Musculation 3 fois/semaine si récupération bonne ; marche quotidienne et padel limité à 2 soirées." },
  { title: "Consolider", body: "Progression légère des charges, maintien du déficit alimentaire modéré, bilan dermatologie/trichologie." },
  { title: "Posture & mobilité", body: "Accent sur dos, épaules, chaîne postérieure et mobilité compatible avec la spondylarthrite." },
  { title: "Bilan intermédiaire", body: "Comparaison photos, poids moyen hebdomadaire, tour de taille. Préserver force, motivation et sommeil." },
  { title: "Finition capillaire", body: "Décider stratégie cheveux avec spécialiste, tester une coupe adaptée ; ne pas attendre de résultat de greffe en janvier." },
  { title: "Stabilité festive", body: "Maintenir l'essentiel : protéines végétariennes adaptées, eau, marche, deux séances utiles ; pas de compensation punitive." },
  { title: "Relance", body: "Revenir à une routine simple, vérifier récupération et régularité. Ajuster le volume sportif raisonnablement." },
  { title: "Présentation", body: "Coiffure, lunettes, style, barbe, peau ; séances sport sans surcharge avant les photos." },
  { title: "Bilan & suite", body: "Photos finales, mesures, points de progrès et plan de maintien février–avril. Ne pas tenter d'acte invasif de dernière minute." },
];

export const CARE = [
  { name: "Rééducation / sport", when: "Semaine 1", priority: "Essentiel", note: "Mollet après déchirure et spondylarthrite : reprise progressive, validation clinique si douleur ou faiblesse." },
  { name: "Dermatologie", when: "Semaines 1–3", priority: "Élevée", note: "Rougeurs du visage : diagnostic avant rétinol, acides, laser ou injections. SPF quotidien." },
  { name: "Trichologie / greffe", when: "Semaines 2–4", priority: "Élevée", note: "Miniaturisation et zone donneuse à évaluer. DHI est une modalité d'implantation, pas une garantie de meilleur résultat que FUE." },
  { name: "Ophtalmologie", when: "Semaines 2–5", priority: "Élevée", note: "Bilan presbytie et surface oculaire. Comparer lunettes, lentilles, laser et implants ; risque de halos, sécheresse, compromis visuels." },
  { name: "Coiffure, barbe, lunettes", when: "Semaines 4–11", priority: "Rapide", note: "Essayer une coupe raccourcie et une monture alternative, puis choisir en conditions réelles." },
  { name: "Interventions lourdes", when: "Après arbitrage médical", priority: "Optionnel", note: "Greffe capillaire : résultat complet typiquement plusieurs mois, souvent 9–12 mois. Chirurgie oculaire : seulement après bilan indépendant." },
];

export const BUDGET = [
  { label: "Consultations (sport, dermato, cheveux, yeux)", amount: 3000 },
  { label: "Coaching / gym / rééducation", amount: 4500 },
  { label: "Soins cutanés & barbier", amount: 1200 },
  { label: "Traitement capillaire / coiffure (hors greffe)", amount: 1500 },
  { label: "Lunettes / style", amount: 2500 },
  { label: "Nutrition & équipement", amount: 1300 },
  { label: "Réserve pour examens ou ajustements", amount: 4500 },
];

export function dateISO(value: Date): string {
  const y = value.getFullYear();
  return String(y) + "-" + String(value.getMonth() + 1).padStart(2, "0") + "-" + String(value.getDate()).padStart(2, "0");
}
export function dayNumber(date: string): number {
  const a = Date.parse(START + "T12:00:00Z");
  const b = Date.parse(date + "T12:00:00Z");
  return Number.isFinite(b) ? Math.max(1, Math.min(93, Math.floor((b - a) / 86400000) + 1)) : 1;
}
export function weekNumber(date: string): number { return Math.min(13, Math.ceil(dayNumber(date) / 7)); }
export function emptyEntry(date: string): DailyEntry {
  return { date, intake: [], done: [], updatedAt: new Date().toISOString() };
}
export function intention(e: DailyEntry, date: string): string {
  if (e.sleepHours !== undefined && e.sleepHours < 6.5) return "Priorité récupération : protège ton sommeil, bouge doucement, sans compenser par une séance intense.";
  if (e.energy !== undefined && e.energy <= 2) return "Aujourd'hui, gagne par la constance : mobilité légère, alimentation correcte et retour au calme.";
  const intents = [
    "Fais la première action avant d'attendre la motivation : 15 minutes de mobilité.",
    "La transformation se construit par des journées répétables, pas par des exploits.",
    "Protéger la récupération fait partie de l'entraînement.",
    "Observe ce que tu prends dans la journée ; ne juge pas, mesure.",
    "Une bonne posture et un bon sommeil ont aussi un impact visible.",
    "Choisis la qualité du mouvement plutôt que l'intensité.",
    "Finis la semaine avec de la régularité, même imparfaite.",
  ];
  return intents[(dayNumber(date) - 1) % intents.length] || intents[0]!;
}
