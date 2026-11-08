import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Migration 0008 (contrat Money Lookup version 2) sur un Postgres jetable,
 * après la séquence exacte de production (0002 → 0002a → 0003 → 0003a → 0004
 * → 0005 → vis 0001 à 0004 → 0006 → 0007), puis tests adverses. Données et
 * comptes fictifs. La reprise du navigateur (A4) est testée dans
 * packages/money-lookup/test/reprise.test.ts, sur une sauvegarde produite par
 * le code de l'ancienne console.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../supabase/migrations/${n}`);
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const CONTRAT = chemin("../../../docs/interface/contrat-donnees-money-lookup.md");
const STUDIO = "00000000-0000-4000-8000-000000000001";
const AUTRE = "00000000-0000-4000-8000-0000000000b2";
const M1 = "11111111-aaaa-4000-8000-000000000001"; // compte de Mickaël, propriétaire du studio (fictif)
const L = "dddddddd-aaaa-4000-8000-000000000004"; // lecteur du studio
const B = "bbbbbbbb-aaaa-4000-8000-000000000002"; // éditeur d'un autre espace
const X = "99999999-aaaa-4000-8000-000000000009"; // compte connecté, membre de rien

const VUES_V2 = ["ml_decision_v2", "ml_toutes_v2", "ml_financements_v2", "ml_appels_offres_v2", "ml_investisseurs_v2", "ml_montants_v2", "ml_aujourdhui_v2", "ml_fiche_v2"];
const VUES_NOUVELLES = [
  "ml_projets_v1", "ml_contacts_v1", "ml_notes_v1", "ml_taches_v1", "ml_vues_enregistrees_v1",
  "ml_demandes_v1", "ml_brouillons_projet_v1", "ml_liens_v1", "ml_imports_v1", "ml_rattachement_v1",
  "ml_indicateurs_v1", "ml_indicateurs_montants_v1", "ml_indicateurs_repartition_v1", "ml_avis_v1",
  "ml_clos_depuis_visite_v1", "ml_suggestions_v1",
];
const TOUTES = [...VUES_V2, ...VUES_NOUVELLES];
const VUES_V1 = ["ml_toutes_v1", "ml_financements_v1", "ml_appels_offres_v1", "ml_investisseurs_v1", "ml_signals_v1", "ml_aujourdhui_v1", "ml_montants_v1", "ml_fiche_v1", "ml_decision_v1"];

/** Colonnes déclarées par le contrat (sections « ### `vue` » de la version 2), avec leur type Postgres. */
function contratV2(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let vue: string | null = null;
  for (const l of readFileSync(CONTRAT, "utf8").split("\n")) {
    const t = /^### `(ml_[a-z_]+_v[12])`/.exec(l);
    if (t) { vue = t[1]!; out[vue] = []; continue; }
    if (/^#{1,3} /.test(l)) vue = null;
    const c = vue ? /^\| `([a-z0-9_]+)` \| ([A-Za-z][A-Za-z -]*) \|/.exec(l) : null;
    if (vue && c) out[vue]!.push(`${c[1]}:${c[2]}`);
  }
  return Object.fromEntries(Object.entries(out).filter(([k]) => TOUTES.includes(k)));
}

let b: Banc;
let colonnesV1Avant = "";
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const compte = (sql: string, uid: string) => Number(b.sql(sql, en(uid)));
const j = (sql: string, uid = M1) => JSON.parse(b.sql(sql, en(uid)) || "null");
const colonnes = (vues: string[]) =>
  b.sql(`select string_agg(table_name || '.' || column_name || ':' || data_type, ',' order by table_name, ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = any(array[${vues.map((v) => `'${v}'`).join(",")}])`);

describe.skipIf(!postgresDisponible)("0008 · Money Lookup, contrat version 2 (Postgres jetable)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    b.sql(`insert into auth.users (id, email) values ('${M1}', 'premier@exemple.test');`);
    b.sql(`select set_config('oia.comptes_mickael', (select string_agg(email, ',') from auth.users), false);\n${readFileSync(MIG("0002a_comptes_de_mickael.sql"), "utf8")}`);
    for (const m of ["0003_membres_et_politiques.sql", "0003a_transition_console.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(MIG(m));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    for (const m of ["0006_visibility_vues.sql", "0007_shyrka.sql"]) b.fichier(MIG(m));
    colonnesV1Avant = colonnes(VUES_V1);
    b.fichier(MIG("0008_money_lookup_v2.sql"));
    b.fichier(MIG("0008_money_lookup_v2.sql")); // rejouable
    b.sql(`
      insert into auth.users (id, email) values ('${L}', 'lecteur@exemple.test'), ('${B}', 'autre@exemple.test'), ('${X}', 'x@exemple.test');
      insert into oia_espace (id, nom) values ('${AUTRE}', 'autre fictif');
      insert into oia_membre (user_id, espace_id, role) values ('${L}', '${STUDIO}', 'lecteur'), ('${B}', '${AUTRE}', 'editeur');
      insert into oia_projet (espace_id, slug, nom, type, statut, actif, revue_profil, empreinte) values
        ('${STUDIO}', 'projet-a', 'Projet A fictif', 'PRODUCT', 'LIVE', true, 'DRAFT', repeat('a', 64)),
        ('${STUDIO}', 'projet-z', 'Projet Z fictif', 'PRODUCT', 'LIVE', true, 'CONFIRMED_BY_OWNER', repeat('b', 64)),
        ('${AUTRE}', 'projet-b', 'Projet B fictif', 'PRODUCT', 'LIVE', true, 'DRAFT', repeat('c', 64));
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, opportunity_kind, recommendation, verification_status, payload, content_fingerprint, espace_id, deadline_at, discovered_for, gate_failed_reasons)
      values ('22222222-aaaa-4000-8000-000000000001', 'k1', 'rec-1', 'Subvention fictive', 'Région fictive', 'GRANT', 'INVESTIGATE', 'VERIFIED',
              '{"scores": {"infoConfidence": 70}, "assessment": {"verdict": "LIKELY"}, "strategicRoute": "FR_SAS", "facts": [{"field": "publication-date", "normalizedValue": "2026-10-01"}, {"field": "notice-type", "normalizedValue": "cn-standard"}]}',
              'f1', '${STUDIO}', now() + interval '5 days', '{projet-z}', '{deadline not verified}'),
             ('22222222-aaaa-4000-8000-000000000002', 'k2', 'rec-2', 'Appel fictif', 'Ville fictive', 'TENDER', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f2', '${STUDIO}', now() - interval '3 days', '{}', '{deadline not verified}'),
             ('22222222-aaaa-4000-8000-000000000003', 'k3', 'rec-3', 'Fonds fictif', 'Fonds', 'EQUITY', 'INVESTIGATE', 'UNVERIFIED', '{"facts": null}', 'f3', '${STUDIO}', null, '{projet-z,projet-inconnu}', '{}'),
             ('22222222-aaaa-4000-8000-000000000004', 'k4', 'rec-4', 'Prix fictif', 'Fondation', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f4', '${STUDIO}', now() - interval '1 day', '{}', '{}'),
             ('22222222-aaaa-4000-8000-000000000005', 'k5', 'rec-5', 'Règlement fictif', 'Autorité', 'REGULATORY', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f5', '${STUDIO}', null, '{}', '{}'),
             ('22222222-aaaa-4000-8000-000000000009', 'k9', 'rec-9', 'Subvention B', 'État fictif', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f9', '${AUTRE}', null, '{}', '{}');
      insert into ml_montant (opportunity_id, espace_id, valeur, devise, confiance) values ('22222222-aaaa-4000-8000-000000000001', '${STUDIO}', 50000, 'EUR', 'HAUTE');
      insert into project_tags (espace_id, record_id, project_slug, actor) values ('${STUDIO}', 'rec-1', 'projet-a', 'm1'), ('${STUDIO}', 'rec-2', 'projet-a', 'm1'), ('${AUTRE}', 'rec-9', 'projet-b', 'b');
      insert into reviews (espace_id, record_id, action, actor, auteur_origine, gate_pursue_eligible_at_decision, at) values
        ('${STUDIO}', 'rec-1', 'APPROVE', 'm1', 'mickael', false, now() - interval '2 hours'),
        ('${STUDIO}', 'rec-1', 'COMMENT', 'm1', null, false, now() - interval '1 hour'),
        ('${STUDIO}', 'rec-2', 'REJECT', 'm1', null, false, now()),
        ('${AUTRE}', 'rec-9', 'COMMENT', 'b', null, false, now());
      insert into notes (espace_id, text, record_id, project_slug, actor, auteur_origine) values ('${STUDIO}', 'Note fictive', 'rec-1', 'projet-a', 'm1', 'mickael'), ('${AUTRE}', 'Note B', null, 'projet-b', 'b', null);
      insert into tasks (espace_id, title, due, record_id, project_slug, actor) values
        ('${STUDIO}', 'Tâche en retard', current_date - 2, 'rec-1', 'projet-a', 'm1'),
        ('${STUDIO}', 'Tâche à venir', current_date + 3, null, 'projet-a', 'm1'),
        ('${AUTRE}', 'Tâche B', current_date - 1, null, 'projet-b', 'b');
      insert into tasks (espace_id, title, due, status, completed_at, record_id, actor) values ('${STUDIO}', 'Tâche faite', current_date - 5, 'DONE', now(), 'rec-1', 'm1');
      insert into contacts (espace_id, name, organisation, email, project_slug, actor) values ('${STUDIO}', 'Contact fictif', 'Organisme fictif', 'contact@exemple.test', 'projet-a', 'm1'), ('${AUTRE}', 'Contact B', null, null, null, 'b');
      insert into saved_views (espace_id, name, filters) values ('${STUDIO}', 'Vue fictive', '{"kind": "GRANT"}'), ('${AUTRE}', 'Vue B', '{}');
      insert into requests (espace_id, kind, payload, requested_by) values ('${STUDIO}', 'INGEST_URL', '{"url": "https://exemple.test/appel"}', 'm1'), ('${AUTRE}', 'DISCOVERY', '{}', 'b');
      insert into project_drafts (espace_id, slug, entry, created_by) values ('${STUDIO}', 'projet-nouveau', '{"name": "Projet nouveau fictif"}', 'm1'), ('${AUTRE}', 'projet-b2', '{}', 'b');
      insert into link_checks (espace_id, url, status, http_code, checked_at, where_found) values ('${STUDIO}', 'https://exemple.test/appel', 'OK', 200, now(), '{rec-1}'), ('${AUTRE}', 'https://exemple.test/b', 'DEAD', 404, now(), '{}');
      insert into oia_import (espace_id, user_id, bilan) values ('${STUDIO}', '${M1}', '{"notes": 0}'), ('${AUTRE}', '${B}', '{}');
    `);
    // Échéances de candidature dans la source (règle de la console) ; rec-1 a aussi une échéance plus tardive.
    const ech = (rec: string, jours: number, type = "APPLICATION") =>
      `update watch_opportunities set payload = jsonb_set(payload, '{deadlines}', coalesce(payload -> 'deadlines', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('deadlineType', '${type}', 'normalized', to_char(current_date + ${jours}, 'YYYY-MM-DD')))) where record_id = '${rec}';`;
    b.sql([ech("rec-1", 5), ech("rec-1", 40, "UNKNOWN"), ech("rec-2", -3), ech("rec-4", -1)].join("\n"));
    b.sql(`update watch_opportunities set deadline_at = now() + interval '40 days' where record_id = 'rec-1';`);
    // Autre espace : scénarios d'« Aujourd'hui » et de suggestions.
    const pub = (n: number) => `'{"facts": [{"field": "publication-date", "normalizedValue": "2026-10-${String(10 + n).padStart(2, "0")}"}]}'`;
    b.sql(`
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, opportunity_kind, recommendation, verification_status, payload, content_fingerprint, espace_id)
      select ('33333333-aaaa-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid, 'kb' || n, 'rec-b-' || n, 'Appel à trier ' || n, 'Émetteur B', 'GRANT', 'INVESTIGATE', 'UNVERIFIED',
             ('{"facts": [{"field": "publication-date", "normalizedValue": "2026-10-' || lpad((10 + n)::text, 2, '0') || '"}]}')::jsonb, 'fb' || n, '${AUTRE}'
      from generate_series(1, 7) n;
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, opportunity_kind, recommendation, verification_status, payload, content_fingerprint, espace_id)
      values ('33333333-aaaa-4000-8000-000000000020', 'kb20', 'rec-b-exp', 'Subvention échue fictive', 'Émetteur B', 'GRANT', 'INVESTIGATE', 'UNVERIFIED',
              jsonb_build_object('deadlines', jsonb_build_array(jsonb_build_object('deadlineType', 'APPLICATION', 'normalized', to_char(current_date - 2, 'YYYY-MM-DD')))), 'fb20', '${AUTRE}'),
             ('33333333-aaaa-4000-8000-000000000021', 'kb21', 'rec-b-sol', 'Solar energy grant, FR', 'Agence fictive', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'fb21', '${AUTRE}'),
             ('33333333-aaaa-4000-8000-000000000022', 'kb22', 'rec-b-nuc', 'Solar and nuclear call', 'Agence fictive', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'fb22', '${AUTRE}'),
             ('33333333-aaaa-4000-8000-000000000023', 'kb23', 'rec-b-geo', 'Maintenance contract FR', 'Agence fictive', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'fb23', '${AUTRE}');
      insert into reviews (espace_id, record_id, action, actor, gate_pursue_eligible_at_decision) values
        ('${AUTRE}', 'rec-b-exp', 'NEEDS_VERIFICATION', 'b', false), ('${AUTRE}', 'rec-b-sol', 'REJECT', 'b', false),
        ('${AUTRE}', 'rec-b-nuc', 'REJECT', 'b', false), ('${AUTRE}', 'rec-b-geo', 'REJECT', 'b', false);
      insert into tasks (espace_id, title, due, actor) values ('${AUTRE}', 'Tâche B à 10 jours', current_date + 10, 'b'), ('${AUTRE}', 'Tâche B à 20 jours', current_date + 20, 'b');
      update oia_projet set mots_cles = '{subvention}' where slug = 'projet-a';
      update oia_projet set mots_cles = '{solar,ai}', secteurs = '{energy}', geographies = '{FR}', exclusions = '{nuclear}' where slug = 'projet-b';
      insert into oia_visite (user_id, espace_id, derniere, precedente) values
        ('${M1}', '${STUDIO}', now() - interval '2 hours', now() - interval '10 days'),
        ('${L}', '${STUDIO}', now() - interval '2 hours', now() - interval '10 days'),
        ('${B}', '${AUTRE}', now() - interval '2 hours', now() - interval '10 days');
    `);
  });
  afterAll(() => b?.arreter());

  it("un compte connecté qui n'est membre de rien ne lit rien, vue par vue ; anon non plus", () => {
    for (const v of [...TOUTES, "oia_projet", "oia_import_element"]) {
      expect(compte(`select count(*) from ${v}`, X), v).toBe(0);
      expect(erreur(b, `select count(*) from ${v}`, { role: "anon" }), v).toMatch(/permission denied/);
    }
  });

  it("accès croisé : chaque vue ne montre que l'espace de l'appelant ; un lecteur lit tout", () => {
    for (const v of TOUTES) {
      if (v === "ml_aujourdhui_v2" || v === "ml_decision_v2") continue; // vérifiées plus bas (l'autre espace n'y a pas de ligne)
      expect(compte(`select count(*) from ${v} where espace_id = '${AUTRE}'`, M1), `${v} vu par M1`).toBe(0);
      expect(compte(`select count(*) from ${v} where espace_id = '${STUDIO}'`, B), `${v} vu par B`).toBe(0);
      expect(compte(`select count(*) from ${v} where espace_id = '${STUDIO}'`, M1), `${v} vu par M1, son espace`).toBeGreaterThan(0);
      // L'autre espace n'a qu'une subvention : pas d'appel d'offres ni d'investisseur.
      if (v !== "ml_appels_offres_v2" && v !== "ml_investisseurs_v2") expect(compte(`select count(*) from ${v} where espace_id = '${AUTRE}'`, B), `${v} vu par B, son espace`).toBeGreaterThan(0);
      expect(compte(`select count(*) from ${v}`, L), `${v} vu par le lecteur`).toBeGreaterThan(0);
    }
    for (const v of ["ml_aujourdhui_v2", "ml_decision_v2"]) expect(compte(`select count(*) from ${v} where espace_id = '${STUDIO}'`, B), v).toBe(0);
  });

  it("aucune écriture par les vues ni dans les tables nouvelles, même pour un propriétaire", () => {
    for (const q of [
      "insert into oia_projet (slug, nom, type, statut, actif, revue_profil, empreinte) values ('intrus', 'x', 'x', 'x', true, 'DRAFT', repeat('d', 64))",
      "update oia_projet set nom = 'piraté'",
      "delete from oia_import_element",
      "insert into ml_notes_v1 (texte) values ('intrus')",
      "update ml_taches_v1 set titre = 'piraté'",
      "delete from ml_contacts_v1",
      "delete from ml_vues_enregistrees_v1",
      "update ml_projets_v1 set nom = 'piraté'",
      "update ml_toutes_v2 set titre = 'piraté'",
    ]) expect(erreur(b, q, en(M1)), q).toMatch(/permission denied|cannot (insert|update|delete)/);
  });

  it("les vues de la version 1 sont inchangées et toujours servies", () => {
    expect(colonnes(VUES_V1)).toBe(colonnesV1Avant);
    // v1 garde son sens : un COMMENT y est la dernière décision, REGULATORY y figure.
    expect(b.sql(`select decision_humaine from ml_toutes_v1 where record_id = 'rec-1'`, en(M1))).toBe("COMMENT");
    expect(compte(`select count(*) from ml_toutes_v1 where nature = 'REGULATORY'`, M1)).toBe(1);
  });

  it("décisions par défaut : un COMMENT ne change pas la dernière décision", () => {
    expect(j(`select to_json(d) from (select decision, decide_par, auteur_origine from ml_decision_v2 where record_id = 'rec-1') d`)).toEqual({ decision: "APPROVE", decide_par: "m1", auteur_origine: "mickael" });
    expect(j(`select to_json(t) from (select decision_humaine, verifie_par_humain from ml_toutes_v2 where record_id = 'rec-1') t`)).toEqual({ decision_humaine: "APPROVE", verifie_par_humain: true });
    expect(compte(`select count(*) from ml_decision_v2 where decision = 'COMMENT'`, M1)).toBe(0);
  });

  it("décisions par défaut : REGULATORY hors de Toutes et des Montants, toujours dans Signals", () => {
    expect(compte(`select count(*) from ml_toutes_v2 where nature = 'REGULATORY'`, M1)).toBe(0);
    expect(compte(`select count(*) from ml_toutes_v2`, M1)).toBe(4);
    expect(compte(`select coalesce(sum(opportunites), 0) from ml_montants_v2`, M1)).toBe(4);
    expect(compte(`select coalesce(sum(opportunites), 0) from ml_montants_v1`, M1)).toBe(5);
    expect(compte(`select count(*) from ml_signals_v1 where nature_signal = 'REGULATORY'`, M1)).toBe(1);
  });

  it("décisions par défaut : EN_ATTENTE_DE_TRI exclut les échéances dépassées", () => {
    const tri = (v: string) => j(`select coalesce(json_agg(record_id order by record_id), '[]') from ${v} where raison = 'EN_ATTENTE_DE_TRI'`);
    expect(tri("ml_aujourdhui_v1")).toEqual(["rec-3", "rec-4", "rec-5"]);
    expect(j(`select coalesce(json_agg(record_id order by record_id), '[]') from ml_aujourdhui_v2 where raison = 'EN_ATTENTE_DE_TRI' and horizon = 14`)).toEqual(["rec-3"]);
  });

  it("colonnes de liste lues dans la source, sans erreur sur une source incomplète", () => {
    expect(j(`select to_json(t) from (select publie_le, confiance_information, verdict_analyste, route_strategique, type_avis from ml_toutes_v2 where record_id = 'rec-1') t`))
      .toEqual({ publie_le: "2026-10-01", confiance_information: 70, verdict_analyste: "LIKELY", route_strategique: "FR_SAS", type_avis: "cn-standard" });
    expect(j(`select to_json(t) from (select publie_le, confiance_information, verdict_analyste from ml_toutes_v2 where record_id = 'rec-3') t`))
      .toEqual({ publie_le: null, confiance_information: null, verdict_analyste: null });
  });

  it("fiche v2 : identifiants, date de fin des tâches, gate de chaque décision, auteur d'origine", () => {
    const f = j(`select to_json(f) from (select decisions, notes, taches from ml_fiche_v2 where record_id = 'rec-1') f`);
    expect(f.decisions[0]).toMatchObject({ action: "COMMENT", gate_ok_au_moment: false });
    expect(f.decisions[1]).toMatchObject({ action: "APPROVE", auteur_origine: "mickael", gate_ok_au_moment: false });
    expect(f.decisions[1].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(f.notes[0]).toMatchObject({ texte: "Note fictive", auteur_origine: "mickael" });
    expect(f.notes[0].id).toMatch(/^[0-9a-f-]{36}$/);
    const faite = f.taches.find((t: { titre: string }) => t.titre === "Tâche faite");
    expect(faite.faite_le).not.toBeNull();
    expect(faite.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rattachement et indicateurs au même périmètre (couverture), sans mélange de catégories", () => {
    expect(j(`select json_object_agg(o.record_id, (select json_agg(coalesce(r.projet, '-') || ':' || r.rattachement order by r.projet) from ml_rattachement_v1 r where r.id = o.id)) from ml_toutes_v2 o`))
      .toEqual({ "rec-1": ["projet-a:etiquette"], "rec-2": ["projet-a:etiquette"], "rec-3": ["projet-z:decouverte"], "rec-4": ["-:aucun"] });
    const ind = j(`select json_object_agg(portee || ':' || coalesce(projet, '-'), json_build_object('n', opportunites, 'mont', avec_montant, 'sans', sans_montant, 'pretes', pretes, 'bloq', bloquees, 'trier', a_trier, 'exp', expirees)) from ml_indicateurs_v1`);
    expect(ind["espace:-"]).toEqual({ n: 4, mont: 1, sans: 3, pretes: 0, bloq: 4, trier: 1, exp: 2 });
    expect(ind["projet:projet-a"]).toEqual({ n: 2, mont: 1, sans: 1, pretes: 0, bloq: 2, trier: 0, exp: 1 });
    expect(ind["projet:projet-z"]).toEqual({ n: 1, mont: 0, sans: 1, pretes: 0, bloq: 1, trier: 1, exp: 0 });
    expect(ind["non_triee:-"]).toEqual({ n: 1, mont: 0, sans: 1, pretes: 0, bloq: 1, trier: 0, exp: 1 });
    expect(compte(`select count(*) from (select 1 from ml_indicateurs_montants_v1 group by espace_id, portee, projet, categorie, sens, devise, verifie_par_humain having count(*) > 1) d`, M1)).toBe(0);
    expect(j(`select to_json(m) from (select somme_connue, somme_bloquees, bloquees from ml_indicateurs_montants_v1 where portee = 'projet' and projet = 'projet-a' and devise = 'EUR') m`))
      .toEqual({ somme_connue: 50000, somme_bloquees: 50000, bloquees: 1 });
    expect(j(`select json_object_agg(valeur, opportunites) from ml_indicateurs_repartition_v1 where portee = 'espace' and axe = 'blocage'`)).toEqual({ "deadline not verified": 2, "opportunity is expired": 2 });
  });

  it("lectures globales : tâches (retard, fin), projets, liens, avis avec auteur d'origine et gate", () => {
    expect(j(`select json_object_agg(titre, en_retard) from ml_taches_v1`)).toEqual({ "Tâche en retard": true, "Tâche à venir": false, "Tâche faite": false });
    expect(j(`select to_json(p) from (select slug, chemin_registre, opportunites_etiquetees, taches_ouvertes, notes from ml_projets_v1 where slug = 'projet-a') p`))
      .toEqual({ slug: "projet-a", chemin_registre: "registry/projects/projet-a.yaml", opportunites_etiquetees: 2, taches_ouvertes: 2, notes: 1 });
    expect(j(`select to_json(l) from (select statut, code_http, trouve_dans from ml_liens_v1) l`)).toEqual({ statut: "OK", code_http: 200, trouve_dans: ["rec-1"] });
    expect(compte(`select count(*) from ml_avis_v1`, M1)).toBe(3);
    expect(compte(`select count(*) from ml_avis_v1 where auteur_origine = 'mickael' and gate_ok_au_moment = false`, M1)).toBe(1);
  });

  it("deux échéances : candidature par défaut, la plus tardive de la source à côté ; fraîcheur recalculée comme la console", () => {
    const o = j(`select json_object_agg(record_id, json_build_object('ech', echeance::date - current_date, 'tard', echeance_plus_tardive::date - current_date, 'j', jours_restants, 'f', fraicheur)) from ml_toutes_v2`);
    expect(o["rec-1"]).toEqual({ ech: 5, tard: 40, j: 5, f: "BIENTOT_CLOSE" });
    expect(o["rec-2"]).toMatchObject({ ech: -3, j: -3, f: "EXPIREE" });
    expect(o["rec-3"]).toMatchObject({ ech: null, j: null, f: "SANS_ECHEANCE" });
    // Échue : jamais éligible, recommandation REJECT, raison ajoutée ; la source reste lisible.
    b.sql(`update watch_opportunities set gate_pursue_eligible = true where record_id = 'rec-4'`);
    expect(j(`select to_json(t) from (select gate_ok, gate_ok_source, recommandation, recommandation_source, raisons_gate from ml_toutes_v2 where record_id = 'rec-4') t`))
      .toEqual({ gate_ok: false, gate_ok_source: true, recommandation: "REJECT", recommandation_source: "INVESTIGATE", raisons_gate: ["opportunity is expired"] });
    b.sql(`update watch_opportunities set gate_pursue_eligible = false where record_id = 'rec-4'`);
  });

  it("Aujourd'hui : horizons 7, 14 et 30 jours, « juste expirée », cinq « à trier » au plus", () => {
    const g = (h: number) => j(`select json_object_agg(raison, n) from (select raison, count(*) n from ml_aujourdhui_v2 where horizon = ${h} group by raison) x`, B);
    expect(g(7)).toEqual({ TACHE_EN_RETARD: 1, JUSTE_EXPIREE: 1, EN_ATTENTE_DE_TRI: 5 });
    expect(g(14)).toEqual({ TACHE_EN_RETARD: 1, TACHE_A_FAIRE: 1, JUSTE_EXPIREE: 1, EN_ATTENTE_DE_TRI: 5 });
    expect(g(30)).toEqual({ TACHE_EN_RETARD: 1, TACHE_A_FAIRE: 2, JUSTE_EXPIREE: 1, EN_ATTENTE_DE_TRI: 5 });
    // Les cinq plus récemment publiées ; rec-9, sans date de publication, vient après.
    expect(j(`select json_agg(record_id order by record_id) from ml_aujourdhui_v2 where horizon = 7 and raison = 'EN_ATTENTE_DE_TRI'`, B)).toEqual(["rec-b-3", "rec-b-4", "rec-b-5", "rec-b-6", "rec-b-7"]);
    expect(j(`select to_json(x) from (select ordre, jours_restants from ml_aujourdhui_v2 where horizon = 7 and raison = 'JUSTE_EXPIREE') x`, B)).toEqual({ ordre: 5, jours_restants: -2 });
    // Studio : rec-1 bientôt close (approuvée), une seule ligne même si elle est aussi bloquée.
    expect(j(`select json_agg(raison) from ml_aujourdhui_v2 where horizon = 14 and record_id = 'rec-1' and raison not like 'TACHE%'`)).toEqual(["BIENTOT_CLOS"]);
  });

  it("suggestions de projets : mots entiers, exclusion, il faut un mot-clé ou un secteur, confiance plafonnée", () => {
    const s = j(`select json_object_agg(record_id, json_build_object('p', projet, 'c', confiance, 'k', mots_cles, 's', secteurs, 'g', geographies)) from ml_suggestions_v1`, B);
    expect(s["rec-b-sol"]).toEqual({ p: "projet-b", c: 26, k: ["solar"], s: ["energy"], g: ["FR"] });
    expect(s["rec-b-nuc"]).toBeUndefined(); // exclusion « nuclear »
    expect(s["rec-b-geo"]).toBeUndefined(); // « ai » n'est pas un mot de « maintenance », et une géographie seule ne suffit pas
    expect(j(`select json_agg(record_id) from ml_suggestions_v1`)).toEqual(["rec-1"]);
    expect(b.sql(`select ml_mot_entier('Score (AI) fictif', 'ai')::text || ml_mot_entier('maintenance', 'ai')::text || ml_mot_entier('c++ et rust', 'c++')::text`)).toBe("truefalsetrue");
  });

  it("clos depuis la dernière visite : par compte ; oia_marquer_visite ne fait pas avancer la visite sur un simple rechargement", () => {
    expect(j(`select json_agg(record_id order by record_id) from ml_clos_depuis_visite_v1`)).toEqual(["rec-4"]);
    expect(j(`select json_agg(record_id order by record_id) from ml_clos_depuis_visite_v1`, B)).toEqual(["rec-b-exp"]);
    const v1 = j(`select oia_marquer_visite('${STUDIO}')`);
    const v2 = j(`select oia_marquer_visite('${STUDIO}')`);
    expect(v2).toEqual(v1);
    expect(Date.parse(v1.derniere)).toBeGreaterThan(Date.now() - 60_000);
    expect(compte(`select count(*) from ml_clos_depuis_visite_v1`, M1)).toBe(0);
    expect(compte(`select count(*) from ml_clos_depuis_visite_v1`, L)).toBe(1);
    expect(erreur(b, `select oia_marquer_visite('${STUDIO}')`, en(X))).toMatch(/accès refusé/);
    expect(erreur(b, `select count(*) from oia_visite`, { role: "anon" })).toMatch(/permission denied/);
    expect(compte(`select count(*) from oia_visite`, M1)).toBe(1);
  });

  it("basculer une tâche : son auteur ou tout propriétaire de l'espace ; pas un autre éditeur ni un lecteur", () => {
    const t = b.sql(`select id from ml_taches_v1 where titre = 'Tâche à venir'`, en(M1)); // auteur « m1 » (texte) : M1 n'en est pas l'auteur
    expect(b.sql(`select oia_basculer_tache('${t}')`, en(M1))).toBe("DONE");
    expect(b.sql(`select oia_basculer_tache('${t}')`, en(M1))).toBe("OPEN");
    expect(erreur(b, `select oia_basculer_tache('${t}')`, en(L))).toMatch(/droit d'écriture refusé/);
    const tb = b.sql(`select id from ml_taches_v1 where titre = 'Tâche B'`, en(B)); // éditeur, pas auteur, pas propriétaire
    expect(erreur(b, `select oia_basculer_tache('${tb}')`, en(B))).toMatch(/seuls l'auteur de la tâche et les propriétaires/);
  });

  it("oia_supprimer : éditeur de l'espace seulement, journalisé", () => {
    const note = b.sql(`select id from ml_notes_v1 where texte = 'Note fictive'`, en(M1));
    const noteB = b.sql(`select id from ml_notes_v1`, en(B));
    expect(erreur(b, `select oia_supprimer('note', '${note}')`, en(L))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_supprimer('note', '${noteB}')`, en(M1))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_supprimer('opportunite', '${note}')`, en(M1))).toMatch(/type à supprimer inconnu/);
    expect(erreur(b, `select oia_supprimer('note', gen_random_uuid())`, en(M1))).toMatch(/introuvable/);
    for (const [type, vue, champ] of [["note", "ml_notes_v1", "texte"], ["tache", "ml_taches_v1", "titre"], ["contact", "ml_contacts_v1", "nom"], ["vue", "ml_vues_enregistrees_v1", "nom"]] as const) {
      const id = b.sql(`select id from ${vue} order by ${champ} limit 1`, en(M1));
      const avant = compte(`select count(*) from ${vue}`, M1);
      b.sql(`select oia_supprimer('${type}', '${id}')`, en(M1));
      expect(compte(`select count(*) from ${vue}`, M1), type).toBe(avant - 1);
    }
    expect(Number(b.sql(`select count(*) from oia_journal where action = 'supprimer'`))).toBe(4);
  });

  it("oia_proposer_projet : brouillon PENDING puis recherche ; refus des cas invalides", () => {
    const r = j(`select oia_proposer_projet('${STUDIO}', 'projet-fictif-neuf', '{"name": "Projet fictif neuf", "kind": "PRODUCT"}')`);
    expect(r).toMatchObject({ slug: "projet-fictif-neuf", statut: "PENDING" });
    expect(j(`select to_json(d) from (select statut, contenu ->> 'slug' as slug from ml_brouillons_projet_v1 where slug = 'projet-fictif-neuf') d`)).toEqual({ statut: "PENDING", slug: "projet-fictif-neuf" });
    expect(j(`select charge from ml_demandes_v1 where id = '${r.demande_id}'`)).toEqual({ projects: ["projet-fictif-neuf"] });
    expect(erreur(b, `select oia_proposer_projet('${STUDIO}', 'projet-a', '{"name": "Doublon"}')`, en(M1))).toMatch(/existe déjà dans le registre/);
    expect(erreur(b, `select oia_proposer_projet('${STUDIO}', 'Mauvais Slug', '{"name": "x"}')`, en(M1))).toMatch(/identifiant de projet invalide/);
    expect(erreur(b, `select oia_proposer_projet('${STUDIO}', 'sans-nom', '{}')`, en(M1))).toMatch(/contenu de projet invalide/);
    expect(erreur(b, `select oia_proposer_projet('${STUDIO}', 'par-lecteur', '{"name": "x"}')`, en(L))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_proposer_projet('${AUTRE}', 'projet-b2', '{"name": "x"}')`, en(M1))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_proposer_projet('${STUDIO}', 'projet-b2', '{"name": "x"}')`, en(M1))).toMatch(/brouillon d'un autre espace/);
    b.sql(`update project_drafts set status = 'APPLIED' where slug = 'projet-nouveau'`);
    expect(erreur(b, `select oia_proposer_projet('${STUDIO}', 'projet-nouveau', '{"name": "x"}')`, en(M1))).toMatch(/déjà été traité \(APPLIED\)/);
  });

  it("chaque vue a exactement les colonnes et les types du contrat, dans l'ordre", () => {
    const c = contratV2();
    expect(Object.keys(c).sort()).toEqual([...TOUTES].sort());
    for (const v of TOUTES) {
      const reel = b.sql(`select string_agg(column_name || ':' || data_type, '|' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${v}'`);
      expect(reel.split("|"), v).toEqual(c[v]);
    }
  });
});
