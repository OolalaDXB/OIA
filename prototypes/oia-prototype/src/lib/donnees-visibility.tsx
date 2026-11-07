import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { chargerFichierVisibility, donneesFictives, type DonneesVisibility } from "@/lib/donnees/visibility";
import { useVisibilityDonnees } from "@/lib/donnees/provider";
export { lireVisibility, donneesFictives, schemaVisibility, type DonneesVisibility } from "@/lib/donnees/visibility";

const Ctx = createContext<DonneesVisibility | null>(null);

export function DonneesProvider({ children }: { children: ReactNode }) {
  const [donnees, setDonnees] = useState<DonneesVisibility | null>(null);
  useEffect(() => {
    let actif = true;
    void chargerFichierVisibility().then((d) => { if (actif && d) setDonnees(d); });
    return () => { actif = false; };
  }, []);
  return <Ctx.Provider value={donnees}>{children}</Ctx.Provider>;
}

export function useDonnees() { const fichier = useContext(Ctx); const module = useVisibilityDonnees(); return fichier ?? module; }
