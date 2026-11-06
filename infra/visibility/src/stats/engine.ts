/**
 * Moteur statistique pur. Prend des relevés quotidiens par fournisseur et
 * produit : agrégats, intervalles sur les jours observés, règle « pas de
 * changement démontrable », détection d'un changement de version du modèle.
 */

export interface DailySample {
  /** Jour UTC (YYYY-MM-DD). */
  day: string;
  provider: string;
  /** Version du modèle qui a répondu (chaîne opaque fournie par le collecteur). */
  modelVersion: string;
  /** Nombre de questions mesurées ce jour-là. */
  prompts: number;
  /** Combien de questions ont généré une mention de la marque. */
  brandMentions: number;
  /** Combien de questions ont cité au moins une URL du domaine de la marque. */
  brandCitations: number;
  /** Coût total de la journée (USD) pour ce fournisseur. */
  costUsd: number;
}

export interface WindowStats {
  windowDays: string[];
  provider: string;
  /** Moyenne quotidienne des mentions (sur les jours observés uniquement). */
  meanBrandMentions: number;
  /** Intervalle min/max par jour observé. */
  rangeBrandMentions: { min: number; max: number };
  /** Idem pour les citations. */
  meanBrandCitations: number;
  rangeBrandCitations: { min: number; max: number };
  /** Vrai si le jour-à-jour montre un changement démontrable (différence > intervalle). */
  demonstrableChange: boolean;
  /** Vrai si la modelVersion a changé pendant la fenêtre. */
  modelVersionChanged: boolean;
  totalCostUsd: number;
}

export function aggregateWindow(samples: DailySample[]): WindowStats | null {
  if (samples.length === 0) return null;
  const provider = samples[0]!.provider;
  if (samples.some((s) => s.provider !== provider)) {
    throw new Error("aggregateWindow: samples come from more than one provider");
  }
  const days = [...new Set(samples.map((s) => s.day))].sort();
  const mentions = samples.map((s) => s.brandMentions);
  const citations = samples.map((s) => s.brandCitations);
  const totalCost = samples.reduce((a, s) => a + s.costUsd, 0);

  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
  const range = (a: number[]) => ({ min: Math.min(...a), max: Math.max(...a) });

  const versions = new Set(samples.map((s) => s.modelVersion));
  const modelVersionChanged = versions.size > 1;

  // "Pas de changement démontrable" : le signal n'est démontrable que si la
  // série de jours est **monotone** (une seule direction) et sans dip. Un
  // creux ou un pic au milieu suffit pour conclure que la variation observée
  // relève du bruit. Règle volontairement conservatrice : on préfère rater
  // un changement réel plutôt qu'annoncer un changement qui n'en est pas un.
  const sortedByDay = [...samples].sort((a, b) => a.day.localeCompare(b.day));
  const first = sortedByDay[0]!;
  const last = sortedByDay[sortedByDay.length - 1]!;
  const trend = Math.sign(last.brandMentions - first.brandMentions);
  let demonstrableChange = trend !== 0;
  if (trend !== 0) {
    for (let i = 1; i < sortedByDay.length; i += 1) {
      const delta = Math.sign(sortedByDay[i]!.brandMentions - sortedByDay[i - 1]!.brandMentions);
      if (delta !== 0 && delta !== trend) {
        demonstrableChange = false;
        break;
      }
    }
  }

  return {
    windowDays: days,
    provider,
    meanBrandMentions: mean(mentions),
    rangeBrandMentions: range(mentions),
    meanBrandCitations: mean(citations),
    rangeBrandCitations: range(citations),
    demonstrableChange,
    modelVersionChanged,
    totalCostUsd: totalCost,
  };
}

/** Détermine les jours « manquants » (fenêtre théorique vs jours observés). */
export function missingDays(windowDays: string[], observedDays: string[]): string[] {
  const observed = new Set(observedDays);
  return windowDays.filter((d) => !observed.has(d));
}
