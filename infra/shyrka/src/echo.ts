import { normaliser } from "./dialogue.js";

/**
 * Mesure d'écho (P2, étude du barge-in) : quelle part de la phrase dite par
 * Aurélie le micro a-t-il captée, une fois transcrite ? Proche de 1 : sans
 * annulation d'écho, Shyrka entendrait sa propre voix et un « Stop Shyrka »
 * vocal se déclencherait sur elle-même. Proche de 0 : l'écho est contenu.
 */
export function tauxEcho(phraseDite: string, transcription: string): number {
  const mots = (t: string) => normaliser(t).split(/[^a-z0-9]+/).filter((m) => m.length >= 4);
  const dits = [...new Set(mots(phraseDite))];
  if (dits.length === 0) return 0;
  const entendus = new Set(mots(transcription));
  return Math.round((dits.filter((m) => entendus.has(m)).length / dits.length) * 100) / 100;
}

export function verdictEcho(taux: number): string {
  if (taux >= 0.5) return `Écho fort (${taux}) : le micro capte la voix d'Aurélie. Un barge-in vocal exige une annulation d'écho ou un casque.`;
  if (taux >= 0.2) return `Écho partiel (${taux}) : faux déclenchements probables sans annulation d'écho.`;
  return `Écho faible (${taux}) : la voix d'Aurélie n'est presque pas reconnue au micro.`;
}

/** Phrase de test, prononcée par Aurélie pendant l'enregistrement. */
export const PHRASE_ECHO = "Bonjour Mickaël, ceci est une phrase de contrôle pour mesurer l'écho de ma propre voix dans le micro du studio.";
