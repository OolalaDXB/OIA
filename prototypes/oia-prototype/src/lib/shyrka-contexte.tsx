import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { z } from "zod";
import { lireDemoShyrka, permissionsInitiales, paliers, type CategorieContexte, type ElementContexte, type Palier } from "@/lib/donnees/shyrka";

export const CLE_CONTEXTE = "oia.shyrka.contexte.v1";
const schema = z.object({
  version: z.literal(1),
  elements: z.array(z.object({ id: z.string(), categorie: z.enum(["Toi", "Projets", "Personnes", "Préférences", "Décisions"]), texte: z.string(), source: z.string(), date: z.string(), statut: z.enum(["À valider", "Validé", "Retiré"]) })),
  sources: z.record(z.string(), z.boolean()),
  permissions: z.record(z.string(), z.enum(paliers)),
  cadre: z.string(),
});
export type EtatContexte = z.infer<typeof schema>;
export const etatInitial = (): EtatContexte => { const d = lireDemoShyrka(); return { version: 1, elements: d.contexteInitial, sources: Object.fromEntries(d.sourcesShyrka.map((s) => [s.id, s.id === "oia"])), permissions: permissionsInitiales(), cadre: d.cadreInitial }; };
export function lireContexte(raw: string | null): EtatContexte | null { try { const r = schema.safeParse(JSON.parse(raw ?? "")); return r.success ? r.data : null; } catch { return null; } }

/** Mode privé : Shyrka n'apprend rien pendant la session. */
export function apprendreSi(etat: EtatContexte, prive: boolean, el: Omit<ElementContexte, "id" | "statut" | "date">, date: string): EtatContexte {
  if (prive) return etat;
  return { ...etat, elements: [{ ...el, id: `c${Date.now()}${Math.round(Math.random() * 1000)}`, date, statut: "À valider" }, ...etat.elements] };
}

type Api = EtatContexte & {
  prive: boolean; setPrive: (v: boolean) => void;
  maj: (id: string, patch: Partial<ElementContexte>) => void; oublier: (id: string) => void;
  apprendre: (categorie: CategorieContexte, texte: string, source: string) => void;
  basculerSource: (id: string) => void; setPermission: (cle: string, p: Palier) => void; setCadre: (t: string) => void;
};
const Ctx = createContext<Api | null>(null);

export function ContexteProvider({ children }: { children: ReactNode }) {
  const [etat, setEtat] = useState<EtatContexte>(etatInitial);
  const [pret, setPret] = useState(false);
  const [prive, setPrive] = useState(false);
  useEffect(() => { try { const s = lireContexte(localStorage.getItem(CLE_CONTEXTE)); if (s) setEtat(s); } catch { /* indisponible */ } setPret(true); }, []);
  useEffect(() => { if (pret) try { localStorage.setItem(CLE_CONTEXTE, JSON.stringify(etat)); } catch { /* indisponible */ } }, [pret, etat]);
  const date = () => new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });
  return <Ctx.Provider value={{ ...etat, prive, setPrive,
    maj: (id, patch) => setEtat((e) => ({ ...e, elements: e.elements.map((x) => x.id === id ? { ...x, ...patch } : x) })),
    oublier: (id) => setEtat((e) => ({ ...e, elements: e.elements.filter((x) => x.id !== id) })),
    apprendre: (categorie, texte, source) => setEtat((e) => apprendreSi(e, prive, { categorie, texte, source }, date())),
    basculerSource: (id) => setEtat((e) => ({ ...e, sources: { ...e.sources, [id]: !e.sources[id] } })),
    setPermission: (cle, p) => setEtat((e) => ({ ...e, permissions: { ...e.permissions, [cle]: p } })),
    setCadre: (cadre) => setEtat((e) => ({ ...e, cadre })),
  }}>{children}</Ctx.Provider>;
}
export function useContexte() { const c = useContext(Ctx); if (!c) throw new Error("Contexte Shyrka indisponible."); return c; }
