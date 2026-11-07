import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * 0007 (mandat v9, blocs G et D) sur un Postgres jetable, après la séquence de
 * production : Shyrka réservée aux comptes de Mickaël, lignes privées par
 * compte, écritures par fonctions seulement, oubli, brouillons sans envoi,
 * compteur de dépense atomique. Comptes fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../supabase/migrations/${n}`);
const STUDIO = "00000000-0000-4000-8000-000000000001";
const M1 = "11111111-aaaa-4000-8000-000000000001";
const M2 = "11111111-aaaa-4000-8000-000000000002";
const LECTEUR = "33333333-aaaa-4000-8000-000000000003"; // membre lecteur du studio, pas Mickaël
const X = "99999999-aaaa-4000-8000-000000000009"; // compte connecté, membre de rien

let b: Banc;
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const TABLES = ["shy_conversation", "shy_message", "shy_contexte", "shy_oubli", "shy_brouillon", "shy_journal", "oia_ia_budget", "oia_ia_appel", "oia_ia_budget_v1"];

describe.skipIf(!postgresDisponible)("0007 · Shyrka et dépense IA (Postgres jetable)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    b.sql(`insert into auth.users (id, email) values ('${M1}', 'premier@exemple.test'), ('${M2}', 'second@exemple.test');`);
    b.sql(`select set_config('oia.comptes_mickael', 'premier@exemple.test,second@exemple.test', false);\n${readFileSync(MIG("0002a_comptes_de_mickael.sql"), "utf8")}`);
    for (const m of ["0003_membres_et_politiques.sql", "0003a_transition_console.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql", "0007_shyrka.sql"]) b.fichier(MIG(m));
    b.sql(`insert into auth.users (id, email) values ('${LECTEUR}', 'lecteur@exemple.test'), ('${X}', 'x@exemple.test');
           insert into oia_membre (user_id, espace_id, role) values ('${LECTEUR}', '${STUDIO}', 'lecteur');`);
  });
  afterAll(() => b?.arreter());

  it("un échange s'enregistre pour un compte de Mickaël, et lui seul le lit", () => {
    const conv = b.sql(`select shy_enregistrer_echange(null, 'Bonjour Shyrka', 'Salut. Rien de neuf côté J0.', '[{"vue":"vis_mesure_v1"}]')`, en(M1));
    expect(Number(b.sql(`select count(*) from shy_message where conversation_id = '${conv}'`, en(M1)))).toBe(2);
    expect(Number(b.sql(`select count(*) from shy_message`, en(M2)))).toBe(0); // l'autre compte de Mickaël ne lit pas ses conversations
    expect(b.sql(`select shy_enregistrer_echange('${conv}', 'Suite', 'Réponse')`, en(M1))).toBe(conv);
    expect(erreur(b, `select shy_enregistrer_echange('${conv}', 'Intrusion', 'x')`, en(M2))).toMatch(/conversation introuvable/);
  });

  it("refus : compte non autorisé, membre lecteur, anon ; aucune lecture", () => {
    for (const uid of [X, LECTEUR]) {
      expect(erreur(b, `select shy_enregistrer_echange(null, 'x', 'y')`, en(uid)), uid).toMatch(/réservée aux comptes de Mickaël/);
      expect(erreur(b, `select shy_creer_brouillon(null, 'message', 't', 'c')`, en(uid)), uid).toMatch(/réservée aux comptes de Mickaël/);
      expect(erreur(b, `select oia_ia_reserver('shyrka', 0.01, 100)`, en(uid)), uid).toMatch(/réservée/);
      for (const t of TABLES.slice(0, 6)) expect(Number(b.sql(`select count(*) from ${t}`, en(uid))), t).toBe(0);
    }
    for (const t of TABLES) expect(erreur(b, `select count(*) from ${t}`, { role: "anon" }), t).toMatch(/permission denied/);
    expect(erreur(b, `select shy_enregistrer_echange(null, 'x', 'y')`, { role: "anon" })).toMatch(/permission denied/);
  });

  it("aucune écriture directe, même pour Mickaël ; un brouillon reste un brouillon", () => {
    for (const s of [
      `insert into shy_message (conversation_id, user_id, role, contenu) select id, '${M1}', 'shyrka', 'x' from shy_conversation limit 1`,
      `insert into shy_brouillon (user_id, type, titre, contenu) values ('${M1}', 'message', 't', 'c')`,
      `update shy_brouillon set statut = 'envoye'`,
      `delete from shy_journal`,
      `update oia_ia_budget set plafond_usd = 1000`,
      `insert into oia_ia_appel (mois, service, statut) values ('2026-11-01', 'shyrka', 'fait')`,
    ]) expect(erreur(b, s, en(M1)), s).toMatch(/permission denied/);
    const id = b.sql(`select shy_creer_brouillon(null, 'message', 'Relance', 'Bonjour, …')`, en(M1));
    expect(b.sql(`select statut from shy_brouillon where id = '${id}'`, en(M1))).toBe("brouillon");
    expect(erreur(b, `insert into shy_brouillon (user_id, type, titre, contenu, statut) values ('${M1}', 'message', 't', 'c', 'envoye')`)).toMatch(/check/);
    expect(b.sql(`select quoi || ':' || resultat from shy_journal where cible = '${id}'`, en(M1))).toBe("brouillon.cree:autorise");
  });

  it("oubli : contenu supprimé, empreinte gardée, journal sans identifiant, contexte oublié refusé ensuite", () => {
    const ctx = b.sql(`select shy_ajouter_contexte('preference', 'Réponses courtes le matin', 'conversation')`, en(M1));
    expect(b.sql(`select shy_oublier('contexte', '${ctx}')`, en(M1))).toBe("1");
    expect(Number(b.sql(`select count(*) from shy_contexte`, en(M1)))).toBe(0);
    expect(Number(b.sql(`select count(*) from shy_journal where cible = '${ctx}'`, en(M1)))).toBe(0);
    expect(erreur(b, `select shy_ajouter_contexte('preference', 'Réponses courtes le matin', 'conversation')`, en(M1))).toMatch(/a été oublié/);
    const conv = b.sql(`select id from shy_conversation limit 1`, en(M1));
    b.sql(`select shy_oublier('conversation', '${conv}')`, en(M1));
    expect(Number(b.sql(`select count(*) from shy_message`, en(M1)))).toBe(0);
    expect(b.sql(`select count(*) from shy_oubli where empreinte = encode(sha256(convert_to('${conv}', 'UTF8')), 'hex')`)).toBe("1");
  });

  it("dépense : réservation, régularisation, journal sans texte, alerte à 4 $", () => {
    const id = b.sql(`select oia_ia_reserver('shyrka', 0.02, 1200)`, en(M1));
    expect(Number(id)).toBeGreaterThan(0);
    expect(b.sql(`select reserve_usd from oia_ia_budget`)).toBe("0.020000");
    const r = JSON.parse(b.sql(`select oia_ia_regler(${id}, true, 0.004, 1100, 150, '{lire_visibility}', null, 'mistral-large-latest')`, en(M1)));
    expect(r).toMatchObject({ alerte: false });
    expect(b.sql(`select reserve_usd || '|' || depense_usd from oia_ia_budget`)).toBe("0.000000|0.004000");
    expect(erreur(b, `select oia_ia_regler(${id}, true, 0.004, 1, 1)`, en(M1))).toMatch(/introuvable/); // une seule fois
    expect(erreur(b, `select oia_ia_reserver('shyrka', 0.01, 4001)`, en(M1))).toMatch(/trop longue/);
    expect(erreur(b, `select oia_ia_reserver('money-match', 0.01, 2001)`, en(M1))).toMatch(/trop longue/);
    // Le journal des appels n'a aucune colonne de texte libre de conversation.
    expect(b.sql(`select string_agg(column_name, ',' order by column_name) from information_schema.columns where table_name = 'oia_ia_appel' and data_type = 'text'`))
      .toBe("modele,motif,service,statut");
    b.sql(`update oia_ia_budget set depense_usd = 4.1`);
    const id2 = b.sql(`select oia_ia_reserver('money-match', 0.01, 500)`, en(LECTEUR)); // la recherche assistée est ouverte aux membres
    expect(JSON.parse(b.sql(`select oia_ia_regler(${id2}, true, 0.001, 400, 50, '{}', 12, 'mistral-large-latest')`, en(LECTEUR)))).toMatchObject({ alerte: true });
  });

  it("plafond : refus avant l'appel, consigné ; deux appels simultanés à la limite n'en laissent passer qu'un", async () => {
    b.sql(`update oia_ia_budget set depense_usd = 4.99, reserve_usd = 0`);
    expect(b.sql(`select oia_ia_reserver('shyrka', 0.02, 100)`, en(M1))).toBe("-2");
    expect(b.sql(`select motif from oia_ia_appel order by id desc limit 1`)).toBe("plafond_mensuel");
    // Reste 0,01 $ : deux réservations de 0,008 $ lancées en même temps. La première garde son
    // verrou une seconde ; la seconde attend, puis voit la réservation et est refusée.
    const a = b.sqlAsync(`begin; select oia_ia_reserver('shyrka', 0.008, 100); select pg_sleep(1); commit;`, en(M1));
    await new Promise((r) => setTimeout(r, 200));
    const c = b.sqlAsync(`select oia_ia_reserver('shyrka', 0.008, 100);`, en(M2));
    const [ra, rc] = await Promise.all([a, c]);
    const ids = [ra.split("\n").find((l) => /^-?\d+$/.test(l)), rc].map(Number);
    expect(ids.filter((n) => n > 0)).toHaveLength(1);
    expect(ids.filter((n) => n === -2)).toHaveLength(1);
    expect(b.sql(`select reserve_usd from oia_ia_budget`)).toBe("0.008000");
  });

  it("limite quotidienne : 100 messages de Shyrka par jour et par compte", () => {
    b.sql(`update oia_ia_budget set depense_usd = 0, reserve_usd = 0;
           insert into oia_ia_appel (mois, service, user_id, statut, cout_max_usd)
           select date_trunc('month', now())::date, 'shyrka', '${M2}', 'fait', 0 from generate_series(1, 100);`);
    expect(b.sql(`select oia_ia_reserver('shyrka', 0.01, 100)`, en(M2))).toBe("-1");
    expect(Number(b.sql(`select oia_ia_reserver('shyrka', 0.01, 100)`, en(M1)))).toBeGreaterThan(0);
  });
});
