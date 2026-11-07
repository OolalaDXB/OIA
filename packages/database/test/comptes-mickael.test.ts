import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * 0002a : tables d'OIA réservées aux comptes de Mickaël (décision du
 * 2026-11-08), sur un Postgres jetable, à partir de l'état déployé (0002).
 * Comptes et e-mails fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../supabase/migrations/${n}`);
const M1 = "11111111-aaaa-4000-8000-000000000001"; // premier compte de Mickaël (fictif)
const M2 = "11111111-aaaa-4000-8000-000000000002"; // second compte de Mickaël (fictif)
const X = "99999999-aaaa-4000-8000-000000000009"; // autre compte connecté
const COURRIELS = "Premier@Exemple.test, second@exemple.test";
const TABLES = ["watch_opportunities", "watch_events", "watch_runs", "alerts", "reviews", "project_tags", "notes", "tasks", "contacts", "saved_views", "requests", "project_drafts", "link_checks"];

let b: Banc;
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const appliquer = (courriels: string | null) =>
  b.sql(`${courriels === null ? "" : `select set_config('oia.comptes_mickael', '${courriels}', false);`}\n${readFileSync(MIG("0002a_comptes_de_mickael.sql"), "utf8")}`);
const politiques = (motif: string) => Number(b.sql(`select count(*) from pg_policies where schemaname = 'public' and policyname like '${motif}'`));
const touchees = (sql: string, uid: string) => Number(b.sql(`with t as (${sql} returning 1) select count(*) from t`, en(uid)));

describe.skipIf(!postgresDisponible)("0002a · tables réservées aux comptes de Mickaël", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    b.sql(`
      insert into auth.users (id, email) values ('${M1}', 'premier@exemple.test'), ('${M2}', 'second@exemple.test'), ('${X}', 'autre@exemple.test');
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, recommendation, verification_status, payload, content_fingerprint)
      values ('22222222-aaaa-4000-8000-000000000001', 'k1', 'rec-1', 'Opportunité fictive', 'Émetteur fictif', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f1');
      insert into watch_events (opportunity_id, event_type) values ('22222222-aaaa-4000-8000-000000000001', 'DISCOVERED');
      insert into watch_runs (source) values ('test');
      insert into alerts (kind, headline, dedup_hash) values ('NEW_MATCH', 'Alerte fictive', 'h1');
      insert into link_checks (url, status, checked_at) values ('https://exemple.test', 'OK', now());
      insert into notes (text, actor) values ('Note fictive existante', 'mickael');
    `);
  });
  afterAll(() => b?.arreter());

  it("témoin : avant 0002a, un autre compte connecté lit et écrit le travail d'OIA", () => {
    expect(Number(b.sql("select count(*) from notes", en(X)))).toBe(1);
    expect(touchees(`insert into tasks (title, actor) values ('intrus', 'x')`, X)).toBe(1);
    b.sql("delete from tasks");
  });

  it("sans e-mails, ou avec un e-mail introuvable, rien n'est appliqué", () => {
    expect(erreur(b, `${readFileSync(MIG("0002a_comptes_de_mickael.sql"), "utf8")}`)).toMatch(/indiquer les e-mails/);
    expect(() => appliquer("premier@exemple.test, inconnu@exemple.test")).toThrow(/comptes introuvables : 1 trouvé\(s\) pour 2/);
    expect(politiques("authenticated%")).toBe(18);
    expect(politiques("mickael%")).toBe(0);
    expect(b.sql("select coalesce(to_regclass('public.oia_compte_autorise')::text, 'absente')")).toBe("absente");
  });

  it("application : comptes lus par e-mail (casse et espaces ignorés), politiques remplacées une à une", () => {
    appliquer(COURRIELS);
    expect(b.sql("select string_agg(user_id::text, ',' order by user_id) from oia_compte_autorise")).toBe(`${M1},${M2}`);
    expect(politiques("authenticated%")).toBe(0);
    expect(politiques("mickael%")).toBe(18);
    // Rejouable : rien ne double.
    appliquer(COURRIELS);
    expect(Number(b.sql("select count(*) from oia_compte_autorise"))).toBe(2);
    expect(politiques("mickael%")).toBe(18);
  });

  it("la console continue de fonctionner avec les comptes de Mickaël", () => {
    for (const t of TABLES) expect(Number(b.sql(`select count(*) from ${t}`, en(M1))), t).toBeGreaterThanOrEqual(t === "watch_opportunities" ? 1 : 0);
    // Les opérations de remoteWorkspace.ts, watchData.ts et des pages projets.
    b.sql(
      `insert into reviews (record_id, action, comment, actor, gate_pursue_eligible_at_decision) values ('rec-1', 'APPROVE', 'ok', 'mickael', true);
       insert into project_tags (record_id, project_slug, at, actor) values ('rec-1', 'projet-fictif', now(), 'mickael')
         on conflict (record_id) do update set project_slug = excluded.project_slug;
       insert into notes (text, record_id, actor) values ('Note fictive', 'rec-1', 'mickael');
       insert into tasks (title, actor) values ('Tâche fictive', 'mickael');
       update tasks set status = 'DONE', completed_at = now() where title = 'Tâche fictive';
       insert into contacts (name, actor) values ('Contact fictif', 'mickael');
       insert into saved_views (name) values ('Vue fictive');
       delete from contacts where name = 'Contact fictif';
       delete from project_tags where record_id = 'rec-1';
       update alerts set acknowledged_at = now(), acknowledged_by = 'mickael' where dedup_hash = 'h1';
       insert into requests (kind, payload, requested_by) values ('LINK_CHECK', '{}', 'mickael');
       insert into project_drafts (slug, entry, created_by) values ('projet-fictif', '{}', 'mickael');
       update project_drafts set entry = '{"v": 2}' where slug = 'projet-fictif';`,
      en(M1),
    );
    // Le second compte voit le travail du premier.
    expect(Number(b.sql("select count(*) from notes", en(M2)))).toBe(2);
    expect(b.sql("select status from tasks", en(M2))).toBe("DONE");
    // Les garde-fous de 0002 restent : décisions en ajout seul, demandes QUEUED seulement.
    expect(touchees("update reviews set comment = 'réécrit'", M1)).toBe(0);
    expect(touchees("delete from reviews", M1)).toBe(0);
    expect(erreur(b, "insert into requests (kind, status) values ('DISCOVERY', 'DONE')", en(M1))).toMatch(/row-level security/);
    expect(erreur(b, "update project_drafts set status = 'APPLIED'", en(M1))).toMatch(/row-level security/);
  });

  it("un autre compte connecté ne lit ni n'écrit plus rien", () => {
    for (const t of TABLES) expect(Number(b.sql(`select count(*) from ${t}`, en(X))), t).toBe(0);
    for (const q of [
      "insert into reviews (record_id, action, actor, gate_pursue_eligible_at_decision) values ('rec-1', 'REJECT', 'x', false)",
      "insert into notes (text, actor) values ('intrus', 'x')",
      "insert into tasks (title, actor) values ('intrus', 'x')",
      "insert into project_tags (record_id, project_slug, actor) values ('rec-2', 'x', 'x')",
      "insert into contacts (name, actor) values ('intrus', 'x')",
      "insert into saved_views (name) values ('intrus')",
      "insert into requests (kind) values ('DISCOVERY')",
      "insert into project_drafts (slug, entry) values ('intrus', '{}')",
    ]) expect(erreur(b, q, en(X)), q).toMatch(/row-level security/);
    for (const q of ["update notes set text = 'piraté'", "delete from notes", "update tasks set title = 'piraté'", "update alerts set acknowledged_at = null", "delete from saved_views", "update project_drafts set entry = '{}'"])
      expect(touchees(q, X), q).toBe(0);
    expect(Number(b.sql("select count(*) from notes"))).toBe(2);
  });

  it("la liste des comptes autorisés ne se lit ni ne s'écrit par l'API, même par Mickaël", () => {
    for (const uid of [X, M1]) {
      expect(erreur(b, "select count(*) from oia_compte_autorise", en(uid))).toMatch(/permission denied/);
      expect(erreur(b, `insert into oia_compte_autorise (user_id) values ('${X}')`, en(uid))).toMatch(/permission denied/);
    }
    expect(b.sql("select oia_compte_de_mickael()", en(X))).toBe("f");
    expect(b.sql("select oia_compte_de_mickael()", en(M2))).toBe("t");
    expect(erreur(b, "select oia_compte_de_mickael()", { role: "anon" })).toMatch(/permission denied/);
  });

  it("anon ne lit rien ; le rôle de service (workers) n'est pas concerné", () => {
    for (const t of TABLES) expect(Number(b.sql(`select count(*) from ${t}`, { role: "anon" })), t).toBe(0);
    expect(Number(b.sql("with t as (update requests set status = 'RUNNING' returning 1) select count(*) from t", { role: "service_role" }))).toBe(1);
    expect(Number(b.sql("select count(*) from watch_opportunities", { role: "service_role" }))).toBe(1);
  });

  it("0003 prend la suite : politiques de 0002a retirées, comptes de Mickaël propriétaires du studio", () => {
    for (const m of ["0003_membres_et_politiques.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(MIG(m));
    expect(politiques("mickael%")).toBe(0);
    expect(b.sql("select string_agg(user_id::text || ':' || role, ',' order by user_id) from oia_membre")).toBe(`${M1}:proprietaire,${M2}:proprietaire`);
    expect(Number(b.sql("select count(*) from ml_toutes_v1", en(M1)))).toBe(1);
    expect(Number(b.sql("select count(*) from ml_toutes_v1", en(X)))).toBe(0);
    expect(Number(b.sql("select count(*) from notes", en(X)))).toBe(0);
  });
});
