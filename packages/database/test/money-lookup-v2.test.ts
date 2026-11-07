import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Migration 0008 (contrat Money Lookup version 2) sur un Postgres jetable,
 * après la séquence exacte de production (0002 → 0002a → 0003 → 0003a → 0004
 * → 0005 → vis 0001 à 0004 → 0006 → 0007), puis tests adverses. Données et
 * comptes fictifs.
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

const VUES_V2 = [
  "ml_projets_v1", "ml_contacts_v1", "ml_notes_v1", "ml_taches_v1", "ml_vues_enregistrees_v1",
  "ml_demandes_v1", "ml_brouillons_projet_v1", "ml_liens_v1", "ml_imports_v1", "ml_rattachement_v1",
  "ml_indicateurs_v1", "ml_indicateurs_montants_v1", "ml_indicateurs_repartition_v1", "ml_avis_v1",
];
const VUES_V1 = ["ml_toutes_v1", "ml_financements_v1", "ml_appels_offres_v1", "ml_investisseurs_v1", "ml_signals_v1", "ml_aujourdhui_v1", "ml_montants_v1", "ml_fiche_v1", "ml_decision_v1"];

/** Colonnes déclarées par le contrat (sections « ### `vue` » de la partie version 2), avec leur type Postgres. */
function contratV2(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let vue: string | null = null;
  for (const l of readFileSync(CONTRAT, "utf8").split("\n")) {
    const t = /^### `(ml_[a-z_]+_v1)`/.exec(l);
    if (t) { vue = t[1]!; out[vue] = []; continue; }
    if (/^#{1,3} /.test(l)) vue = null;
    const c = vue ? /^\| `([a-z0-9_]+)` \| ([A-Za-z][A-Za-z -]*) \|/.exec(l) : null;
    if (vue && c) out[vue]!.push(`${c[1]}:${c[2]}`);
  }
  return Object.fromEntries(Object.entries(out).filter(([k]) => VUES_V2.includes(k)));
}

let b: Banc;
let colonnesV1Avant = "";
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const compte = (sql: string, uid: string) => Number(b.sql(sql, en(uid)));
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
    // Rejouable.
    b.fichier(MIG("0008_money_lookup_v2.sql"));
    b.sql(`
      insert into auth.users (id, email) values ('${L}', 'lecteur@exemple.test'), ('${B}', 'autre@exemple.test'), ('${X}', 'x@exemple.test');
      insert into oia_espace (id, nom) values ('${AUTRE}', 'autre fictif');
      insert into oia_membre (user_id, espace_id, role) values ('${L}', '${STUDIO}', 'lecteur'), ('${B}', '${AUTRE}', 'editeur');
      insert into oia_projet (espace_id, slug, nom, type, statut, actif, revue_profil, empreinte) values
        ('${STUDIO}', 'projet-a', 'Projet A fictif', 'PRODUCT', 'ACTIVE', true, 'DRAFT', repeat('a', 64)),
        ('${STUDIO}', 'projet-z', 'Projet Z fictif', 'PRODUCT', 'ACTIVE', true, 'CONFIRMED_BY_OWNER', repeat('b', 64)),
        ('${AUTRE}', 'projet-b', 'Projet B fictif', 'PRODUCT', 'ACTIVE', true, 'DRAFT', repeat('c', 64));
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, opportunity_kind, recommendation, verification_status, payload, content_fingerprint, espace_id, deadline_at)
      values ('22222222-aaaa-4000-8000-000000000001', 'k1', 'rec-1', 'Subvention fictive', 'Région fictive', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f1', '${STUDIO}', now() + interval '5 days'),
             ('22222222-aaaa-4000-8000-000000000002', 'k2', 'rec-2', 'Appel fictif', 'Ville fictive', 'TENDER', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f2', '${STUDIO}', now() - interval '3 days'),
             ('22222222-aaaa-4000-8000-000000000003', 'k3', 'rec-3', 'Fonds fictif', 'Fonds', 'EQUITY', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f3', '${STUDIO}', null),
             ('22222222-aaaa-4000-8000-000000000004', 'k4', 'rec-4', 'Prix fictif', 'Fondation', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f4', '${STUDIO}', null),
             ('22222222-aaaa-4000-8000-000000000009', 'k9', 'rec-9', 'Subvention B', 'État fictif', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f9', '${AUTRE}', null);
      update watch_opportunities set discovered_for = '{projet-z,projet-inconnu}' where record_id = 'rec-3';
      update watch_opportunities set discovered_for = '{projet-z}' where record_id = 'rec-1';
      update watch_opportunities set gate_failed_reasons = '{deadline not verified}' where record_id in ('rec-1', 'rec-2');
      insert into ml_montant (opportunity_id, espace_id, valeur, devise, confiance) values ('22222222-aaaa-4000-8000-000000000001', '${STUDIO}', 50000, 'EUR', 'HAUTE');
      insert into project_tags (espace_id, record_id, project_slug, actor) values ('${STUDIO}', 'rec-1', 'projet-a', 'm1'), ('${STUDIO}', 'rec-2', 'projet-a', 'm1'), ('${AUTRE}', 'rec-9', 'projet-b', 'b');
      insert into reviews (espace_id, record_id, action, actor, gate_pursue_eligible_at_decision) values ('${STUDIO}', 'rec-1', 'APPROVE', 'm1', false), ('${STUDIO}', 'rec-2', 'REJECT', 'm1', false), ('${AUTRE}', 'rec-9', 'COMMENT', 'b', false);
      insert into notes (espace_id, text, record_id, project_slug, actor) values ('${STUDIO}', 'Note fictive', 'rec-1', 'projet-a', 'm1'), ('${AUTRE}', 'Note B', null, 'projet-b', 'b');
      insert into tasks (espace_id, title, due, record_id, project_slug, actor) values
        ('${STUDIO}', 'Tâche en retard', current_date - 2, 'rec-1', 'projet-a', 'm1'),
        ('${STUDIO}', 'Tâche à venir', current_date + 3, null, 'projet-a', 'm1'),
        ('${AUTRE}', 'Tâche B', current_date - 1, null, 'projet-b', 'b');
      insert into tasks (espace_id, title, due, status, completed_at, actor) values ('${STUDIO}', 'Tâche faite', current_date - 5, 'DONE', now(), 'm1');
      insert into contacts (espace_id, name, organisation, email, project_slug, actor) values ('${STUDIO}', 'Contact fictif', 'Organisme fictif', 'contact@exemple.test', 'projet-a', 'm1'), ('${AUTRE}', 'Contact B', null, null, null, 'b');
      insert into saved_views (espace_id, name, filters) values ('${STUDIO}', 'Vue fictive', '{"nature": "GRANT"}'), ('${AUTRE}', 'Vue B', '{}');
      insert into requests (espace_id, kind, payload, requested_by) values ('${STUDIO}', 'INGEST_URL', '{"url": "https://exemple.test/appel"}', 'm1'), ('${AUTRE}', 'DISCOVERY', '{}', 'b');
      insert into project_drafts (espace_id, slug, entry, created_by) values ('${STUDIO}', 'projet-nouveau', '{"name": "Projet nouveau fictif"}', 'm1'), ('${AUTRE}', 'projet-b2', '{}', 'b');
      insert into link_checks (espace_id, url, status, http_code, checked_at, where_found) values ('${STUDIO}', 'https://exemple.test/appel', 'OK', 200, now(), '{rec-1}'), ('${AUTRE}', 'https://exemple.test/b', 'BROKEN', 404, now(), '{}');
      insert into oia_import (espace_id, user_id, bilan) values ('${STUDIO}', '${M1}', '{"notes": 1}'), ('${AUTRE}', '${B}', '{}');
    `);
  });
  afterAll(() => b?.arreter());

  it("un compte connecté qui n'est membre de rien ne lit rien, vue par vue ; anon non plus", () => {
    for (const v of [...VUES_V2, "oia_projet"]) {
      expect(compte(`select count(*) from ${v}`, X), v).toBe(0);
      expect(erreur(b, `select count(*) from ${v}`, { role: "anon" }), v).toMatch(/permission denied/);
    }
  });

  it("accès croisé : chaque vue ne montre que l'espace de l'appelant", () => {
    for (const v of VUES_V2) {
      expect(compte(`select count(*) from ${v} where espace_id = '${AUTRE}'`, M1), `${v} vu par M1`).toBe(0);
      expect(compte(`select count(*) from ${v} where espace_id = '${STUDIO}'`, B), `${v} vu par B`).toBe(0);
      expect(compte(`select count(*) from ${v} where espace_id = '${STUDIO}'`, M1), `${v} vu par M1, son espace`).toBeGreaterThan(0);
      expect(compte(`select count(*) from ${v} where espace_id = '${AUTRE}'`, B), `${v} vu par B, son espace`).toBeGreaterThan(0);
    }
  });

  it("un lecteur du studio lit tout, sans pouvoir écrire", () => {
    for (const v of VUES_V2) expect(compte(`select count(*) from ${v}`, L), v).toBeGreaterThan(0);
  });

  it("aucune écriture par les vues ni dans oia_projet, même pour un propriétaire", () => {
    for (const q of [
      "insert into oia_projet (slug, nom, type, statut, actif, revue_profil, empreinte) values ('intrus', 'x', 'x', 'x', true, 'DRAFT', repeat('d', 64))",
      "update oia_projet set nom = 'piraté'",
      "delete from oia_projet",
      "insert into ml_notes_v1 (texte) values ('intrus')",
      "update ml_taches_v1 set titre = 'piraté'",
      "delete from ml_contacts_v1",
      "update ml_projets_v1 set nom = 'piraté'",
    ]) expect(erreur(b, q, en(M1)), q).toMatch(/permission denied|cannot (insert|update|delete)/);
  });

  it("les vues de la version 1 sont inchangées", () => {
    expect(colonnes(VUES_V1)).toBe(colonnesV1Avant);
  });

  it("sens des colonnes : retard, projets, liens, imports, indicateurs", () => {
    const j = (sql: string) => JSON.parse(b.sql(sql, en(M1)));
    expect(j(`select json_object_agg(titre, en_retard) from ml_taches_v1`)).toEqual({ "Tâche en retard": true, "Tâche à venir": false, "Tâche faite": false });
    expect(j(`select to_json(p) from (select slug, opportunites_etiquetees, taches_ouvertes, notes from ml_projets_v1 where slug = 'projet-a') p`))
      .toEqual({ slug: "projet-a", opportunites_etiquetees: 2, taches_ouvertes: 2, notes: 1 });
    expect(j(`select to_json(l) from (select statut, code_http, trouve_dans from ml_liens_v1) l`)).toEqual({ statut: "OK", code_http: 200, trouve_dans: ["rec-1"] });
    const imp = b.sql("select id from ml_imports_v1", en(M1));
    expect(b.sql(`select actif from ml_imports_v1 where id = '${imp}'`, en(M1))).toBe("t");
    b.sql(`select oia_annuler_import('${imp}')`, en(M1));
    expect(b.sql(`select actif::text || '|' || (annule_le is not null)::text from ml_imports_v1 where id = '${imp}'`, en(M1))).toBe("false|true");
    // Rattachement : étiquette d'abord ; sinon découverte par un projet connu du registre ; sinon non triée.
    expect(j(`select json_object_agg(o.record_id, (select json_agg(coalesce(r.projet, '-') || ':' || r.rattachement order by r.projet) from ml_rattachement_v1 r where r.id = o.id)) from ml_toutes_v1 o`))
      .toEqual({ "rec-1": ["projet-a:etiquette"], "rec-2": ["projet-a:etiquette"], "rec-3": ["projet-z:decouverte"], "rec-4": ["-:aucun"] });
    const ind = j(`select json_object_agg(coalesce(projet, '(non triée)'), json_build_object('n', opportunites, 'etiq', etiquetees, 'trier', a_trier, 'app', approuvees, 'rej', rejetees, 'bloq', approuvees_bloquees, 'pretes', pretes, 'mont', avec_montant, 'sans', sans_montant, 'exp', expirees, 'quatorze', closes_sous_14_jours)) from ml_indicateurs_v1`);
    expect(ind["projet-a"]).toEqual({ n: 2, etiq: 2, trier: 0, app: 1, rej: 1, bloq: 1, pretes: 0, mont: 1, sans: 1, exp: 1, quatorze: 1 });
    expect(ind["projet-z"]).toEqual({ n: 1, etiq: 0, trier: 1, app: 0, rej: 0, bloq: 0, pretes: 0, mont: 0, sans: 1, exp: 0, quatorze: 0 });
    expect(ind["(non triée)"]).toEqual({ n: 1, etiq: 0, trier: 1, app: 0, rej: 0, bloq: 0, pretes: 0, mont: 0, sans: 1, exp: 0, quatorze: 0 });
    // Montants : jamais deux catégories, deux sens ou deux devises dans une même ligne ; inconnus à part.
    const m = j(`select json_agg(json_build_object('p', projet, 'c', categorie, 'd', devise, 's', somme_connue) order by projet, categorie) from ml_indicateurs_montants_v1`);
    expect(m).toEqual([
      { p: "projet-a", c: "subvention", d: "EUR", s: 50000 },
      { p: "projet-a", c: "chiffre_affaires_contractuel_potentiel", d: null, s: null },
      { p: "projet-z", c: "investissement_capital", d: null, s: null },
      { p: null, c: "subvention", d: null, s: null },
    ]);
    expect(Number(b.sql(`select count(*) from (select espace_id, projet, categorie, sens, devise, verifie_par_humain from ml_indicateurs_montants_v1 group by 1, 2, 3, 4, 5, 6 having count(*) > 1) d`, en(M1)))).toBe(0);
    // Répartitions : nature et raisons de blocage, pour l'espace entier.
    const rep = j(`select json_object_agg(axe || '=' || valeur, opportunites) from ml_indicateurs_repartition_v1 where portee = 'espace' and axe in ('nature', 'blocage')`);
    expect(rep).toEqual({ "nature=GRANT": 2, "nature=TENDER": 1, "nature=EQUITY": 1, "blocage=deadline not verified": 2 });
    // Historique des avis : tous, pas seulement le dernier.
    expect(compte(`select count(*) from ml_avis_v1`, M1)).toBe(2);
  });

  it("chaque vue a exactement les colonnes et les types du contrat, dans l'ordre", () => {
    const c = contratV2();
    expect(Object.keys(c).sort()).toEqual([...VUES_V2].sort());
    for (const v of VUES_V2) {
      const reel = b.sql(`select string_agg(column_name || ':' || data_type, '|' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${v}'`);
      expect(reel.split("|"), v).toEqual(c[v]);
    }
  });
});
