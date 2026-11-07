import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Mandat v9, bloc A : la séquence exacte appliquée en production, sur un
 * Postgres jetable imitant Supabase, à partir de l'état déployé (0002) :
 * 0002a → 0003 → 0003a → 0004 → 0005 → vis 0001 à 0004 → 0006 → membres (A3).
 * Puis les tests adverses du bloc A4 et la compatibilité de la console.
 * Comptes et e-mails fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../supabase/migrations/${n}`);
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const STUDIO = "00000000-0000-4000-8000-000000000001";
const M1 = "11111111-aaaa-4000-8000-000000000001"; // premier compte de Mickaël (fictif)
const M2 = "11111111-aaaa-4000-8000-000000000002"; // second compte de Mickaël (fictif)
const TMP = "99999999-aaaa-4000-8000-000000000009"; // compte temporaire créé par l'administration

const TABLES = [
  "watch_opportunities", "watch_events", "watch_runs", "alerts", "reviews", "project_tags", "notes", "tasks", "contacts",
  "saved_views", "requests", "project_drafts", "link_checks", "ml_montant", "ml_lot", "oia_journal", "oia_import", "oia_membre", "oia_espace",
  "vis.client", "vis.client_member", "vis.site", "vis.subject", "vis.window", "vis.evidence", "vis.recommendation", "vis_ui.question", "vis_ui.rapport",
];
const VUES_ML = ["ml_toutes_v1", "ml_financements_v1", "ml_appels_offres_v1", "ml_investisseurs_v1", "ml_signals_v1", "ml_aujourdhui_v1", "ml_montants_v1", "ml_fiche_v1", "ml_decision_v1"];
const VUES_VIS = [
  "vis_sujets_v1", "vis_mesure_v1", "vis_apercu_v1", "vis_reponses_v1", "vis_citations_v1", "vis_reseaux_sociaux_v1",
  "vis_concurrents_v1", "vis_questions_v1", "vis_recommandations_v1", "vis_rapports_v1", "vis_seo_command_v1", "vis_planificateur_v1",
];

let b: Banc;
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const compte = (sql: string, uid: string) => Number(b.sql(sql, en(uid)));
const touchees = (sql: string, uid: string) => Number(b.sql(`with t as (${sql} returning 1) select count(*) from t`, en(uid)));

describe.skipIf(!postgresDisponible)("mandat v9 · séquence de production (Postgres jetable)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    // État déployé : deux comptes, une opportunité, un événement (comme en production le 8 novembre).
    b.sql(`
      insert into auth.users (id, email) values ('${M1}', 'premier@exemple.test'), ('${M2}', 'second@exemple.test');
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, recommendation, verification_status, payload, content_fingerprint)
      values ('22222222-aaaa-4000-8000-000000000001', 'k1', 'rec-1', 'Opportunité fictive', 'Émetteur fictif', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f1');
      insert into watch_events (opportunity_id, event_type) values ('22222222-aaaa-4000-8000-000000000001', 'DISCOVERED');
      insert into alerts (kind, headline, dedup_hash) select (enum_range(null::alert_kind))[1], 'Alerte fictive', 'h1';
    `);
    // 0002a : e-mails lus en base, comme en production (jamais écrits dans le dépôt).
    b.sql(`select set_config('oia.comptes_mickael', (select string_agg(email, ',') from auth.users), false);\n${readFileSync(MIG("0002a_comptes_de_mickael.sql"), "utf8")}`);
    for (const m of ["0003_membres_et_politiques.sql", "0003a_transition_console.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(MIG(m));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    b.fichier(MIG("0006_visibility_vues.sql"));
    b.fichier(chemin("../supabase/production/a3_membres.sql"));
    // Le compte temporaire des tests adverses : créé après coup, membre de rien.
    b.sql(`insert into auth.users (id, email) values ('${TMP}', 'temporaire@exemple.test')`);
  });
  afterAll(() => b?.arreter());

  it("un seul modèle d'appartenance : les comptes de 0002a sont propriétaires du studio, la liste d'amorçage a disparu", () => {
    expect(b.sql(`select string_agg(user_id::text || ':' || role, ',' order by user_id) from oia_membre where espace_id = '${STUDIO}'`))
      .toBe(`${M1}:proprietaire,${M2}:proprietaire`);
    expect(b.sql("select coalesce(to_regclass('public.oia_compte_autorise')::text, 'absente')")).toBe("absente");
    expect(Number(b.sql("select count(*) from pg_proc where proname = 'oia_compte_de_mickael'"))).toBe(0);
    expect(Number(b.sql(`select count(*) from pg_policies where policyname like 'mickael%' or policyname like 'authenticated%'`))).toBe(0);
  });

  it("A3 : les deux comptes sont propriétaires des clients « oia » et « coach-gari », et la migration se rejoue sans doublon", () => {
    b.fichier(chemin("../supabase/production/a3_membres.sql"));
    expect(b.sql("select string_agg(client_id || ':' || role, ',' order by client_id, user_id) from vis.client_member"))
      .toBe("coach-gari:owner,coach-gari:owner,oia:owner,oia:owner");
  });

  it("les tables vis appartiennent à vis_admin", () => {
    expect(b.sql("select string_agg(distinct tableowner, ',') from pg_tables where schemaname = 'vis'")).toBe("vis_admin");
  });

  it("A4 · le compte temporaire ne lit rien, table par table et vue par vue", () => {
    for (const t of [...TABLES, ...VUES_ML, ...VUES_VIS]) expect(compte(`select count(*) from ${t}`, TMP), t).toBe(0);
  });

  it("A4 · le compte temporaire n'écrit rien, ni directement, ni par les fonctions", () => {
    for (const s of [
      `insert into notes (text, actor) values ('intrus', 'x')`,
      `insert into reviews (record_id, action, comment, actor, gate_pursue_eligible_at_decision) values ('rec-1', 'APPROVE', '', 'x', false)`,
      `insert into tasks (title, actor) values ('intrus', 'x')`,
      `update alerts set acknowledged_by = 'x'`,
      `insert into requests (kind, payload, requested_by) values ('DISCOVERY', '{}', 'x')`,
      `insert into ml_montant (opportunity_id, espace_id, valeur, devise, confiance) values ('22222222-aaaa-4000-8000-000000000001', '${STUDIO}', 1, 'EUR', 'HAUTE')`,
      `insert into vis.client_member (user_id, client_id, role) values ('${TMP}', 'coach-gari', 'owner')`,
      `insert into oia_membre (user_id, espace_id, role) values ('${TMP}', '${STUDIO}', 'proprietaire')`,
    ]) {
      const e = erreur(b, `with t as (${s} returning 1) select count(*) from t`, en(TMP));
      // Refus explicite, ou zéro ligne touchée (RLS).
      if (e === null) expect(touchees(s, TMP), s).toBe(0);
      else expect(e, s).toMatch(/permission denied|row-level security|violates/);
    }
    for (const f of [
      `select oia_noter('${STUDIO}', 'intrus')`,
      `select oia_decider('${STUDIO}', 'rec-1', 'APPROVE', '', false)`,
      `select oia_creer_tache('${STUDIO}', 'intrus')`,
      `select vis_valider_recommandation('coach-gari', 'r1')`,
    ]) expect(erreur(b, f, en(TMP)), f).toMatch(/refus|permission denied|introuvable|n'a pas/i);
  });

  it("A4 · sans connexion (anon) : rien en lecture", () => {
    for (const t of [...TABLES, ...VUES_ML, ...VUES_VIS]) {
      const e = erreur(b, `select count(*) from ${t}`, { role: "anon" });
      if (e === null) expect(Number(b.sql(`select count(*) from ${t}`, { role: "anon" })), t).toBe(0);
      else expect(e, t).toMatch(/permission denied/);
    }
  });

  it("A4 · un compte de Mickaël lit les vues de Money Lookup et de Visibility", () => {
    expect(compte("select count(*) from ml_toutes_v1", M1)).toBe(1);
    expect(compte("select count(*) from ml_toutes_v1", M2)).toBe(1);
    for (const v of [...VUES_ML, ...VUES_VIS]) expect(erreur(b, `select count(*) from ${v}`, en(M1)), v).toBeNull();
    expect(b.sql("select string_agg(client_id || ':' || mon_role, ',' order by client_id) from vis_sujets_v1", en(M1))).toBe("");
    b.sql(`insert into vis.subject (id, client_id, status) values ('coach-gari', 'coach-gari', 'active')`);
    expect(b.sql("select string_agg(client_id || ':' || mon_role, ',' order by client_id) from vis_sujets_v1", en(M1))).toBe("coach-gari:owner");
  });

  it("A4 · toute écriture directe dans une table nouvelle est refusée, même pour Mickaël ; les fonctions écrivent", () => {
    for (const s of [
      `insert into ml_montant (opportunity_id, espace_id, valeur, devise, confiance) values ('22222222-aaaa-4000-8000-000000000001', '${STUDIO}', 1, 'EUR', 'HAUTE')`,
      `insert into oia_journal (espace_id, action, cible) values ('${STUDIO}', 'x', 'y')`,
      `insert into oia_membre (user_id, espace_id, role) values ('${TMP}', '${STUDIO}', 'proprietaire')`,
      `insert into vis.evidence (id) values (gen_random_uuid())`,
      `insert into vis_ui.rapport (client_id, subject_id, window_id, type, genere_le, version_panel, statut) values ('coach-gari', 'coach-gari', 'w', 'j0', now(), 1, 'a_valider')`,
    ]) expect(erreur(b, s, en(M1)), s).toMatch(/permission denied|row-level security/);
    const id = b.sql(`select oia_noter('${STUDIO}', 'Note par fonction')`, en(M1));
    expect(compte(`select count(*) from notes where id = '${id}'`, M1)).toBe(1);
    expect(compte(`select count(*) from oia_journal where cible_id = '${id}'`, M1)).toBe(1);
  });

  it("console (transitoire 0003a) : un compte de Mickaël garde exactement ses écritures directes", () => {
    for (const s of
      `insert into reviews (record_id, action, comment, actor, gate_pursue_eligible_at_decision) values ('rec-1', 'APPROVE', 'ok', 'mickael', true);
       insert into project_tags (record_id, project_slug, at, actor) values ('rec-1', 'projet-fictif', now(), 'mickael')
         on conflict (espace_id, record_id) do update set project_slug = excluded.project_slug;
       insert into notes (text, record_id, actor) values ('Note de test console', 'rec-1', 'mickael');
       delete from notes where text = 'Note de test console';
       insert into tasks (title, actor) values ('Tâche fictive', 'mickael');
       update tasks set status = 'DONE', completed_at = now() where title = 'Tâche fictive';
       insert into contacts (name, actor) values ('Contact fictif', 'mickael');
       insert into saved_views (name) values ('Vue fictive');
       update alerts set acknowledged_at = now(), acknowledged_by = 'mickael';
       insert into requests (kind, payload, requested_by) values ('DISCOVERY', '{}', 'mickael');
       insert into project_drafts (slug, entry, status, created_by) values ('brouillon-fictif', '{}', 'PENDING', 'mickael')`.split(";\n"))
      expect(erreur(b, s, en(M2)), s).toBeNull();
    expect(compte("select count(*) from notes where text = 'Note de test console'", M1)).toBe(0);
    expect(compte("select count(*) from tasks where status = 'DONE'", M1)).toBe(1);
    // Mêmes limites que 0002a : décisions en ajout seul, demandes QUEUED seulement.
    expect(erreur(b, `delete from reviews`, en(M1))).toMatch(/permission denied/);
    expect(erreur(b, `update reviews set comment = 'réécrit'`, en(M1))).toMatch(/permission denied/);
    expect(erreur(b, `insert into requests (kind, payload, requested_by, status) values ('DISCOVERY', '{}', 'mickael', 'DONE')`, en(M1))).toMatch(/row-level security/);
  });

  it("retrait de la transition : sans 0003a, plus aucune écriture directe, les fonctions restent", () => {
    b.sql(`begin;
      do $$ declare t text; p text; begin
        for t, p in select tablename, policyname from pg_policies where schemaname = 'public' and policyname like 'transitoire console%'
        loop execute format('drop policy %I on public.%I', p, t); end loop;
      end $$;
      revoke insert, update, delete on public.reviews, public.project_tags, public.notes, public.tasks,
        public.contacts, public.saved_views, public.alerts, public.requests, public.project_drafts from authenticated;
      commit;`);
    expect(erreur(b, `insert into notes (text, actor) values ('directe', 'mickael')`, en(M1))).toMatch(/permission denied/);
    expect(erreur(b, `select oia_noter('${STUDIO}', 'Par fonction')`, en(M1))).toBeNull();
    b.fichier(MIG("0003a_transition_console.sql")); // rejouable, la liste d'amorçage étant déjà retirée
    expect(Number(b.sql("select count(*) from pg_policies where policyname like 'transitoire console%'"))).toBe(10);
  });
});
