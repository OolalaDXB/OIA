import { readFileSync } from "node:fs";

/**
 * Lit le palier de l'agent courrier dans infra/shyrka/permissions.json
 * (mandat v6, B5). Lecture seule : ce module n'écrit rien. Fichier absent ou douteux : palier 0. */
export function palierCourrier(chemin: string): 0 | 1 | 2 {
  try {
    const j = JSON.parse(readFileSync(chemin, "utf8")) as { accordePar?: unknown; agents?: { courrier?: { palier?: unknown } } };
    const p = j.agents?.courrier?.palier;
    if (j.accordePar !== "Mickaël Thomas" || (p !== 0 && p !== 1 && p !== 2)) return 0;
    return p;
  } catch {
    return 0;
  }
}
