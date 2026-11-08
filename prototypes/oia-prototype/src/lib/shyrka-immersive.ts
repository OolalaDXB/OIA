export const TRANSCRIPTION_SIMULEE = "Prépare mon prochain rendez-vous.";
export const DELAI_REFLEXION_MS = 650;
export const DELAI_ENVOI_MS = 4000;

export type PhaseImmersive = "repos" | "ecoute" | "reflexion";
export type ActionClavierImmersive = "plein-ecran" | "parole" | "envoyer" | "corriger" | "ecrire" | "annuler" | "aucune";

export function actionClavierImmersive({ key, repeat = false, modifieur = false, saisie = false, enAttente = false }: {
  key: string;
  repeat?: boolean;
  modifieur?: boolean;
  saisie?: boolean;
  enAttente?: boolean;
}): ActionClavierImmersive {
  if (saisie || modifieur) return "aucune";
  if (key.toLowerCase() === "f") return "plein-ecran";
  if (key === "Escape") return "annuler";
  if (key === " ") return repeat ? "aucune" : "parole";
  if (enAttente && key === "Enter") return "envoyer";
  if (enAttente && !["Shift", "Control", "Alt", "Meta", "Tab", "CapsLock"].includes(key)) return "corriger";
  if (key.length === 1) return "ecrire";
  return "aucune";
}

export function libelleImmersif(phase: PhaseImmersive, parle: boolean, pause: boolean) {
  if (pause) return "Pause";
  if (parle) return "Parle";
  if (phase === "ecoute") return "Écoute";
  if (phase === "reflexion") return "Réflexion";
  return "";
}
