/**
 * Forme des réponses de modèle : un modèle rend parfois le tableau attendu à la racine, ou sous
 * une autre clé (« items », « liste »…). On le replace sous la clé attendue avant validation ;
 * le contenu n'est jamais modifié, seule l'enveloppe l'est.
 */
export function enveloppe(cle: string) {
  return (x: unknown): unknown => {
    if (Array.isArray(x)) return { [cle]: x };
    if (x && typeof x === "object" && !(cle in x)) {
      const tableaux = Object.entries(x as Record<string, unknown>).filter(([, v]) => Array.isArray(v));
      if (tableaux.length === 1) return { ...(x as Record<string, unknown>), [cle]: tableaux[0]![1] };
    }
    return x;
  };
}
