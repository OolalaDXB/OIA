/**
 * Programme des séances d'entretien, lu dans docs/shyrka/entretiens.md, qui
 * reste la seule source : modifier une question, c'est modifier ce fichier.
 */
export interface Question {
  texte: string;
  relance?: string;
}

export interface Seance {
  numero: number;
  theme: string;
  /** Consigne de la séance (par exemple « Principes uniquement »). */
  consigne?: string;
  questions: Question[];
}

export function chargerProgramme(markdown: string): Seance[] {
  const seances: Seance[] = [];
  const blocs = markdown.split(/^### Séance /m).slice(1);
  for (const bloc of blocs) {
    const lignes = bloc.split("\n");
    const titre = lignes[0] ?? "";
    const m = /^(\d+)\s*·\s*(.+)$/.exec(titre.trim());
    if (!m) continue;
    const corps = lignes.slice(1).join("\n").split(/^##+ /m)[0] ?? "";
    const questions: Question[] = [];
    let consigne: string | undefined;
    for (const l of corps.split("\n")) {
      const q = /^\d+\.\s+(.+)$/.exec(l);
      const r = /^\s+-\s+Relance\s*:\s*(.+)$/.exec(l);
      const row = /^\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|$/.exec(l);
      if (q?.[1]) questions.push({ texte: q[1].trim() });
      else if (r?.[1] && questions.length > 0) questions[questions.length - 1]!.relance = r[1].trim();
      else if (row?.[2] && row[3]) questions.push({ texte: `${row[2]} : ${row[3]} Que réponds-tu, et Shyrka pourrait-elle répondre seule, après ta validation, ou jamais ?` });
      else if (!consigne && questions.length === 0 && l.trim() && !l.startsWith("|")) consigne = l.trim();
    }
    seances.push({ numero: Number(m[1]), theme: m[2]!.trim(), ...(consigne ? { consigne } : {}), questions });
  }
  return seances.sort((a, b) => a.numero - b.numero);
}

export const MISE_EN_ROUTE = "Pour commencer : la date, ton humeur du jour, et ce qui t'occupe en ce moment ?";
export const CLOTURE = "Qu'est-ce que tu as oublié de dire ?";

/** Les cinq techniques de relance du document. */
export const TECHNIQUES_RELANCE = [
  "L'histoire concrète : demander la dernière fois que c'est arrivé.",
  "Le pourquoi répété : descendre jusqu'à la vraie raison.",
  "Le contre-exemple : dans quel cas il ferait exactement l'inverse.",
  "Le dilemme : une situation à deux bonnes réponses.",
  "Le regard extérieur : ce que ses proches diraient de sa façon de faire.",
];
