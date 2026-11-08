import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useOiaAuth } from "@/lib/oia-auth";
import { ESPACE_OIA, type VueMoney, type LigneMoney } from "@/lib/money-contrat";
import type { Database } from "@/integrations/supabase/types";
type Fonctions = Database["public"]["Functions"];
export class ErreurMoney extends Error { constructor(message: string, public code?: string) { super(message); } }
export async function lireVueMoney<V extends VueMoney>(vue: V, filters: Record<string, string | number | boolean> = {}): Promise<LigneMoney<V>[]> {
  const rows: LigneMoney<V>[] = [];
  for (let start = 0; ; start += 500) {
    let request = supabase.from(vue as VueMoney).select("*").eq("espace_id", ESPACE_OIA);
    for (const [key, value] of Object.entries(filters)) request = request.eq(key, value);
    const { data, error } = await request.range(start, start + 499);
    if (error) throw new ErreurMoney(error.message, error.code);
    const page = (data ?? []) as unknown as LigneMoney<V>[]; rows.push(...page);
    if (page.length < 500) return rows;
  }
}
export const sourceReelleMoney = lireVueMoney;
export function optionsVueMoney<V extends VueMoney>(userId: string, vue: V, filters: Record<string, string | number | boolean> = {}) {
  return queryOptions({ queryKey: ["money-reel", userId, vue, filters], queryFn: () => lireVueMoney(vue, filters), retry: false });
}
export function useAccesMoney() {
  const auth = useOiaAuth();
  return useQuery({ queryKey: ["money-acces", auth.user?.id], enabled: Boolean(auth.user) && !auth.loading, retry: false, queryFn: async () => {
    const { data, error } = await supabase.rpc("oia_role", { p_espace: ESPACE_OIA });
    if (error) throw new ErreurMoney(error.message, error.code);
    return data || null;
  } });
}
export function useVueMoney<V extends VueMoney>(vue: V, filters: Record<string, string | number | boolean> = {}) {
  const auth = useOiaAuth(); const access = useAccesMoney();
  const result = useQuery({ ...optionsVueMoney(auth.user?.id ?? "", vue, filters), enabled: Boolean(auth.user && access.data) && !auth.loading });
  return { ...result, acces: access, user: auth.user };
}
export function useActionMoney<N extends keyof Fonctions>(nom: N) {
  const client = useQueryClient();
  return useMutation<Fonctions[N]["Returns"], ErreurMoney, Fonctions[N]["Args"]>({ mutationFn: async (args) => {
    const { data, error } = await supabase.rpc(nom, args);
    if (error) throw new ErreurMoney(error.message, error.code);
    return data;
  }, onMutate: async () => { await client.cancelQueries({ queryKey: ["money-reel"] }); }, onSuccess: async () => {
    client.removeQueries({ queryKey: ["money-reel"], type: "inactive" });
    await client.invalidateQueries({ queryKey: ["money-reel"], refetchType: "active" });
  } });
}