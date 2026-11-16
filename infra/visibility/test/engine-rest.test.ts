import { describe, expect, it } from "vitest";
import { RestEngineDb, choisirBase, type RestFetch } from "../src/engine/rest.js";

const URL_ = "https://exemple-fictif.supabase.co";
const KEY = "cle-de-service-fictive-0123456789";

function fake(reponses: Array<{ status: number; body: string }>) {
  const appels: Array<{ url: string; headers: Record<string, string>; body: unknown }> = [];
  const f: RestFetch = async (url, init) => {
    appels.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const r = reponses.shift() ?? { status: 204, body: "" };
    return { ok: r.status < 400, status: r.status, text: async () => r.body };
  };
  return { f, appels };
}

describe("RestEngineDb", () => {
  it("appelle la fonction rpc avec la clé de service et les paramètres nommés", async () => {
    const { f, appels } = fake([{ status: 200, body: '{"id":"d1","type":"SITE_ADD"}' }]);
    const db = new RestEngineDb(URL_, KEY, f);
    const d = await db.prendre("github-actions");
    expect(d).toEqual({ id: "d1", type: "SITE_ADD" });
    expect(appels[0]!.url).toBe(`${URL_}/rest/v1/rpc/vis_moteur_prendre`);
    expect(appels[0]!.headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(appels[0]!.headers.apikey).toBe(KEY);
    expect(appels[0]!.body).toEqual({ p_hote: "github-actions" });
  });

  it("rend null pour une file vide et pour une fonction sans résultat", async () => {
    const { f } = fake([{ status: 200, body: "null" }, { status: 204, body: "" }]);
    const db = new RestEngineDb(URL_, KEY, f);
    expect(await db.prendre("h")).toBeNull();
    await expect(db.signe("h", "abc1234", new Date("2026-11-16T15:00:00Z"))).resolves.toBeUndefined();
  });

  it("transmet les dates en ISO et les chaînes vides en null", async () => {
    const { f, appels } = fake([{ status: 204, body: "" }, { status: 204, body: "" }]);
    const db = new RestEngineDb(URL_, KEY, f);
    await db.signe("h", "v", new Date("2026-11-16T15:00:00Z"));
    await db.fenetre("s", "w", "en_cours", "");
    expect(appels[0]!.body).toEqual({ p_hote: "h", p_version: "v", p_prochain: "2026-11-16T15:00:00.000Z" });
    expect(appels[1]!.body).toEqual({ p_subject: "s", p_window: "w", p_statut: "en_cours", p_debut: null });
  });

  it("rend l'erreur de la base, sans la requête", async () => {
    const { f } = fake([{ status: 403, body: '{"code":"42501","message":"réservé au moteur : session service_role requise (rôle authenticated)"}' }]);
    const db = new RestEngineDb(URL_, KEY, f);
    await expect(db.prendre("h")).rejects.toThrow("réservé au moteur : session service_role requise (rôle authenticated) (42501)");
  });

  it("refuse une adresse qui n'est pas en https ou une clé absente", () => {
    expect(() => new RestEngineDb("http://exemple-fictif.supabase.co", KEY)).toThrow();
    expect(() => new RestEngineDb(URL_, "")).toThrow();
  });
});

describe("choisirBase", () => {
  it("prend l'API quand l'adresse et la clé sont là sans psql", () => {
    expect(choisirBase({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY })).toBe("rest");
    expect(choisirBase({ SUPABASE_URL: URL_, SUPABASE_SERVICE_ROLE_KEY: KEY, OIA_VIS_PSQL: "/x" })).toBe("psql");
    expect(choisirBase({})).toBe("psql");
    expect(choisirBase({ OIA_VIS_ENGINE_DB: "rest" })).toBe("rest");
    expect(() => choisirBase({ OIA_VIS_ENGINE_DB: "autre" })).toThrow();
  });
});
