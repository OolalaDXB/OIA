import { z } from "zod";
import { sites, agents, onboarding, vueSite } from "@/data/demo";
import * as mesure from "@/data/visibility";
import type { SourceDonnees } from "./source";

const etat = z.enum(["conforme", "verifier", "bloquant"]);
const nomV = z.object({ nom: z.string(), v: z.number().nullable() });
export const schemaVisibility = z.object({
  sites: z.array(z.object({ slug: z.string(), nom: z.string(), url: z.string(), panel: z.string(), depart: z.string(), ia: z.number().nullable(), google: z.string(), etat: etat.optional() })),
  agents: z.array(z.string()),
  onboarding: z.object({
    url: z.string(), constats: z.array(z.string()), activite: z.string(), lieu: z.string(), langues: z.string(), offres: z.array(z.string()), concurrents: z.array(z.string()),
    connexions: z.array(z.object({ nom: z.string(), module: z.string(), detail: z.string() })), questions: z.array(z.object({ q: z.string(), marque: z.boolean() })),
    assistants: z.array(z.string()), bloquants: z.array(z.string()), familles: z.array(z.tuple([z.string(), z.number(), z.number(), z.number()])),
  }),
  vueSite: z.object({
    nom: z.string(), url: z.string(), presence: z.number().nullable(), min: z.number().nullable(), max: z.number().nullable(), jours: z.number(), parAssistant: z.array(nomV),
    sources: z.array(z.object({ nom: z.string(), n: z.number() })), concurrents: z.array(nomV), recommandations: z.array(z.object({ etat, titre: z.string(), effet: z.string() })),
    historique: z.array(z.object({ fenetre: z.string(), v: z.number().nullable(), min: z.number().nullable(), max: z.number().nullable(), statut: z.string() })),
  }),
});
export type DonneesVisibility = z.infer<typeof schemaVisibility> & { reel: boolean };
export const donneesFictives: DonneesVisibility = { sites, agents, onboarding, vueSite, reel: false };
export function lireVisibility(brut: unknown): DonneesVisibility | null {
  const r = schemaVisibility.safeParse(brut);
  return r.success ? { ...r.data, reel: true } : null;
}
const demoVisibility = () => ({ ...mesure, ...donneesFictives });
export type SujetVisibility = { id: string; clientId: string; nom: string; role: string; statut: string; domaines: string[] };
export type DonneesModuleVisibility = ReturnType<typeof demoVisibility> & {
  sujets?: SujetVisibility[];
  sujetActif?: string;
  presenceQuestionsParFenetre?: Record<string, Record<string, Record<string, mesure.Valeur>>>;
  partVoixParFenetre?: Record<string, mesure.PartVoixVisibility>;
  citationsParFenetre?: Record<string, Record<string, typeof mesure.citations>>;
  reseauxParFenetre?: Record<string, Record<string, mesure.ReseauVisibility[]>>;
  etatCollecteParFenetre?: Record<string, typeof mesure.etatCollecte>;
  sentimentAssistants?: Record<string, Record<string, mesure.SentimentGlobal>>;
  recommandationsV2?: import("@/integrations/supabase/types").Database["public"]["Views"]["vis_recommandations_v2"]["Row"][];
};
export function lireDemoVisibility(): DonneesModuleVisibility { return demoVisibility(); }
export const sourceVisibility: SourceDonnees<DonneesModuleVisibility> = lireDemoVisibility;
export const visibilityVide = (d: DonneesModuleVisibility) => d.sites.length === 0 && d.reponses.length === 0;
/** Compatibilité avec le fichier facultatif déjà autorisé, indépendant de la future source OIA. */
export async function chargerFichierVisibility(): Promise<DonneesVisibility | null> {
  try {
    const r = await fetch("/data/visibility.json", { cache: "no-store" });
    return r.ok && (r.headers.get("content-type") ?? "").includes("json") ? lireVisibility(await r.json()) : null;
  } catch { return null; }
}
export { type Fenetre, type Valeur, type IdFenetre, type NomAssistant, type PartVoixVisibility, type PartVoixEntite, type ReseauVisibility } from "@/data/visibility";