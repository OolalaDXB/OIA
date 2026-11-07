import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Migrations 0003 à 0005 sur un Postgres jetable (mandat v8, règle 2) :
 * état déployé (0002), puis migrations nouvelles, puis tests adverses.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const STUDIO = "00000000-0000-4000-8000-000000000001";
const AUTRE = "00000000-0000-4000-8000-0000000000b2";
const A = "aaaaaaaa-0000-4000-8000-000000000001"; // éditeur du studio
const B = "bbbbbbbb-0000-4000-8000-000000000002"; // éditeur de l'autre espace
const X = "cccccccc-0000-4000-8000-000000000003"; // compte connecté, membre de rien (autre produit)
const L = "dddddddd-0000-4000-8000-000000000004"; // lecteur du studio
const A2 = "eeeeeeee-0000-4000-8000-000000000005"; // second éditeur du studio

const VUES = ["ml_toutes_v1", "ml_financements_v1", "ml_appels_offres_v1", "ml_investisseurs_v1", "ml_signals_v1", "ml_aujourdhui_v1", "ml_montants_v1", "ml_fiche_v1", "ml_decision_v1"];
const TABLES = ["watch_opportunities", "watch_events", "watch_runs", "alerts", "reviews", "project_tags", "notes", "tasks", "contacts", "saved_views", "requests", "project_drafts", "link_checks", "ml_montant", "ml_lot", "oia_journal", "oia_import"];

let b: Banc;
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const compte = (sql: string, uid: string) => Number(b.sql(sql, en(uid)));

describe.skipIf(!postgresDisponible)("migrations OIA 0003 à 0005 (Postgres jetable)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(chemin("../supabase/migrations/0002_watch_and_workspace.sql"));
    // L'état déployé contient déjà une opportunité, créée avant les espaces.
    b.sql(`insert into watch_opportunities (watch_key, record_id, title, issuer, recommendation, verification_status, payload, content_fingerprint)
           values ('deja-la', 'rec-deja-la', 'Opportunité déjà en base', 'Émetteur', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f0');`);
    for (const m of ["0003_membres_et_politiques.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(chemin(`../supabase/migrations/${m}`));
    b.sql(`
      insert into oia_espace (id, nom) values ('${AUTRE}', 'autre');
      insert into oia_membre (user_id, espace_id, role) values
        ('${A}', '${STUDIO}', 'editeur'), ('${A2}', '${STUDIO}', 'editeur'), ('${L}', '${STUDIO}', 'lecteur'), ('${B}', '${AUTRE}', 'editeur');
      insert into watch_opportunities (id, watch_key, record_id, title, issuer, opportunity_kind, recommendation, verification_status, payload, content_fingerprint, espace_id, deadline_at)
      values ('11111111-0000-4000-8000-000000000001', 'k-a1', 'rec-a1', 'Subvention A', 'Région', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f1', '${STUDIO}', now() + interval '5 days'),
             ('11111111-0000-4000-8000-000000000002', 'k-a2', 'rec-a2', 'Appel d''offres A', 'Ville', 'TENDER_RFP', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f2', '${STUDIO}', null),
             ('11111111-0000-4000-8000-000000000003', 'k-a3', 'rec-a3', 'Fonds A', 'VC', 'VC_INVESTOR', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f3', '${STUDIO}', null),
             ('22222222-0000-4000-8000-000000000001', 'k-b1', 'rec-b1', 'Subvention B', 'État', 'GRANT', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f4', '${AUTRE}', now() + interval '3 days');
      insert into ml_montant (opportunity_id, espace_id, valeur, devise, confiance) values
        ('11111111-0000-4000-8000-000000000001', '${STUDIO}', 50000, 'EUR', 'HAUTE'),
        ('11111111-0000-4000-8000-000000000002', '${STUDIO}', 120000, 'EUR', 'BASSE'),
        ('22222222-0000-4000-8000-000000000001', '${AUTRE}', 999, 'EUR', 'HAUTE');
      insert into alerts (kind, headline, dedup_hash, espace_id) select (enum_range(null::alert_kind))[1], 'Alerte B', 'h-b', '${AUTRE}';
    `);
  });
  afterAll(() => b?.arreter());

  it("l'état déployé est conservé : la ligne existante rejoint le studio", () => {
    expect(b.sql(`select espace_id from watch_opportunities where watch_key = 'deja-la'`)).toBe(STUDIO);
  });

  it("un compte connecté qui n'est membre de rien ne lit rien, table par table et vue par vue", () => {
    for (const t of [...TABLES, ...VUES]) expect(compte(`select count(*) from ${t}`, X), t).toBe(0);
  });

  it("anon ne lit rien et n'écrit rien", () => {
    for (const t of ["watch_opportunities", "tasks", "notes", "ml_toutes_v1"]) expect(erreur(b, `select count(*) from ${t}`, { role: "anon" }), t).toMatch(/permission denied/);
    expect(erreur(b, `insert into tasks (title, actor) values ('x', 'x')`, { role: "anon" })).toMatch(/permission denied/);
  });

  it("accès croisé : chaque vue ne montre que l'espace de l'appelant", () => {
    for (const v of VUES) {
      expect(compte(`select count(*) from ${v} where espace_id = '${AUTRE}'`, A), `${v} vu par A`).toBe(0);
      expect(compte(`select count(*) from ${v} where espace_id = '${STUDIO}'`, B), `${v} vu par B`).toBe(0);
    }
    expect(compte(`select count(*) from ml_toutes_v1`, A)).toBe(4);
    expect(compte(`select count(*) from ml_toutes_v1`, B)).toBe(1);
    expect(compte(`select count(*) from ml_signals_v1`, A)).toBe(0);
    expect(compte(`select count(*) from ml_signals_v1`, B)).toBe(1);
  });

  it("aucune écriture directe dans les tables, même pour un éditeur", () => {
    for (const q of [
      `insert into tasks (title, actor, espace_id) values ('x', 'x', '${STUDIO}')`,
      `insert into reviews (record_id, action, actor, gate_pursue_eligible_at_decision) values ('rec-a1', 'APPROVE', 'x', true)`,
      `update watch_opportunities set title = 'piraté'`,
      `delete from watch_opportunities`,
      `insert into oia_membre (user_id, espace_id, role) values ('${A}', '${AUTRE}', 'proprietaire')`,
      `update oia_membre set role = 'proprietaire' where user_id = '${A}'`,
      `insert into ml_montant (opportunity_id, espace_id, valeur, devise) values ('11111111-0000-4000-8000-000000000003', '${STUDIO}', 1, 'EUR')`,
    ]) expect(erreur(b, q, en(A)), q).toMatch(/permission denied/);
  });

  it("les fonctions vérifient l'appartenance : un éditeur n'écrit pas chez les autres, un lecteur n'écrit pas", () => {
    expect(erreur(b, `select oia_noter('${AUTRE}', 'intrusion')`, en(A))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_noter('${STUDIO}', 'intrusion')`, en(X))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_noter('${STUDIO}', 'lecture seule')`, en(L))).toMatch(/droit d'écriture refusé/);
    expect(erreur(b, `select oia_noter('${STUDIO}', 'sans identité')`, { role: "authenticated" })).toMatch(/identité requise/);
  });

  it("une décision est attribuée à l'appelant, ajoutée seulement, et personne ne modifie celle d'un autre", () => {
    b.sql(`select oia_decider('${STUDIO}', 'rec-a1', 'APPROVE', 'ok', true)`, en(A));
    expect(b.sql(`select actor from reviews where record_id = 'rec-a1'`, en(A))).toBe(A);
    expect(erreur(b, `update reviews set action = 'REJECT' where record_id = 'rec-a1'`, en(A2))).toMatch(/permission denied/);
    expect(erreur(b, `delete from reviews where record_id = 'rec-a1'`, en(A2))).toMatch(/permission denied/);
    expect(erreur(b, `select oia_decider('${STUDIO}', 'rec-a1', 'PROMOTE', '', true)`, en(A))).toMatch(/action inconnue/);
    expect(b.sql(`select decision_humaine from ml_toutes_v1 where record_id = 'rec-a1'`, en(L))).toBe("APPROVE");
  });

  it("on ne modifie que ses propres notes et tâches", () => {
    const note = b.sql(`select oia_noter('${STUDIO}', 'ma note', 'rec-a1')`, en(A));
    expect(erreur(b, `select oia_modifier_note('${note}', 'réécrite par un autre')`, en(A2))).toMatch(/propres notes/);
    b.sql(`select oia_modifier_note('${note}', 'corrigée')`, en(A));
    const tache = b.sql(`select oia_creer_tache('${STUDIO}', 'relancer', current_date - 1, 'rec-a1')`, en(A));
    expect(erreur(b, `select oia_basculer_tache('${tache}')`, en(A2))).toMatch(/propres tâches/);
    expect(compte(`select count(*) from ml_aujourdhui_v1 where raison = 'TACHE_EN_RETARD'`, A)).toBe(1);
    expect(b.sql(`select oia_basculer_tache('${tache}')`, en(A))).toBe("DONE");
  });

  it("chaque écriture est journalisée", () => {
    expect(compte(`select count(*) from oia_journal where action in ('decider', 'noter', 'modifier', 'creer', 'basculer')`, A)).toBeGreaterThanOrEqual(5);
    expect(compte(`select count(*) from oia_journal`, B)).toBe(0);
  });

  it("typologie financière : catégorie par nature, montant inconnu jamais zéro", () => {
    const lignes = b.sql(`select record_id || '|' || categorie || '|' || coalesce(montant::text, 'inconnu') from ml_toutes_v1 order by record_id`, en(A)).split("\n");
    expect(lignes).toEqual(["rec-a1|subvention|50000", "rec-a2|chiffre_affaires_contractuel_potentiel|120000", "rec-a3|investissement_capital|inconnu", "rec-deja-la|subvention|inconnu"]);
    expect(erreur(b, `insert into ml_montant (opportunity_id, espace_id, valeur, devise) values ('11111111-0000-4000-8000-000000000003', '${STUDIO}', 0, 'EUR')`)).toMatch(/check constraint/);
    expect(erreur(b, `insert into ml_montant (opportunity_id, espace_id, valeur) values ('11111111-0000-4000-8000-000000000003', '${STUDIO}', 10)`)).toMatch(/check constraint/);
  });

  it("aucun total global : chaque ligne de Montants porte une seule catégorie et une seule devise", () => {
    const lignes = b.sql(`select categorie || '|' || coalesce(devise, '-') || '|' || coalesce(somme_connue::text, '-') from ml_montants_v1 order by 1`, en(A)).split("\n");
    expect(lignes).toEqual(["chiffre_affaires_contractuel_potentiel|EUR|120000", "investissement_capital|-|-", "subvention|-|-", "subvention|EUR|50000"]);
    expect(b.sql(`select count(*) from (select espace_id, categorie, sens, devise, verifie_par_humain from ml_montants_v1 group by 1,2,3,4,5 having count(*) > 1) d`, en(A))).toBe("0");
  });

  it("vues en security_invoker", () => {
    for (const v of VUES) expect(b.sql(`select coalesce((select option_value from pg_options_to_table(reloptions) where option_name = 'security_invoker'), 'non') from pg_class where relname = '${v}'`), v).toBe("true");
  });

  describe("reprise du travail du navigateur (A4)", () => {
    const sauvegarde = JSON.stringify({
      kind: "oia.workspace.backup",
      version: 1,
      exportedAt: "2026-11-08T08:00:00Z",
      driver: "localStorage",
      data: {
        "oia.audit.v1": [{ id: "audit-x-1", recordId: "rec-a2", action: "REJECT", comment: "trop loin", at: "2026-11-01T10:00:00Z", actor: "Mickaël", gatePursueEligibleAtDecision: false }],
        "oia.notes.v1": [{ id: "notes-x-1", at: "2026-11-02T10:00:00Z", actor: "Mickaël", text: "Note fictive", recordId: "rec-a2" }],
        "oia.tasks.v1": [{ id: "tasks-x-1", at: "2026-11-02T10:00:00Z", actor: "Mickaël", title: "Tâche fictive", status: "OPEN", due: "2026-11-20" }],
        "oia.contacts.v1": [{ id: "contacts-x-1", at: "2026-11-02T10:00:00Z", actor: "Mickaël", name: "Contact fictif", organisation: "Exemple" }],
        "oia.views.v1": [{ id: "views-x-1", name: "Vue fictive", kind: "OPPORTUNITY", filters: { kind: "GRANT" }, sortField: "pubDate", sortDirection: "desc", createdAt: "2026-11-02T10:00:00Z" }],
        "oia.tags.v1": { "rec-a2": "projet-fictif", "rec-a1": "" },
      },
    }).replace(/'/g, "''");

    it("importe sans perte, rejoue sans doublon, s'annule exactement", () => {
      const bilan = JSON.parse(b.sql(`select oia_importer_sauvegarde('${STUDIO}', '${sauvegarde}'::jsonb)`, en(A)));
      expect(bilan).toMatchObject({ decisions: 1, notes: 1, taches: 1, contacts: 1, vues: 1, etiquettes: 1 });
      expect(b.sql(`select comment || '|' || auteur_origine || '|' || at from reviews where id_origine = 'audit-x-1'`, en(A))).toBe("trop loin|Mickaël|2026-11-01 10:00:00+00");
      const encore = JSON.parse(b.sql(`select oia_importer_sauvegarde('${STUDIO}', '${sauvegarde}'::jsonb)`, en(A)));
      expect(encore).toMatchObject({ decisions: 0, notes: 0, taches: 0, contacts: 0, vues: 0, etiquettes: 0 });
      expect(compte(`select count(*) from notes where id_origine = 'notes-x-1'`, A)).toBe(1);
      expect(erreur(b, `select oia_annuler_import('${bilan.import_id}')`, en(A2))).toMatch(/auteur de l'import/);
      const annule = JSON.parse(b.sql(`select oia_annuler_import('${bilan.import_id}')`, en(A)));
      expect(annule).toMatchObject({ decisions: 1, notes: 1, taches: 1, contacts: 1, vues: 1, etiquettes: 1 });
      expect(compte(`select count(*) from notes where id_origine = 'notes-x-1'`, A)).toBe(0);
      expect(compte(`select count(*) from notes where text = 'corrigée'`, A)).toBe(1); // le reste est intact
    });

    it("refuse un fichier inconnu, un lecteur et un autre espace", () => {
      expect(erreur(b, `select oia_importer_sauvegarde('${STUDIO}', '{"kind":"autre","version":1,"data":{}}'::jsonb)`, en(A))).toMatch(/non reconnu/);
      expect(erreur(b, `select oia_importer_sauvegarde('${STUDIO}', '${sauvegarde}'::jsonb)`, en(L))).toMatch(/droit d'écriture refusé/);
      expect(erreur(b, `select oia_importer_sauvegarde('${STUDIO}', '${sauvegarde}'::jsonb)`, en(B))).toMatch(/droit d'écriture refusé/);
    });

    it("un import qui échoue en cours de route ne laisse rien (transaction)", () => {
      const casse = sauvegarde.replace('"due":"2026-11-20"', '"due":"pas-une-date"');
      expect(erreur(b, `select oia_importer_sauvegarde('${STUDIO}', '${casse}'::jsonb)`, en(A))).toMatch(/invalid input syntax/);
      expect(compte(`select count(*) from reviews where id_origine = 'audit-x-1'`, A)).toBe(0);
    });
  });
});

describe.skipIf(!postgresDisponible)("témoin : l'état déployé seul (0002) laisse passer un compte non membre", () => {
  let t: Banc;
  beforeAll(() => {
    t = demarrer();
    t.fichier(chemin("./pg/supabase-emulation.sql"));
    t.fichier(chemin("../supabase/migrations/0002_watch_and_workspace.sql"));
    t.sql(`insert into watch_opportunities (watch_key, record_id, title, issuer, recommendation, verification_status, payload, content_fingerprint)
           values ('k', 'r', 't', 'i', 'INVESTIGATE', 'UNVERIFIED', '{}', 'f');`);
  });
  afterAll(() => t?.arreter());

  it("sans 0003, un compte d'un autre produit lit les opportunités et écrit des tâches (défaut constaté en A0)", () => {
    expect(Number(t.sql(`select count(*) from watch_opportunities`, { role: "authenticated", utilisateur: X }))).toBe(1);
    expect(erreur(t, `insert into tasks (title, actor) values ('écrit par un inconnu', 'quelqu''un')`, { role: "authenticated", utilisateur: X })).toBeNull();
  });
});
