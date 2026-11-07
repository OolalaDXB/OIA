import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { sites, agents, onboarding, vueSite } from "@/data/demo";

const etat = z.enum(["conforme", "verifier", "bloquant"]);
const nomV = z.object({ nom: z.string(), v: z.number() });

export const schemaVisibility = z.object({
  sites: z.array(z.object({ slug: z.string(), nom: z.string(), url: z.string(), panel: z.string(), depart: z.string(), ia: z.number().nullable(), google: z.string(), etat })),
  agents: z.array(z.string()),
  onboarding: z.object({
    url: z.string(), constats: z.array(z.string()), activite: z.string(), lieu: z.string(), langues: z.string(),
    offres: z.array(z.string()), concurrents: z.array(z.string()),
    connexions: z.array(z.object({ nom: z.string(), module: z.string(), detail: z.string() })),
    questions: z.array(z.object({ q: z.string(), marque: z.boolean() })),
    assistants: z.array(z.string()), bloquants: z.array(z.string()),
    familles: z.array(z.tuple([z.string(), z.number(), z.number(), z.number()])),
  }),
  vueSite: z.object({
    nom: z.string(), url: z.string(), presence: z.number(), min: z.number(), max: z.number(), jours: z.number(),
    parAssistant: z.array(nomV), sources: z.array(z.object({ nom: z.string(), n: z.number() })), concurrents: z.array(nomV),
    recommandations: z.array(z.object({ etat, titre: z.string(), effet: z.string() })),
    historique: z.array(z.object({ fenetre: z.string(), v: z.number(), min: z.number(), max: z.number(), statut: z.string() })),
  }),
});

export type DonneesVisibility = z.infer<typeof schemaVisibility> & { reel: boolean };
export const donneesFictives: DonneesVisibility = { sites, agents, onboarding, vueSite, reel: false };

/** Lit public/data/visibility.json ; renvoie null si absent ou de structure différente. */
export function lireVisibility(brut: unknown): DonneesVisibility | null {
  const r = schemaVisibility.safeParse(brut);
  return r.success ? { ...r.data, reel: true } : null;
}

const Ctx = createContext<DonneesVisibility>(donneesFictives);

export function DonneesProvider({ children }: { children: ReactNode }) {
  const [donnees, setDonnees] = useState(donneesFictives);
  useEffect(() => {
    let actif = true;
    fetch("/data/visibility.json", { cache: "no-store" })
      .then((r) => (r.ok && (r.headers.get("content-type") ?? "").includes("json") ? r.json() : null))
      .then((j) => { const d = j && lireVisibility(j); if (actif && d) setDonnees(d); })
      .catch(() => {});
    return () => { actif = false; };
  }, []);
  return <Ctx.Provider value={donnees}>{children}</Ctx.Provider>;
}

export const useDonnees = () => useContext(Ctx);
