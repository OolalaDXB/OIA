export const NATURES_ENTITE = ["concurrent", "plateforme", "application", "annuaire", "media", "autre", "a_classer"] as const;
export type NatureEntite = typeof NATURES_ENTITE[number];
export type GroupeEntite = "concurrents" | "plateformes" | "annuaires" | "a_classer";

export const LIBELLES_NATURE: Record<NatureEntite, string> = {
  concurrent: "Concurrent direct",
  plateforme: "Plateforme",
  application: "Application",
  annuaire: "Annuaire",
  media: "Média",
  autre: "Autre",
  a_classer: "À classer",
};

export function groupeNature(nature: string | null): GroupeEntite {
  if (nature === "concurrent") return "concurrents";
  if (nature === "plateforme" || nature === "application") return "plateformes";
  if (nature === "annuaire" || nature === "media") return "annuaires";
  return "a_classer";
}

export function natureValide(nature: string): nature is NatureEntite {
  return (NATURES_ENTITE as readonly string[]).includes(nature);
}
