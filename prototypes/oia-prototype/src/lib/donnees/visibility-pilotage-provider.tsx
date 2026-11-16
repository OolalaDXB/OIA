import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { queryOptions, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOiaAuth } from "@/lib/oia-auth";
import { useSelectionVisibility } from "./provider";
import {
  gesteVisibility, lirePilotageGlobal, lirePilotageSujet,
  type ClientRpc, type Fonctions, type GesteVisibility, type PilotageGlobal, type PilotageSujet,
} from "./visibility-pilotage";

export function optionsPilotageGlobal(userId: string) {
  return queryOptions({ queryKey: ["visibility-pilotage-global", userId], queryFn: lirePilotageGlobal, retry: false, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
}
export function optionsPilotageSujet(userId: string, subject: string) {
  return queryOptions({ queryKey: ["visibility-pilotage-sujet", userId, subject], queryFn: () => lirePilotageSujet(subject), retry: false, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false });
}

type Contexte = {
  connecte: boolean;
  globalQuery: ReturnType<typeof useQuery<PilotageGlobal>>;
  sujetQuery: ReturnType<typeof useQuery<PilotageSujet>>;
  global: PilotageGlobal | null;
  sujet: PilotageSujet | null;
};
const Ctx = createContext<Contexte | null>(null);

export function VisibilityPilotageProvider({ children }: { children: ReactNode }) {
  const auth = useOiaAuth();
  const selection = useSelectionVisibility();
  const userId = auth.user?.id ?? "";
  const globalQuery = useQuery({ ...optionsPilotageGlobal(userId), enabled: Boolean(userId) && !auth.loading });
  const sujetQuery = useQuery({ ...optionsPilotageSujet(userId, selection.sujetId ?? ""), enabled: Boolean(userId && selection.sujetId) });
  return <Ctx.Provider value={{ connecte: Boolean(userId), globalQuery, sujetQuery, global: globalQuery.data ?? null, sujet: sujetQuery.data ?? null }}>{children}</Ctx.Provider>;
}

export function useVisibilityPilotage() {
  const contexte = useContext(Ctx);
  if (!contexte) throw new Error("Le pilotage Visibility nécessite VisibilityPilotageProvider.");
  return contexte;
}

/** Après confirmation de la base, toutes les vues actives sont relues avant d'afficher un nouvel état. */
export function useGesteVisibility(client?: ClientRpc) {
  const queryClient = useQueryClient();
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const executer = useCallback(async <N extends GesteVisibility>(nom: N, params: Fonctions[N]["Args"]) => {
    setEnCours(true); setErreur(null);
    try {
      const resultat = await gesteVisibility(nom, params, client);
      await queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("visibility") });
      return resultat;
    } catch (e) {
      const message = e instanceof Error ? e.message : "Le geste a été refusé.";
      setErreur(message);
      throw e;
    } finally { setEnCours(false); }
  }, [client, queryClient]);
  const recharger = useCallback(async () => {
    setErreur(null);
    await queryClient.invalidateQueries({ predicate: (q) => typeof q.queryKey[0] === "string" && q.queryKey[0].startsWith("visibility") });
  }, [queryClient]);
  return { executer, enCours, erreur, setErreur, recharger };
}
