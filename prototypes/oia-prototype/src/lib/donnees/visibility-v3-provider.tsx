import { createContext, useContext, type ReactNode } from "react";
import { queryOptions, useQuery } from "@tanstack/react-query";
import { useOiaAuth } from "@/lib/oia-auth";
import { donneesDemoVisibilityV3, lireVisibilityV3, type DonneesVisibilityV3 } from "./visibility-v3";

export function optionsVisibilityV3(userId: string) {
  return queryOptions({
    queryKey: ["visibility-v3", userId],
    queryFn: lireVisibilityV3,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

const vide: DonneesVisibilityV3 = { scores: [], historique: [], analyses: [], constats: [], seo: [], planificateur: [], audits: [], auditLignes: [] };
type Contexte = {
  connecte: boolean;
  donnees: DonneesVisibilityV3;
  query: ReturnType<typeof useQuery<DonneesVisibilityV3>>;
};
const Ctx = createContext<Contexte | null>(null);

export function VisibilityV3Provider({ children }: { children: ReactNode }) {
  const auth = useOiaAuth();
  const userId = auth.user?.id ?? "";
  const query = useQuery({ ...optionsVisibilityV3(userId), enabled: Boolean(userId) && !auth.loading });
  const connecte = Boolean(userId);
  return <Ctx.Provider value={{ connecte, donnees: connecte ? query.data ?? vide : donneesDemoVisibilityV3, query }}>{children}</Ctx.Provider>;
}

export function useVisibilityV3() {
  const contexte = useContext(Ctx);
  if (!contexte) throw new Error("Visibility v3 nécessite VisibilityV3Provider.");
  return contexte;
}
