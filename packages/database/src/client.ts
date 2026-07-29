import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase client factories. The web app uses the anon key (RLS-enforced); the
 * worker uses the service role key (bypasses RLS for pipeline writes).
 */

export type OiaClient = SupabaseClient;

export function createAnonClient(url: string, anonKey: string): OiaClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false },
  });
}

export function createServiceClient(url: string, serviceRoleKey: string): OiaClient {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
