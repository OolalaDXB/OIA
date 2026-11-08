import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Auth = { user: User | null; loading: boolean; error: string | null; signOut: () => Promise<void> };
const Ctx = createContext<Auth>({ user: null, loading: true, error: null, signOut: async () => {} });
export const useOiaAuth = () => useContext(Ctx);
export function OiaAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const client = useQueryClient(); const router = useRouter(); const navigate = useNavigate();
  useEffect(() => {
    let active = true;
    const validate = async () => {
      const { data, error: e } = await supabase.auth.getUser();
      if (!active) return;
      setUser(data.user); setError(e && e.name !== "AuthSessionMissingError" ? e.message : null); setLoading(false);
    };
    const { data: listener } = supabase.auth.onAuthStateChange((event) => {
      if (!["SIGNED_IN", "SIGNED_OUT", "USER_UPDATED"].includes(event)) return;
      if (event === "SIGNED_OUT") { setUser(null); setLoading(false); client.clear(); }
      else { setLoading(true); void validate(); }
      void router.invalidate();
    });
    void validate();
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, [client, router]);
  const signOut = async () => {
    await client.cancelQueries(); client.clear();
    const { error: e } = await supabase.auth.signOut();
    if (e) throw e;
    setUser(null); await navigate({ to: "/auth", replace: true });
  };
  return <Ctx.Provider value={{ user, loading, error, signOut }}>{children}</Ctx.Provider>;
}
export function ConnexionOia() {
  const [error, setError] = useState<string | null>(null); const [pending, setPending] = useState(false);
  const auth = useOiaAuth(); const navigate = useNavigate();
  if (auth.loading) return <p role="status">Vérification de la connexion…</p>;
  if (auth.user) return <div className="space-y-4"><p className="text-sm">Connecté à OIA.</p><Button onClick={() => navigate({ to: "/money-lookup" })}>Ouvrir Money Lookup</Button></div>;
  return <form className="max-w-sm space-y-4" onSubmit={async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); setError(null);
    try { const { error: e } = await supabase.auth.signInWithPassword({ email: String(form.get("email")), password: String(form.get("password")) }); if (e) throw e; await navigate({ to: "/money-lookup" }); }
    catch (e) { setError(e instanceof Error ? e.message : "Connexion indisponible."); } finally { setPending(false); }
  }}><h2 className="text-lg">Connexion à OIA</h2><label className="block text-sm">E-mail<Input className="mt-2 min-h-11" name="email" type="email" autoComplete="username" required /></label><label className="block text-sm">Mot de passe<Input className="mt-2 min-h-11" name="password" type="password" autoComplete="current-password" required /></label>{(error || auth.error) && <p role="alert" className="text-sm text-block">{error || auth.error}</p>}<Button type="submit" disabled={pending}>{pending ? "Connexion…" : "Se connecter"}</Button></form>;
}