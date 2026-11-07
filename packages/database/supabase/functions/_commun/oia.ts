// Outils communs aux fonctions serveur d'OIA (mandat v9, blocs D et G).
// Aucune clé de service : chaque lecture et chaque écriture passent par
// PostgREST AVEC LE JETON DE L'APPELANT ; les règles d'accès de la base
// décident. La clé publique (anon) et l'adresse sont fournies par Supabase.

export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export const json = (corps: unknown, statut = 200) =>
  new Response(JSON.stringify(corps), { status: statut, headers: { ...CORS, "Content-Type": "application/json; charset=utf-8" } });

export class ErreurHttp extends Error {
  constructor(readonly statut: number, message: string, readonly code: string) {
    super(message);
  }
}

export interface Session {
  /** Lecture d'une vue ou d'une table, filtres PostgREST. */
  lire(vue: string, params: Record<string, string>): Promise<Record<string, unknown>[]>;
  /** Appel d'une fonction `rpc`. */
  rpc<T = unknown>(fonction: string, args: Record<string, unknown>): Promise<T>;
  utilisateur: string;
}

export async function session(req: Request): Promise<Session> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new ErreurHttp(500, "configuration du projet incomplète", "configuration");
  const auth = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(auth)) throw new ErreurHttp(401, "connexion requise", "connexion_requise");
  const entetes = { apikey: anon, Authorization: auth };
  const u = await fetch(`${url}/auth/v1/user`, { headers: entetes });
  if (!u.ok) throw new ErreurHttp(401, "session invalide", "connexion_requise");
  const user = (await u.json()) as { id?: string; role?: string };
  if (!user.id || user.role === "anon") throw new ErreurHttp(401, "connexion requise", "connexion_requise");

  const erreurPg = async (r: Response) => {
    const e = (await r.json().catch(() => ({}))) as { code?: string; message?: string };
    if (e.code === "42501" || r.status === 401 || r.status === 403) return new ErreurHttp(403, e.message ?? "accès refusé", "acces_refuse");
    return new ErreurHttp(r.status >= 500 ? 502 : 400, e.message ?? `erreur ${r.status}`, e.code ?? "base");
  };
  return {
    utilisateur: user.id,
    async lire(vue, params) {
      if (!/^[a-z_][a-z0-9_]{1,62}$/.test(vue)) throw new ErreurHttp(400, "vue inconnue", "vue");
      const r = await fetch(`${url}/rest/v1/${vue}?${new URLSearchParams(params)}`, { headers: entetes });
      if (!r.ok) throw await erreurPg(r);
      return (await r.json()) as Record<string, unknown>[];
    },
    async rpc(fonction, args) {
      const r = await fetch(`${url}/rest/v1/rpc/${fonction}`, { method: "POST", headers: { ...entetes, "Content-Type": "application/json" }, body: JSON.stringify(args) });
      if (!r.ok) throw await erreurPg(r);
      const t = await r.text();
      return (t ? JSON.parse(t) : null) as never;
    },
  };
}

/** Réserve le coût maximal d'un appel dans le compteur commun ; refuse avant le modèle. */
export async function reserver(s: Session, service: "shyrka" | "money-match", coutMax: number, jetons: number): Promise<number> {
  const id = await s.rpc<number>("oia_ia_reserver", { p_service: service, p_cout_max: coutMax, p_jetons_entree: jetons });
  if (id === -1) throw new ErreurHttp(429, "limite quotidienne atteinte", "limite_quotidienne");
  if (id === -2) throw new ErreurHttp(429, "plafond mensuel de dépense IA atteint (5 $) : demande refusée avant tout appel", "plafond_mensuel");
  return id;
}

export function reponseErreur(e: unknown): Response {
  if (e instanceof ErreurHttp) return json({ erreur: e.message, code: e.code }, e.statut);
  return json({ erreur: "erreur interne", code: "interne" }, 500);
}
