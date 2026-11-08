import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Migration 0009 (dépenses d'IA d'OIA, contrat de Lovable
 * prototypes/oia-prototype/CONTRAT_VIS_COUTS_V1.md) sur un Postgres jetable,
 * après la séquence exacte de production (0002 → … → 0008), puis tests
 * adverses. Données et comptes fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../supabase/migrations/${n}`);
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const CONTRAT = chemin("../../../prototypes/oia-prototype/CONTRAT_VIS_COUTS_V1.md");
const STUDIO = "00000000-0000-4000-8000-000000000001";
const AUTRE = "00000000-0000-4000-8000-0000000000b2";
const M1 = "11111111-aaaa-4000-8000-000000000001"; // propriétaire du studio (fictif)
const L = "dddddddd-aaaa-4000-8000-000000000004"; // lecteur du studio
const E = "eeeeeeee-aaaa-4000-8000-000000000005"; // éditeur du studio
const B = "bbbbbbbb-aaaa-4000-8000-000000000002"; // propriétaire d'un autre espace
const X = "99999999-aaaa-4000-8000-000000000009"; // compte connecté, membre de rien
const LECTURES = ["oia_ia_cout", "oia_ia_facture", "oia_ia_couts_v1", "oia_ia_factures_v1"];

let b: Banc;
const en = (uid: string) => ({ role: "authenticated", utilisateur: uid });
const anon = { role: "anon" };
const compte = (sql: string, uid: string) => Number(b.sql(sql, en(uid)));
const j = (sql: string, uid = M1) => JSON.parse(b.sql(sql, en(uid)) || "null");
const mois = "date_trunc('month', now() at time zone 'utc')::date";
const ligneCout = (espace: string, service: string, fournisseur: string | null, modele: string | null, extra = "") =>
  `insert into oia_ia_cout (espace_id, module, service, marque_id, mois, assistant, fournisseur, modele, voie_acces, suivi, nb_reponses, unite_volume,
     cout_estime_par_reponse_usd, cout_estime_mois_usd, plafond_mois_usd, plafond_perimetre, depense_budget_mois_usd, seuil_alerte_usd, alerte_budget, statut_comptage, source_cout${extra ? ", cout_retenu_mois_usd" : ""})
   values ('${espace}', 'visibility', '${service}', 'marque-fictive', ${mois}, ${modele ? `'${modele.split("-")[0]}'` : "null"}, ${fournisseur ? `'${fournisseur}'` : "null"}, ${modele ? `'${modele}'` : "null"},
     '${fournisseur === "openrouter" ? "openrouter" : modele ? "api_directe" : "toutes"}', true, 4, 'reponse', 0.05, 1.5, 30, 'elmo', 2.88, 24, false, 'compte', 'test fictif'${extra ? `, ${extra}` : ""});`;

/** Colonnes du contrat, dans l'ordre du tableau « Grain et identification ». */
function colonnesContrat(): string[] {
  return readFileSync(CONTRAT, "utf8").split("\n").map((l) => /^\| ([a-z_]+) \| [a-z ]+(nullable)? \|/.exec(l)?.[1]).filter((c): c is string => !!c);
}

describe.skipIf(!postgresDisponible)("0009 · dépenses d'IA d'OIA (Postgres jetable)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    b.sql(`insert into auth.users (id, email) values ('${M1}', 'premier@exemple.test');`);
    b.sql(`select set_config('oia.comptes_mickael', (select string_agg(email, ',') from auth.users), false);\n${readFileSync(MIG("0002a_comptes_de_mickael.sql"), "utf8")}`);
    for (const m of ["0003_membres_et_politiques.sql", "0003a_transition_console.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(MIG(m));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    for (const m of ["0006_visibility_vues.sql", "0007_shyrka.sql", "0008_money_lookup_v2.sql"]) b.fichier(MIG(m));
    b.fichier(MIG("0009_ia_couts.sql"));
    b.fichier(MIG("0009_ia_couts.sql")); // rejouable
    b.sql(`
      insert into auth.users (id, email) values ('${L}', 'lecteur@exemple.test'), ('${E}', 'editeur@exemple.test'), ('${B}', 'autre@exemple.test'), ('${X}', 'x@exemple.test');
      insert into oia_espace (id, nom) values ('${AUTRE}', 'autre fictif');
      insert into oia_membre (user_id, espace_id, role) values ('${L}', '${STUDIO}', 'lecteur'), ('${E}', '${STUDIO}', 'editeur'), ('${B}', '${AUTRE}', 'proprietaire');
      ${ligneCout(STUDIO, "elmo", "anthropic", "claude-sonnet-5-5")}
      ${ligneCout(STUDIO, "elmo", "openrouter", "google/gemini-3-flash-preview")}
      ${ligneCout(STUDIO, "elmo", "openrouter", "perplexity/sonar")}
      ${ligneCout(STUDIO, "elmo", null, null, "2.88")}
      ${ligneCout(AUTRE, "elmo", "openai", "gpt-6-luna")}
      insert into oia_ia_budget (mois, depense_usd, reserve_usd) values (${mois}, 1.2, 0.3);
      insert into oia_ia_appel (mois, service, statut, cout_max_usd, cout_usd, modele) values
        (${mois}, 'money-match', 'fait', 0.05, 0.02, 'mistral-small-latest'),
        (${mois}, 'money-match', 'fait', 0.05, 0.03, 'mistral-small-latest'),
        (${mois}, 'money-match', 'echoue', 0.05, 0.05, null),
        (${mois}, 'money-match', 'refuse', 0.05, null, null);
    `);
  });
  afterAll(() => b?.arreter());

  it("les colonnes de la vue sont exactement celles du contrat, dans son ordre", () => {
    const vue = b.sql("select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = 'oia_ia_couts_v1'").split(",");
    expect(vue).toEqual(colonnesContrat());
  });

  it("un compte membre de rien ne lit rien, anon non plus", () => {
    for (const t of LECTURES) {
      expect(compte(`select count(*) from ${t}`, X), t).toBe(0);
      expect(erreur(b, `select count(*) from ${t}`, anon), t).toMatch(/permission denied/);
    }
  });

  it("accès croisé : chaque espace ne voit que ses lignes ; le budget du studio reste au studio", () => {
    expect(j("select json_agg(distinct espace_id) from oia_ia_couts_v1", B)).toEqual([AUTRE]);
    expect(compte("select count(*) from oia_ia_couts_v1 where service in ('money-match', 'shyrka')", B)).toBe(0);
    expect(compte(`select count(*) from oia_ia_couts_v1 where espace_id = '${AUTRE}'`, M1)).toBe(0);
    expect(compte("select count(*) from oia_ia_couts_v1", L)).toBe(compte("select count(*) from oia_ia_couts_v1", M1));
  });

  it("aucune écriture directe, même pour un propriétaire ; anon n'appelle aucune fonction", () => {
    for (const q of [
      ligneCout(STUDIO, "intrus", "mistral", "mistral-large-4"),
      `insert into oia_ia_facture (espace_id, fournisseur, mois, montant_usd) values ('${STUDIO}', 'mistral', ${mois}, 1)`,
      "update oia_ia_cout set cout_retenu_mois_usd = 0",
      "delete from oia_ia_cout",
    ]) expect(erreur(b, q, en(M1)), q).toMatch(/permission denied/);
    expect(erreur(b, `select oia_ia_relever_facture('${STUDIO}', 'mistral', ${mois}, 1)`, anon)).toMatch(/permission denied/);
  });

  it("le relevé d'une facture est réservé aux propriétaires de l'espace", () => {
    for (const uid of [L, E, X, B]) expect(erreur(b, `select oia_ia_relever_facture('${STUDIO}', 'anthropic', ${mois}, 1)`, en(uid)), uid).toMatch(/réservé aux propriétaires/);
    expect(erreur(b, `select oia_ia_retirer_facture('${STUDIO}', 'anthropic', ${mois})`, en(L))).toMatch(/réservé aux propriétaires/);
    expect(compte("select count(*) from oia_ia_facture", M1)).toBe(0);
  });

  it("refus des relevés invalides : montant absent ou négatif, mois futur, fournisseur inconnu", () => {
    expect(erreur(b, `select oia_ia_relever_facture('${STUDIO}', 'anthropic', ${mois}, null)`, en(M1))).toMatch(/un relevé a un montant/);
    expect(erreur(b, `select oia_ia_relever_facture('${STUDIO}', 'anthropic', ${mois}, -1)`, en(M1))).toMatch(/négatif/);
    expect(erreur(b, `select oia_ia_relever_facture('${STUDIO}', 'anthropic', (${mois} + interval '1 month')::date, 1)`, en(M1))).toMatch(/futur/);
    expect(erreur(b, `select oia_ia_relever_facture('${STUDIO}', 'google', ${mois}, 1)`, en(M1))).toMatch(/fournisseur inconnu/);
  });

  it("non relevé = NULL ; zéro relevé = 0 ; retirer le relevé rend NULL ; tout est journalisé", () => {
    const facture = () => j("select json_agg(cout_facture_mois_usd) from oia_ia_couts_v1 where fournisseur = 'anthropic'");
    expect(facture()).toEqual([null]);
    b.sql(`select oia_ia_relever_facture('${STUDIO}', 'anthropic', ${mois}, 0, 'relevé fictif')`, en(M1));
    expect(facture()).toEqual([0]);
    expect(j("select json_agg(facture_relevee_le is not null) from oia_ia_couts_v1 where fournisseur = 'anthropic'")).toEqual([true]);
    b.sql(`select oia_ia_relever_facture('${STUDIO}', 'anthropic', ${mois}, 2.5)`, en(M1));
    expect(facture()).toEqual([2.5]);
    expect(b.sql(`select oia_ia_retirer_facture('${STUDIO}', 'anthropic', ${mois})`, en(M1))).toBe("t");
    expect(facture()).toEqual([null]);
    expect(j("select json_agg(action order by id) from oia_journal where cible = 'oia_ia_facture'")).toEqual(["relever_facture", "relever_facture", "retirer_facture"]);
  });

  it("une facture d'un fournisseur à plusieurs lignes n'est jamais répartie", () => {
    b.sql(`select oia_ia_relever_facture('${STUDIO}', 'openrouter', ${mois}, 1.7)`, en(M1));
    expect(j("select json_agg(cout_facture_mois_usd) from oia_ia_couts_v1 where fournisseur = 'openrouter'")).toEqual([null, null]);
    expect(j("select json_agg(json_build_object('m', montant_usd, 'a', attribuee)) from oia_ia_factures_v1 where fournisseur = 'openrouter'")).toEqual([{ m: 1.7, a: false }]);
    // La ligne agrégée du garde-fou (sans fournisseur) ne reçoit jamais une facture.
    expect(j("select json_agg(cout_facture_mois_usd) from oia_ia_couts_v1 where service = 'elmo' and fournisseur is null")).toEqual([null]);
  });

  it("money-match et shyrka sont lus dans le compteur de budget, plafond et dépense répétés à l'identique", () => {
    const r = j("select json_agg(json_build_object('s', service, 'm', modele, 'n', nb_appels, 'c', cout_retenu_mois_usd, 'p', plafond_mois_usd, 'd', depense_budget_mois_usd, 'r', reserve_budget_mois_usd, 'seuil', seuil_alerte_usd, 'a', alerte_budget, 'v', voie_acces) order by service, modele) from oia_ia_couts_v1 where service in ('money-match', 'shyrka')");
    expect(r).toEqual([
      { s: "money-match", m: "mistral-small-latest", n: 2, c: 0.05, p: 5, d: 1.2, r: 0.3, seuil: 4, a: false, v: "api_directe" },
      { s: "money-match", m: null, n: 0, c: 0.05, p: 5, d: 1.2, r: 0.3, seuil: 4, a: false, v: "toutes" },
      { s: "shyrka", m: null, n: 0, c: 0, p: 5, d: 1.2, r: 0.3, seuil: 4, a: false, v: "toutes" },
    ]);
    expect(j("select json_agg(distinct fournisseur) from oia_ia_couts_v1 where service = 'money-match' and modele is not null")).toEqual(["mistral"]);
  });

  it("le stockage refuse money-match et shyrka (pas de double comptage) et un doublon de grain, modèle NULL compris", () => {
    expect(erreur(b, ligneCout(STUDIO, "money-match", "mistral", "mistral-large-4"))).toMatch(/check constraint/);
    expect(erreur(b, ligneCout(STUDIO, "elmo", null, null, "1"))).toMatch(/oia_ia_cout_grain/);
    expect(erreur(b, ligneCout(STUDIO, "elmo", "mistral", "mistral-large-4").replace("'compte'", "'estime'"))).toMatch(/check constraint/);
  });
});
