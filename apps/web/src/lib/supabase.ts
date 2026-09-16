"use client";

import { createClient, type SupabaseClient, type Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";

/**
 * The console's connection to the watch database.
 *
 * Everything here degrades to null when the environment is not configured, and
 * every caller must handle that: the console has to keep working as a static
 * export against its bundled snapshot, both for local development and for the
 * case where the database is unreachable. A screen that goes blank because a
 * backend is missing would undo the one property this console has always had —
 * it shows you what it actually knows.
 */

let cached: SupabaseClient | null | undefined;

export function supabase(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const key = process.env["NEXT_PUBLIC_SUPABASE_ANON_KEY"];
  cached = url && key ? createClient(url, key) : null;
  return cached;
}

export function isConfigured(): boolean {
  return supabase() !== null;
}

export type AuthState =
  | { status: "UNCONFIGURED" }
  | { status: "LOADING" }
  | { status: "SIGNED_OUT" }
  | { status: "SIGNED_IN"; email: string; session: Session };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: "LOADING" });

  useEffect(() => {
    const client = supabase();
    if (!client) {
      setState({ status: "UNCONFIGURED" });
      return;
    }
    let active = true;
    void client.auth.getSession().then(({ data }) => {
      if (!active) return;
      setState(
        data.session
          ? { status: "SIGNED_IN", email: data.session.user.email ?? "", session: data.session }
          : { status: "SIGNED_OUT" },
      );
    });
    const { data: sub } = client.auth.onAuthStateChange((_event, session) => {
      setState(
        session
          ? { status: "SIGNED_IN", email: session.user.email ?? "", session }
          : { status: "SIGNED_OUT" },
      );
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const client = supabase();
    if (!client) return { error: "No database configured for this console." };
    const { error } = await client.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase()?.auth.signOut();
  }, []);

  return { state, signIn, signOut };
}
