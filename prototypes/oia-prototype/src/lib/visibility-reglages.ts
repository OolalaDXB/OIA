import { z } from "zod";
import type { DonneesModuleVisibility } from "@/lib/donnees/visibility";

export const CLE_REGLAGES_VISIBILITY = "oia.visibility.reglages.v1";

const texte = (max: number) => z.string().trim().min(1).max(max);
const schemaAjouts = z.object({
  sites: z.array(texte(200)).max(200),
  alias: z.array(texte(120)).max(200),
  profils: z.array(z.object({ reseau: texte(40), handle: texte(120) })).max(200),
  concurrents: z.array(z.object({ nom: texte(120), categorie: texte(120) })).max(200),
  questions: z.array(z.object({
    id: texte(100),
    q: texte(500),
    famille: texte(120),
    langue: z.string().regex(/^[a-z]{2}$/),
    marque: z.boolean(),
  })).max(500),
});
const schemaSauvegarde = z.object({ version: z.literal(1), ajouts: schemaAjouts });

export type AjoutsVisibility = z.infer<typeof schemaAjouts>;
export function ajoutsVisibilityVides(): AjoutsVisibility {
  return { sites: [], alias: [], profils: [], concurrents: [], questions: [] };
}

export function normaliserSite(entree: string): string | null {
  const brut = entree.trim();
  if (!brut) return null;
  try {
    const url = new URL(brut.includes("://") ? brut : `https://${brut}`);
    if (!(["http:", "https:"] as string[]).includes(url.protocol) || !url.hostname.includes(".")) return null;
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function cleNormalisee(valeur: string): string {
  return valeur.trim().toLocaleLowerCase("fr-FR");
}

export function contientNormalise(valeurs: string[], candidate: string): boolean {
  const cle = cleNormalisee(candidate);
  return valeurs.some((valeur) => cleNormalisee(valeur) === cle);
}

export function lireReglagesVisibility(stockage: Pick<Storage, "getItem">): AjoutsVisibility | null {
  try {
    const brut = stockage.getItem(CLE_REGLAGES_VISIBILITY);
    if (!brut) return null;
    const resultat = schemaSauvegarde.safeParse(JSON.parse(brut));
    return resultat.success ? resultat.data.ajouts : null;
  } catch {
    return null;
  }
}

export function sauverReglagesVisibility(
  stockage: Pick<Storage, "setItem" | "removeItem">,
  ajouts: AjoutsVisibility,
): boolean {
  try {
    if (Object.values(ajouts).every((valeur) => valeur.length === 0)) {
      stockage.removeItem(CLE_REGLAGES_VISIBILITY);
    } else {
      stockage.setItem(CLE_REGLAGES_VISIBILITY, JSON.stringify({ version: 1, ajouts }));
    }
    return true;
  } catch {
    return false;
  }
}

/** Les ajouts préparent les écrans, sans créer de mesures ni modifier les coûts. */
export function avecReglagesVisibility(
  donnees: DonneesModuleVisibility,
  ajouts: AjoutsVisibility,
): DonneesModuleVisibility {
  return {
    ...donnees,
    marque: {
      ...donnees.marque,
      sites: [...donnees.marque.sites, ...ajouts.sites],
      alias: [...donnees.marque.alias, ...ajouts.alias],
      profils: [...donnees.marque.profils, ...ajouts.profils],
    },
    concurrents: [...donnees.concurrents, ...ajouts.concurrents],
    questions: [...donnees.questions, ...ajouts.questions],
    etatCollecte: {
      ...donnees.etatCollecte,
      questions: donnees.questions.length + ajouts.questions.length,
    },
  };
}
