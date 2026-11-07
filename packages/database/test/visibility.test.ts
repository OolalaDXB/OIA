import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Migration 0006 (vues Visibility) sur un Postgres jetable, au-dessus du schéma
 * `vis` de Visibility (infra/visibility/migrations/0001 à 0004, lus sans être
 * modifiés), puis jeu de démonstration (B3) et tests adverses.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const CONTRAT = chemin("../../../docs/interface/contrat-donnees-visibility.md");
const DEMO_JSON = chemin("../../../docs/interface/demo/visibility-demo.json");

const DEMO = "00000000-0000-4000-8000-00000000de00"; // propriétaire du client fictif de démonstration
const BOB = "bbbbbbbb-0000-4000-8000-0000000000b0"; // propriétaire du client « client-b »
const VERA = "dddddddd-0000-4000-8000-0000000000d0"; // lectrice (viewer) du client de démonstration
const XAV = "cccccccc-0000-4000-8000-0000000000c0"; // compte connecté, membre de rien (autre produit)
const SERVICE = "eeeeeeee-0000-4000-8000-0000000000e0"; // identité de service, membre owner pour le test

const VUES = [
  "vis_sujets_v1", "vis_mesure_v1", "vis_apercu_v1", "vis_reponses_v1", "vis_citations_v1", "vis_reseaux_sociaux_v1",
  "vis_concurrents_v1", "vis_questions_v1", "vis_recommandations_v1", "vis_rapports_v1", "vis_seo_command_v1", "vis_planificateur_v1",
];
const TABLES_VIS = ["vis.client", "vis.client_member", "vis.site", "vis.subject", "vis.window", "vis.evidence", "vis.recommendation", "vis.decision", "vis.execution", "vis.action_log", "vis_ui.question", "vis_ui.rapport"];

let b: Banc;
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const compte = (sql: string, uid: string) => Number(b.sql(sql, en(uid)));
const json = (sql: string, uid: string) => JSON.parse(b.sql(sql, en(uid)) || "null");

/** Colonnes déclarées par le contrat, vue par vue (sections « ### `vue` » suivies d'un tableau). */
function colonnesDuContrat(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let vue: string | null = null;
  for (const ligne of readFileSync(CONTRAT, "utf8").split("\n")) {
    const titre = /^### `(vis_[a-z_]+_v\d+)`/.exec(ligne);
    if (titre) {
      vue = titre[1]!;
      out[vue] = [];
      continue;
    }
    if (/^#{1,3} /.test(ligne)) vue = null;
    const col = vue ? /^\| `([a-z_]+)` \|/.exec(ligne) : null;
    if (vue && col) out[vue]!.push(col[1]!);
  }
  return out;
}

describe.skipIf(!postgresDisponible)("Visibility 0006 (Postgres jetable)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
  });
  afterAll(() => b?.arreter());

  it("vis 0004 s'applique comme sur Supabase : auth.uid() en uuid, migration par un rôle non superutilisateur", () => {
    b.sql("create database temoin");
    // Base séparée, transaction annulée. Comme sur Supabase : le schéma auth appartient à un autre
    // rôle, et le rôle qui migre a CREATEROLE et BYPASSRLS sans être superutilisateur.
    const emulation = readFileSync(chemin("./pg/supabase-emulation.sql"), "utf8").replace(/^create role .*$/gm, "").replace(/^grant anon.*$/gm, "");
    const vis = ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"].map((n) => readFileSync(VIS(n), "utf8"));
    const sortie = b.sql(`\\c temoin
      begin;
      ${emulation}
      create role migrateur nologin createrole bypassrls;
      grant create on database temoin to migrateur;
      grant create on schema public to migrateur;
      grant usage on schema auth to migrateur;
      set role migrateur;
      ${vis.join("\n")}
      select string_agg(distinct pg_get_userbyid(c.relowner), ',') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'vis' and c.relkind = 'r';
      -- Le rôle qui migre garde l'accès aux tables cédées (ses fonctions security definer en dépendent).
      select count(*) from vis.client_member;
      rollback;`);
    expect(sortie.split("\n").slice(-2)).toEqual(["vis_admin", "0"]);
  });

  it("installation : vis 0001 à 0004 (auth.uid() en uuid, comme sur Supabase), puis 0006 et la démonstration", () => {
    for (const n of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(n));
    b.fichier(chemin("../supabase/migrations/0006_visibility_vues.sql"));
    b.fichier(chemin("../demo/visibility-demo.sql"));
    // Second client fictif, pour l'accès croisé.
    b.sql(`
      insert into vis.client (id, display_name, ownership, status, default_repo_action_mode) values ('client-b', 'Client B fictif', 'external', 'active', 'lecture');
      insert into vis.client_member (user_id, client_id, role) values ('${BOB}', 'client-b', 'owner'), ('${VERA}', 'demo-fictif', 'viewer'), ('${SERVICE}', 'demo-fictif', 'owner');
      insert into vis.service_identity (user_id, name) values ('${SERVICE}', 'worker fictif');
      insert into vis.site (id, client_id, primary_url, status) values ('site-b', 'client-b', 'https://b-fictif.example', 'active');
      insert into vis.subject (id, client_id, status) values ('sujet-b', 'client-b', 'active');
      insert into vis.subject_site (subject_id, site_id, client_id) values ('sujet-b', 'site-b', 'client-b');
      insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on) values ('b-j0', 'sujet-b', 'client-b', 'baseline', 1, 'done', '2026-10-01', '2026-10-05');
      insert into vis.evidence (client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, collector_name, received_at, raw_text, raw_sha256, structured, citations)
      values ('client-b', 'site-b', 'sujet-b', 'b-j0', 'q01', 1, 'fr', 'chatgpt', 'manual', '2026-10-01T08:00:00Z', 'Réponse fictive B', '\\x00', '{"brandMentioned": true, "webSearch": true}', '[{"url": "https://b-fictif.example/x"}, {"url": "https://www.reddit.com/r/bfictif/comments/1"}]');
      insert into vis.recommendation (id, client_id, subject_id, type, title, statement, impact_level, effort_level, risk, confidence, created_by, payload)
      values ('rec-b-fictive-01', 'client-b', 'sujet-b', 'WATCH', 'Recommandation B', 'Énoncé fictif du client B.', 'low', 'XS', 'low', 'low', 'test', '{}');
      insert into vis.action_log (who, what, client_id) values ('test', 'mission.b', 'client-b');
      insert into vis_ui.rapport (client_id, subject_id, window_id, type, genere_le, version_panel, statut) values ('client-b', 'sujet-b', 'b-j0', 'j0', '2026-10-06T08:00:00Z', 1, 'a_valider');
    `);
    expect(compte("select count(*) from vis_reponses_v1", DEMO)).toBe(210);
  });

  it("un compte connecté qui n'est membre de rien ne lit rien, vue par vue et table par table", () => {
    for (const v of [...VUES, ...TABLES_VIS]) expect(compte(`select count(*) from ${v}`, XAV), v).toBe(0);
  });

  it("anon ne lit rien et n'écrit rien", () => {
    for (const v of ["vis_apercu_v1", "vis_reponses_v1", "vis.evidence", "vis_ui.rapport"]) expect(erreur(b, `select count(*) from ${v}`, { role: "anon" }), v).toMatch(/permission denied/);
    expect(erreur(b, `select vis_rejeter_recommandation('rec-demo-fait-01', 'motif')`, { role: "anon" })).toMatch(/permission denied/);
  });

  it("accès croisé : chaque vue ne montre que le client de l'appelant", () => {
    for (const v of VUES) {
      expect(compte(`select count(*) from ${v} where client_id = 'client-b'`, DEMO), `${v} vu par DEMO`).toBe(0);
      expect(compte(`select count(*) from ${v} where client_id = 'demo-fictif'`, BOB), `${v} vu par BOB`).toBe(0);
      expect(compte(`select count(*) from ${v} where client_id = 'client-b'`, BOB), `${v} vu par BOB, son client`).toBeGreaterThan(0);
    }
    expect(compte("select count(*) from vis.client_member", DEMO), "ses propres appartenances seulement").toBe(1);
    expect(compte("select count(*) from vis.client_member", BOB)).toBe(1);
  });

  it("aucune écriture directe, même pour un propriétaire", () => {
    for (const q of [
      `insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, collector_name, raw_text, raw_sha256) values ('demo-fictif', 'demo-sujet', 'demo-j0', 'q01', 1, 'fr', 'x', 'x', 'x', '\\x00')`,
      `insert into vis.decision (recommendation_id, status, decided_by, client_id) values ('rec-demo-fait-01', 'accepted', 'moi', 'demo-fictif')`,
      `insert into vis_ui.rapport (client_id, subject_id, window_id, type, genere_le, version_panel, statut) values ('demo-fictif', 'demo-sujet', 'demo-j0', 'j0', now(), 1, 'valide')`,
      `update vis_ui.question set texte = 'piraté'`,
      `insert into vis.client_member (user_id, client_id, role) values ('${XAV}', 'demo-fictif', 'owner')`,
      `delete from vis_ui.rapport`,
    ]) expect(erreur(b, q, en(DEMO)), q).toMatch(/permission denied/);
  });

  it("valider et rejeter : propriétaire seulement, sur son client, jamais une identité de service", () => {
    expect(erreur(b, `select vis_valider_recommandation('rec-demo-fait-01')`, en(VERA))).toMatch(/owner\/approver/);
    expect(erreur(b, `select vis_rejeter_recommandation('rec-demo-fait-01', 'non pertinent')`, en(VERA))).toMatch(/droit de décision refusé/);
    expect(erreur(b, `select vis_valider_recommandation('rec-demo-fait-01')`, en(BOB))).toMatch(/owner\/approver/);
    expect(erreur(b, `select vis_rejeter_recommandation('rec-demo-fait-01', 'non pertinent')`, en(BOB))).toMatch(/droit de décision refusé/);
    expect(erreur(b, `select vis_rejeter_recommandation('rec-demo-fait-01', 'non pertinent')`, en(SERVICE))).toMatch(/identité de service/);
    expect(erreur(b, `select vis_valider_recommandation('rec-demo-fait-01')`, en(SERVICE))).toMatch(/identité de service/);
    expect(erreur(b, `select vis_rejeter_recommandation('rec-demo-fait-01', '')`, en(DEMO))).toMatch(/motif de rejet obligatoire/);
    expect(erreur(b, `select vis_rejeter_recommandation('rec-inconnue-01', 'motif')`, en(DEMO))).toMatch(/introuvable/);
    // Dans une transaction annulée, pour ne pas modifier la démonstration figée.
    const etat = b.sql(`begin; select vis_rejeter_recommandation('rec-demo-fait-01', 'non pertinent'); select etat || '|' || decide_par from vis_recommandations_v1 where id = 'rec-demo-fait-01'; rollback;`, en(DEMO));
    expect(etat.split("\n").pop()).toBe(`rejected|${DEMO}`);
    const valide = b.sql(`begin; select vis_valider_recommandation('rec-demo-fait-01', 'à faire'); select etat from vis_recommandations_v1 where id = 'rec-demo-fait-01'; rollback;`, en(DEMO));
    expect(valide.split("\n").pop()).toBe("accepted");
    expect(b.sql(`select etat from vis_recommandations_v1 where id = 'rec-demo-fait-01'`, en(DEMO))).toBe("pending");
  });

  it("mesure : J0 terminée, remesure « en cours, jour 2 sur 5 », changement de modèle signalé", () => {
    const m = json(`select json_object_agg(window_id, json_build_object('etat', etat, 'n', jours_mesures, 'sur', jours_prevus, 'chg', changement_modele, 'nj', reponses_non_jugees)) from vis_mesure_v1`, DEMO);
    expect(m["demo-j0"]).toEqual({ etat: "mesure_terminee", n: 5, sur: 5, chg: true, nj: 5 });
    expect(m["demo-remesure"]).toEqual({ etat: "mesure_en_cours", n: 2, sur: 5, chg: false, nj: 2 });
  });

  it("indicateurs : formule, dénominateur, intervalle, et « non mesurable » distinct de zéro", () => {
    const ligne = (w: string, mot: string, ind: string) =>
      json(`select to_json(a) from vis_apercu_v1 a where window_id = '${w}' and moteur = '${mot}' and indicateur = '${ind}'`, DEMO);
    // Présence, tous moteurs : réponses jugées qui citent la marque / réponses jugées.
    const p = ligne("demo-j0", "tous", "presence");
    const attendu = json(`select json_build_object('k', count(*) filter (where marque_citee), 'n', count(*) filter (where marque_citee is not null)) from vis_reponses_v1 where window_id = 'demo-j0'`, DEMO);
    expect([p.numerateur, p.denominateur]).toEqual([attendu.k, attendu.n]);
    expect(p.denominateur).toBe(145);
    expect(p.methode_intervalle).toBe("wilson_95");
    expect(p.borne_basse).toBeLessThan(p.valeur);
    expect(p.borne_haute).toBeGreaterThan(p.valeur);
    // Citation de la marque sans recherche web : non mesurable, et non pas 0.
    const c = ligne("demo-j0", "mistral", "citation_marque");
    expect(c).toMatchObject({ denominateur: 0, valeur: null, etat: "non_mesurable", raison_non_mesurable: "recherche_web_desactivee", borne_basse: null });
    // Petit échantillon : plage observée jour par jour.
    const r = ligne("demo-remesure", "claude", "presence");
    expect(r.denominateur).toBe(20);
    expect(r).toMatchObject({ methode_intervalle: "plage_observee", etat: "mesure_en_cours", jours_mesures: 2, jours_prevus: 5 });
    // La part de voix utilise toujours la plage observée (les mentions ne sont pas des tirages indépendants).
    expect(ligne("demo-j0", "tous", "part_de_voix").methode_intervalle).toBe("plage_observee");
    // Wilson, valeurs connues : 17 sur 50 → [0,2244 ; 0,4785].
    expect(b.sql("select vis_ui.wilson(17, 50, false) || ' ' || vis_ui.wilson(17, 50, true)")).toBe("0.2244 0.4785");
    expect(b.sql("select coalesce(vis_ui.wilson(0, 0, true)::text, 'null')")).toBe("null");
    // Un zéro mesuré reste un zéro : client B, une réponse jugée, aucun concurrent nommé.
    const zero = json(`select to_json(a) from vis_apercu_v1 a where window_id = 'b-j0' and moteur = 'tous' and indicateur = 'concurrent_a_la_place'`, BOB);
    expect(zero).toMatchObject({ numerateur: 0, denominateur: 1, valeur: 0, etat: "mesure", raison_non_mesurable: null });
  });

  it("citations et réseaux sociaux : catégories et dénominateur explicite", () => {
    const cat = json(`select json_object_agg(categorie, n) from (select categorie, sum(citations) n from vis_citations_v1 where window_id = 'demo-j0' group by categorie) t`, DEMO);
    expect(Object.keys(cat).sort()).toEqual(["autre", "marque", "reseau_social"]);
    const s = json(`select json_agg(json_build_object('p', plateforme, 'c', communaute, 'den', denominateur)) from vis_reseaux_sociaux_v1 where window_id = 'demo-j0'`, DEMO);
    expect(s.map((x: { p: string }) => x.p).sort()).toEqual(["reddit", "youtube"]);
    expect(s.find((x: { p: string }) => x.p === "reddit").c).toBe("r/materielfictif");
    const total = Number(b.sql(`select count(*) from vis_ui.base_citation where window_id = 'demo-j0'`, en(DEMO)));
    for (const x of s) expect(x.den).toBe(total);
  });

  it("chaque vue a exactement les colonnes du contrat, dans l'ordre", () => {
    const contrat = colonnesDuContrat();
    expect(Object.keys(contrat).sort()).toEqual([...VUES].sort());
    for (const v of VUES) {
      const cols = b.sql(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${v}'`);
      expect(cols.split(","), v).toEqual(contrat[v]);
    }
  });

  it("la démonstration figée (docs/interface/demo/visibility-demo.json) est à jour", () => {
    const demo: Record<string, unknown> = { _avertissement: "Données entièrement fictives (mandat v8, B3). Contrat Visibility version 1.", _membre: DEMO };
    for (const v of VUES) demo[v] = json(`select coalesce(json_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') from ${v} t`, DEMO);
    // Une ligne par enregistrement : fichier lisible et différences courtes.
    const texte = `{\n${Object.entries(demo)
      .map(([k, v]) => (Array.isArray(v) ? `"${k}": [\n${v.map((x) => `  ${JSON.stringify(x)}`).join(",\n")}\n]` : `"${k}": ${JSON.stringify(v)}`))
      .join(",\n")}\n}\n`;
    expect(JSON.parse(texte)).toEqual(demo);
    if (process.env.OIA_ECRIRE_DEMO === "1" || !existsSync(DEMO_JSON)) writeFileSync(DEMO_JSON, texte);
    expect(readFileSync(DEMO_JSON, "utf8")).toBe(texte);
    expect(texte).not.toMatch(/client-b/);
  });
});
