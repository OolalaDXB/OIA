import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, ecrireTemp, erreur, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Mandat v16, bloc A : contrat Visibility v2 (pilotage depuis le cockpit), vis
 * 0006_pilotage puis 0011_visibility_pilotage, après 0010, sur un Postgres jetable.
 * Clients, sites et montants fictifs. Tests adverses, colonnes du contrat, démonstration.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const SUPA = (n: string) => chemin(`../supabase/migrations/${n}.sql`);
const V0006 = VIS("0006_pilotage");
const M0011 = SUPA("0011_visibility_pilotage");
const CONTRAT = chemin("../../../docs/interface/contrat-donnees-visibility-v2.md");
const DEMO_SQL = chemin("../demo/visibility-v2-demo.sql");
const DEMO_JSON = chemin("../../../docs/interface/demo/visibility-v2-demo.json");

const MICKAEL = "00000000-0000-4000-8000-0000000000a1"; // owner du client technique oia
const APPROVER = "00000000-0000-4000-8000-0000000000a2";
const VIEWER = "00000000-0000-4000-8000-0000000000a3";
const AUTRE = "00000000-0000-4000-8000-0000000000a4"; // owner d'un autre client
const SERVICE = "00000000-0000-4000-8000-0000000000a5"; // identité de service, membre owner (pour le test)
const MOTEUR = "00000000-0000-4000-8000-0000000000a6"; // identité de service du moteur

export const VUES_V2 = [
  "vis_portefeuille_v2", "vis_demandes_v2", "vis_propositions_v2", "vis_fenetres_v2", "vis_budget_v2", "vis_alertes_v2", "vis_moteur_v2",
  "vis_pages_client_v2", "vis_mesure_v2", "vis_comparaisons_v2", "vis_comparaison_moteurs_v2", "vis_recommandations_v2",
  "vis_jugements_v2", "vis_jugements_moteurs_v2", "vis_reponses_sources_v2", "vis_couts_moteurs_v2",
];
const V1 = "select string_agg(viewname || ':' || md5(definition), ',' order by viewname) from pg_views where schemaname = 'public' and (viewname like 'vis\\_%\\_v1' or viewname in ('vis_mesure_v2','vis_comparaisons_v2','vis_comparaison_moteurs_v2','vis_recommandations_v2'))";

const humain = (u: string) => ({ role: "authenticated", utilisateur: u });
/** Le moteur : connexion postgres, `set role service_role`, sans identité (comme ~/.oia/bin/oia-psql). */
const moteur = (u?: string) => (u ? { role: "service_role", utilisateur: u } : { role: "service_role" });

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

function retourArriere(fichier: string): string {
  const lignes = readFileSync(fichier, "utf8").split("\n");
  const debut = lignes.findIndex((l) => /^-- Retour arrière/.test(l));
  const corps: string[] = [];
  for (const l of lignes.slice(debut + 1)) {
    if (!l.startsWith("--")) break;
    if (l.startsWith("--   ")) corps.push(l.slice(5));
  }
  return corps.join("\n");
}

function installer(): { b: Banc; v1: string } {
  const b = demarrer();
  b.fichier(chemin("./pg/supabase-emulation.sql"));
  for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity", "0005_evidence_non_mesuree"]) b.fichier(VIS(v));
  b.fichier(SUPA("0006_visibility_vues"));
  b.fichier(SUPA("0010_visibility_vues_v2"));
  const v1 = b.sql(V1);
  b.fichier(V0006);
  b.fichier(M0011);
  b.sql(`insert into vis.client (id, display_name, ownership, status, default_repo_action_mode) values ('oia', 'OIA', 'internal', 'active', 'lecture'), ('autre-client', 'Autre client', 'external', 'active', 'lecture');
         insert into vis.client_member (user_id, client_id, role) values ('${MICKAEL}', 'oia', 'owner'), ('${AUTRE}', 'autre-client', 'owner'), ('${SERVICE}', 'oia', 'owner');
         insert into vis.service_identity (user_id, name) values ('${SERVICE}', 'service'), ('${MOTEUR}', 'moteur');`);
  return { b, v1 };
}

/** Code SQLSTATE d'un appel refusé (null s'il passe). */
function code(b: Banc, q: string, opts?: { role?: string; utilisateur?: string }): string | null {
  const e = erreur(b, `\\set VERBOSITY verbose\n${q}`, opts);
  return e === null ? null : (/ERROR:\s+([0-9A-Z]{5}):/.exec(e)?.[1] ?? e);
}

describe.skipIf(!postgresDisponible)("contrat Visibility v2 : pilotage (vis 0006_pilotage + 0011)", () => {
  let b: Banc;
  let v1: string;
  const SITE = "site-fictif-example";
  const RECO = `${SITE}-reco`;
  const J0 = `${SITE}-j0`;
  const J1 = `${SITE}-j1`;
  const q = (sql: string, u: string) => b.sql(sql, humain(u));
  const c = (sql: string, u: string) => code(b, sql, humain(u));
  const m = (sql: string) => b.sql(sql, moteur());
  const etape = (u = MICKAEL) => q(`select etape || '|' || qui from vis_portefeuille_v2 where subject_id = '${SITE}'`, u);
  const prendre = () => JSON.parse(m("select vis_moteur_prendre('mac-test')") || "null") as { id: string; type: string; statut: string } | null;
  const proposer = (local: string, nature: string, contenu: object, source = "https://site-fictif.example/") =>
    m(`select vis_moteur_proposer('${SITE}', '${SITE}:${nature}:${local}', '${nature}', '${JSON.stringify(contenu).replace(/'/g, "''")}', '${source}')`);
  const question = (texte: string, langue: string, marquee: boolean) => ({ texte, langue, marquee, famille: marquee ? "branded" : "unbranded", moteurs: ["chatgpt"] });

  beforeAll(() => {
    ({ b, v1 } = installer());
    // Le moteur signe sa présence : sans signe, il est « muet » et tout site en attente est « bloque ».
    b.sql("select vis_moteur_signe('mac-test', 'abc1234', now() + interval '5 minutes')", moteur());
  });
  afterAll(() => b?.arreter());

  it("les vues v1 et celles de 0010 sont inchangées", () => {
    expect(b.sql(V1)).toBe(v1);
  });

  it("chaque vue v2 a exactement les colonnes du contrat, dans l'ordre", () => {
    const contrat = colonnesDuContrat();
    expect(Object.keys(contrat).sort()).toEqual([...VUES_V2].sort());
    for (const v of VUES_V2) {
      const cols = b.sql(`select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${v}'`);
      expect(cols.split(","), v).toEqual(contrat[v]);
    }
  });

  it("plafonds : owner d'OIA seulement, global d'abord, jamais au-dessus du global", () => {
    expect(c("select vis_fixer_plafond(null, 100)", AUTRE)).toBe("42501");
    expect(c("select vis_fixer_plafond(null, 100)", SERVICE)).toBe("42501");
    expect(code(b, "select vis_fixer_plafond(null, 100)", { role: "anon" })).toBe("42501");
    expect(c("select vis_fixer_plafond('autre-client', 10)", MICKAEL)).toBe("55000");
    expect(c("select vis_fixer_plafond(null, -1)", MICKAEL)).toBe("22023");
    expect(c("select vis_fixer_plafond(null, 100)", MICKAEL)).toBeNull();
    expect(c("select vis_fixer_plafond('autre-client', 150)", MICKAEL)).toBe("22023");
    expect(c("select vis_fixer_plafond('inconnu', 10)", MICKAEL)).toBe("P0002");
  });

  it("demander un site : nouveau client par l'owner d'OIA, idempotent, visible en file", () => {
    const appel = `select vis_demander_site('https://site-fictif.example', 'Site fictif', array['fr','en'], array['FR'], null, 'Client fictif')`;
    expect(c(appel, AUTRE)).toBe("42501");
    expect(c(appel, SERVICE)).toBe("42501");
    expect(code(b, appel, { role: "anon" })).toBe("42501");
    expect(c(`select vis_demander_site('http://site-fictif.example', 'Site fictif', array['fr'], array['FR'], null, 'Client fictif')`, MICKAEL)).toBe("22023");
    expect(c(`select vis_demander_site('https://site-fictif.example', 'Site fictif', array['FRA'], array['FR'], null, 'Client fictif')`, MICKAEL)).toBe("22023");
    expect(c(`select vis_demander_site('https://site-fictif.example', 'Site fictif', array['fr'], array['FR'], 'inconnu')`, MICKAEL)).toBe("P0002");
    const d = q(appel, MICKAEL);
    expect(q(appel, MICKAEL)).toBe(d);
    expect(q("select count(*) from vis.demande", MICKAEL)).toBe("1");
    b.sql(`insert into vis.client_member (user_id, client_id, role) values ('${APPROVER}', 'client-fictif', 'approver'), ('${VIEWER}', 'client-fictif', 'viewer'), ('${SERVICE}', 'client-fictif', 'owner')`);
    expect(q(`select type || '|' || statut || '|' || demande_par || '|' || subject_id from vis_demandes_v2`, VIEWER)).toBe(`SITE_ADD|QUEUED|${MICKAEL}|${SITE}`);
    expect(q(`select client_nom || '|' || site_url || '|' || nom || '|' || langues::text || '|' || mon_role from vis_portefeuille_v2`, VIEWER)).toBe(
      "Client fictif|https://site-fictif.example|Site fictif|{fr,en}|viewer",
    );
    expect(etape()).toBe("demande|moteur");
    expect(c(`select vis_demander_site('https://site-fictif.example', 'Site fictif', array['fr'], array['FR'], null, 'Client fictif')`, MICKAEL)).toBe("22023");
    expect(c(`select vis_demander_site('https://autre-site.example', 'Autre site', array['fr'], array['FR'], 'client-fictif')`, VIEWER)).toBe("42501");
    expect(q(`select vis_demander_site('https://autre-site.example', 'Autre site', array['fr'], array['FR'], 'client-fictif') is not null`, APPROVER)).toBe("t");
    expect(q(`select subject_id || '|' || (charge ->> 'client_nom') from vis_demandes_v2 where charge ->> 'url' = 'https://autre-site.example'`, APPROVER)).toBe("autre-site-example|Client fictif");
  });

  it("le moteur seul prend et termine ; un humain, même avec le rôle du moteur, est refusé", () => {
    expect(c("select vis_moteur_prendre('mac-test')", MICKAEL)).toBe("42501");
    expect(code(b, "select vis_moteur_prendre('mac-test')", moteur(MICKAEL))).toBe("42501");
    expect(code(b, "select vis_moteur_prendre('mac-test')", { role: "anon" })).toBe("42501");
    // postgres sans « set role service_role » : refusé ; avec, accepté (vérifié par toutes les prises ci-dessous).
    expect(code(b, "select vis_moteur_signe('mac-test', 'abc1234', null)")).toBe("42501");
    expect(code(b, "select vis_moteur_signe('mac-test', 'abc1234', null)", moteur(MOTEUR))).toBeNull();
    // Un geste humain par service_role est refusé, même avec l'identité d'un humain.
    expect(code(b, `select vis_valider_faits('${SITE}', array['x'])`, moteur(MICKAEL))).toBe("42501");
    expect(code(b, "select vis_fixer_plafond(null, 100)", moteur())).toBe("42501");
    const d = prendre()!;
    expect([d.type, d.statut]).toEqual(["SITE_ADD", "RUNNING"]);
    expect(etape()).toBe("audit_en_cours|moteur");
    const autre = prendre()!;
    expect(code(b, `select vis_moteur_terminer('${autre.id}', null, 'x')`, moteur())).toMatch(/23514/);
    m(`select vis_moteur_terminer('${autre.id}', null, 'site injoignable')`);
    expect(code(b, `select vis_moteur_terminer('${autre.id}', '{}', null)`, moteur())).toBe("55000");
    expect(code(b, `select vis_moteur_terminer('00000000-0000-4000-8000-000000000000', '{}', null)`, moteur())).toBe("P0002");
    expect(q(`select statut || '|' || erreur from vis_demandes_v2 where id = '${autre.id}'`, APPROVER)).toBe("FAILED|site injoignable");
    expect(q(`select etape from vis_portefeuille_v2 where subject_id = 'autre-site-example'`, APPROVER)).toBe("bloque");
    // Relancer : FAILED seulement, une fois.
    expect(c(`select vis_relancer_demande('${d.id}')`, MICKAEL)).toBe("55000");
    expect(c(`select vis_relancer_demande('${autre.id}')`, VIEWER)).toBe("42501");
    const r = q(`select vis_relancer_demande('${autre.id}')`, APPROVER);
    expect(q(`select vis_relancer_demande('${autre.id}')`, APPROVER)).toBe(r);
    expect(q(`select statut from vis_demandes_v2 where id = '${r}'`, APPROVER)).toBe("QUEUED");
    (globalThis as { siteAdd?: string }).siteAdd = d.id;
  });

  it("propositions du moteur : contenu contrôlé, versions, audit en lecture seule", () => {
    expect(code(b, `select vis_moteur_proposer('${SITE}', '${SITE}:fait:prix', 'fait', '{"enonce": "x"}', null)`, moteur())).toBe("22023");
    expect(code(b, `select vis_moteur_proposer('${SITE}', 'autre:fait:prix', 'fait', '{"enonce": "Prix fictif de 10 €", "categorie": "prix"}', null)`, moteur())).toBe("22023");
    expect(proposer("prix", "fait", { enonce: "Prix fictif de 10 €", categorie: "prix" })).toBe("1");
    expect(proposer("prix", "fait", { enonce: "Prix fictif de 10 €", categorie: "prix" })).toBe("1");
    expect(proposer("prix", "fait", { enonce: "Prix fictif de 12 €", categorie: "prix" })).toBe("2");
    proposer("lieu", "fait", { enonce: "Atelier fictif à Lyon", categorie: "lieu" });
    proposer("fr-01", "question", question("Quel atelier fictif choisir à Lyon ?", "fr", false));
    proposer("fr-02", "question", question("Que vaut Site fictif pour un premier achat ?", "fr", true));
    proposer("fr-03", "question", question("Où trouver un atelier fictif fiable ?", "fr", false));
    proposer("en-01", "question", question("Which fictional workshop is best in Lyon?", "en", false));
    proposer("en-02", "question", question("Is Site fictif reliable for a first purchase?", "en", true));
    proposer("robots", "audit", { controle: "robots", etat: "conforme", detail: "robots.txt ouvert" });
    m(`select vis_moteur_estimer('${SITE}', '${RECO}', 'reconnaissance', 'Reconnaissance', null, 1, 3, array['chatgpt'], 1.5, '{"appels": 3}', '06:30')`);
    expect(b.sql(`select kind || '|' || status from vis.window where id = '${RECO}'`)).toBe("reconnaissance|planned");
    expect(q(`select heure_utc from vis_fenetres_v2 where window_id = '${RECO}'`, VIEWER)).toBe("06:30");
    expect(code(b, `select vis_moteur_estimer('${SITE}', '${RECO}', 'reconnaissance', 'Reconnaissance', null, 1, 3, array['chatgpt'], 1.5, '{}', '25:00')`, moteur())).toBe("23514");
    m(`select vis_moteur_terminer('${(globalThis as { siteAdd?: string }).siteAdd}', '{"propositions": 8}', null)`);
    expect(etape()).toBe("a_valider|mickael");
    expect(q(`select prochaine_action from vis_portefeuille_v2 where subject_id = '${SITE}'`, VIEWER)).toBe("Valider les faits et le panel (5 questions)");
    expect(q(`select string_agg(nature || ':' || version || ':' || etat || ':' || propose_par, ',' order by id) from vis_propositions_v2 where subject_id = '${SITE}' and nature = 'fait'`, VIEWER)).toBe(
      "fait:1:propose:moteur,fait:2:propose:moteur",
    );
  });

  it("modifier et ajouter : membres autorisés, versions, idempotence", () => {
    const fait = `${SITE}:fait:prix`;
    expect(c(`select vis_modifier_proposition('${fait}', '{"enonce": "Prix fictif de 11 €", "categorie": "prix"}')`, VIEWER)).toBe("42501");
    expect(c(`select vis_modifier_proposition('${fait}', '{"enonce": "Prix fictif de 11 €", "categorie": "prix"}')`, SERVICE)).toBe("42501");
    expect(c(`select vis_modifier_proposition('${fait}', '{"enonce": "Prix fictif de 11 €", "categorie": "prix"}')`, AUTRE)).toBe("42501");
    expect(c(`select vis_modifier_proposition('${SITE}:audit:robots', '{"controle": "robots", "etat": "alerte", "detail": "x"}')`, MICKAEL)).toBe("22023");
    expect(c(`select vis_modifier_proposition('${fait}', '{"enonce": 3}')`, MICKAEL)).toBe("22023");
    expect(c(`select vis_modifier_proposition('${SITE}:fait:absent', '{}')`, MICKAEL)).toBe("P0002");
    expect(q(`select vis_modifier_proposition('${fait}', '{"enonce": "Prix fictif de 11 €", "categorie": "prix"}')`, APPROVER)).toBe("3");
    expect(q(`select vis_modifier_proposition('${fait}', '{"enonce": "Prix fictif de 11 €", "categorie": "prix"}')`, APPROVER)).toBe("3");
    expect(q(`select propose_par from vis_propositions_v2 where id = '${fait}'`, VIEWER)).toBe(APPROVER);
    const ajout = `select vis_ajouter_proposition('${SITE}', 'concurrent', '{"nom": "Rival fictif", "type": "structure", "domaines": ["rival.example"], "citations": 0}')`;
    expect(c(ajout, VIEWER)).toBe("42501");
    expect(c(`select vis_ajouter_proposition('${SITE}', 'audit', '{}')`, MICKAEL)).toBe("22023");
    const id = q(ajout, MICKAEL);
    expect(q(ajout, MICKAEL)).toBe(id);
    expect(id).toMatch(new RegExp(`^${SITE}:concurrent:m-[0-9a-f]{10}$`));
  });

  it("valider faits et panel : refus du contrat, idempotence", () => {
    const fait = `${SITE}:fait:prix`;
    const lieu = `${SITE}:fait:lieu`;
    expect(c(`select vis_valider_faits('${SITE}', array['${fait}'])`, VIEWER)).toBe("42501");
    expect(c(`select vis_valider_faits('${SITE}', array['${fait}'])`, SERVICE)).toBe("42501");
    expect(c(`select vis_valider_faits('${SITE}', array[]::text[])`, MICKAEL)).toBe("22023");
    expect(c(`select vis_valider_faits('${SITE}', array['${fait}'], array['${fait}'])`, MICKAEL)).toBe("22023");
    expect(c(`select vis_valider_faits('${SITE}', array['${SITE}:question:fr-01'])`, MICKAEL)).toBe("P0002");
    expect(q(`select vis_valider_faits('${SITE}', array['${fait}'], array['${lieu}'])`, MICKAEL)).toBe("2");
    expect(q(`select vis_valider_faits('${SITE}', array['${fait}'], array['${lieu}'])`, MICKAEL)).toBe("0");
    expect(c(`select vis_valider_faits('${SITE}', array['${lieu}'])`, MICKAEL)).toBe("55000");
    expect(c(`select vis_modifier_proposition('${fait}', '{"enonce": "Prix fictif de 13 €", "categorie": "prix"}')`, MICKAEL)).toBe("55000");
    const qs = (...l: string[]) => `array[${l.map((x) => `'${SITE}:question:${x}'`).join(",")}]`;
    expect(c(`select vis_valider_panel('${SITE}', ${qs("fr-01", "fr-02", "en-02")})`, MICKAEL)).toBe("22023"); // aucune non marquée en en
    expect(c(`select vis_valider_panel('${SITE}', ${qs("fr-01", "fr-02")})`, MICKAEL)).toBe("22023"); // aucune question en en
    expect(c(`select vis_valider_panel('${SITE}', ${qs("fr-01", "en-01")})`, VIEWER)).toBe("42501");
    expect(c(`select vis_go_reconnaissance('${SITE}', 1.5)`, MICKAEL)).toBe("55000"); // GO avant la validation du panel
    expect(q(`select vis_valider_panel('${SITE}', ${qs("fr-01", "fr-02", "en-01", "en-02")})`, MICKAEL)).toBe("1");
    expect(q(`select vis_valider_panel('${SITE}', ${qs("en-02", "fr-01", "fr-02", "en-01")})`, MICKAEL)).toBe("1");
    expect(q(`select string_agg(split_part(id, ':', 3) || ':' || etat, ',' order by id) from vis_propositions_v2 where subject_id = '${SITE}' and nature = 'question'`, VIEWER)).toBe(
      "en-01:valide,en-02:valide,fr-01:valide,fr-02:valide,fr-03:rejete",
    );
  });

  it("GO de la reconnaissance : coût vu égal à l'estimation, plafond fixé, double appel", () => {
    expect(c(`select vis_go_reconnaissance('${SITE}', 1.6)`, MICKAEL)).toBe("22023");
    expect(erreur(b, `select vis_go_reconnaissance('${SITE}', 1.6)`, humain(MICKAEL))).toMatch(/estimation changée, recharger/);
    expect(erreur(b, `select vis_go_reconnaissance('${SITE}', 1.5)`, humain(MICKAEL))).toMatch(/plafond du client non fixé/);
    q("select vis_fixer_plafond('client-fictif', 10)", MICKAEL);
    expect(c(`select vis_go_reconnaissance('${SITE}', 1.5)`, VIEWER)).toBe("42501");
    expect(c(`select vis_go_reconnaissance('${SITE}', 1.5)`, SERVICE)).toBe("42501");
    expect(code(b, `select vis_go_reconnaissance('${SITE}', 1.5)`, { role: "anon" })).toBe("42501");
    const d = q(`select vis_go_reconnaissance('${SITE}', 1.5)`, APPROVER);
    expect(q(`select vis_go_reconnaissance('${SITE}', 1.5)`, MICKAEL)).toBe(d);
    expect(q(`select statut || '|' || cout_vu_au_go_usd || '|' || go_par from vis_fenetres_v2 where window_id = '${RECO}'`, VIEWER)).toBe(`go_donne|1.50|${APPROVER}`);
    expect(etape()).toBe("reconnaissance_en_cours|moteur");
    const go = JSON.parse(m(`select vis_moteur_go('${SITE}', '${RECO}')`));
    expect(go).toMatchObject({ window_id: RECO, statut: "go_donne", cout_vu_au_go_usd: 1.5, cout_estime_usd: 1.5, plafond_usd: 10, plafond_global_usd: 100, heure_utc: "06:30" });
    expect(code(b, `select vis_moteur_go('${SITE}', '${RECO}')`, humain(MICKAEL))).toBe("42501");
  });

  it("le moteur mène la reconnaissance : fenêtre, preuves, jours, concurrents", () => {
    // La file : la demande relancée de l'autre site, puis la reconnaissance.
    let d = prendre()!;
    if (d.type !== "RECON") {
      m(`select vis_moteur_terminer('${d.id}', '{}', null)`);
      d = prendre()!;
    }
    expect(d.type).toBe("RECON");
    expect(code(b, `select vis_moteur_fenetre('${SITE}', '${RECO}', 'close', null)`, moteur())).toBe("55000");
    m(`select vis_moteur_fenetre('${SITE}', '${RECO}', 'en_cours', '2026-11-16')`);
    m(`select vis_moteur_fenetre('${SITE}', '${RECO}', 'en_cours', '2026-11-16')`);
    const preuve = (n: number) => ({
      id: `00000000-0000-4000-8000-00000000f00${n}`, client_id: "client-fictif", site_id: null, subject_id: SITE, window_id: RECO, prompt_id: "fr-01", prompt_version: 1,
      prompt_language: "fr", engine: "chatgpt", engine_version: "gpt-fictif", collector_name: "oia-direct", collector_run_id: "r1", received_at: new Date().toISOString(),
      raw_text: `Réponse fictive ${n}`, structured: { brandMentioned: false }, citations: [], cost_usd: 1,
    });
    expect(m(`select vis_moteur_preuves('${JSON.stringify([preuve(1), preuve(2)])}')`)).toBe("2");
    expect(m(`select vis_moteur_preuves('${JSON.stringify([preuve(1), preuve(2)])}')`)).toBe("0");
    expect(code(b, `select vis_moteur_preuves('${JSON.stringify([{ ...preuve(1), raw_text: "Texte réécrit" }])}')`, moteur())).toBe("23514");
    expect(code(b, `select vis_moteur_jour('${SITE}', '${RECO}', 2, '2026-11-17', 'complet', '{}')`, moteur())).toBe("22023");
    m(`select vis_moteur_jour('${SITE}', '${RECO}', 1, '2026-11-16', 'complet', '{"reponses": 2}')`);
    m(`select vis_moteur_jour('${SITE}', '${RECO}', 1, '2026-11-16', 'partiel', '{}')`);
    expect(q(`select jours::text || '|' || cout_reel_usd from vis_fenetres_v2 where window_id = '${RECO}'`, VIEWER)).toBe('[{"date": "2026-11-16", "etat": "complet", "jour": 1}]|2.000000');
    expect(c(`select vis_valider_concurrents('${SITE}', array[]::text[])`, MICKAEL)).toBe("55000"); // avant la fin de la reconnaissance
    m(`select vis_moteur_fenetre('${SITE}', '${RECO}', 'close', null)`);
    proposer("rival-un", "concurrent", { nom: "Rival un", type: "structure", domaines: ["rival-un.example"], citations: 5 }, "reponses:2");
    proposer("plateforme-x", "concurrent", { nom: "Plateforme X", type: "plateforme", domaines: ["plateforme-x.example"], citations: 2 }, "reponses:2");
    proposer("homonyme-bois", "homonyme", { nom: "Site fictif Bois", exemple: "une menuiserie d'une autre ville", citations: 1 }, "reponses:1");
    m(`select vis_moteur_estimer('${SITE}', '${J0}', 'reference', 'J0', null, 5, 4, array['chatgpt'], 9, '{"appels": 20}')`);
    m(`select vis_moteur_terminer('${d.id}', '{"concurrents": 2}', null)`);
    expect(etape()).toBe("concurrents_a_valider|mickael");
  });

  it("valider les concurrents : après la reconnaissance, liste figée une fois", () => {
    const ids = `array['${SITE}:concurrent:rival-un']`;
    const h = `array['${SITE}:homonyme:homonyme-bois']`;
    expect(c(`select vis_valider_concurrents('${SITE}', ${ids}, ${h})`, VIEWER)).toBe("42501");
    expect(c(`select vis_valider_concurrents('${SITE}', array['${SITE}:concurrent:absent'])`, MICKAEL)).toBe("P0002");
    expect(c(`select vis_go_fenetre('${SITE}', current_date + 2, 9)`, MICKAEL)).toBe("55000"); // concurrents à valider
    expect(q(`select vis_valider_concurrents('${SITE}', ${ids}, ${h})`, MICKAEL)).toBe("1");
    expect(q(`select vis_valider_concurrents('${SITE}', ${ids}, ${h})`, MICKAEL)).toBe("1");
    expect(c(`select vis_valider_concurrents('${SITE}', array['${SITE}:concurrent:plateforme-x'])`, MICKAEL)).toBe("55000");
    expect(q(`select string_agg(split_part(id, ':', 3) || ':' || etat, ',' order by id) from vis_propositions_v2 where nature in ('concurrent','homonyme') and subject_id = '${SITE}'`, VIEWER)).toMatch(
      /^m-[0-9a-f]{10}:rejete,plateforme-x:rejete,rival-un:valide,homonyme-bois:valide$/,
    );
    expect(etape()).toBe("pret_pour_go|mickael");
  });

  it("GO de l'étude : début, coût vu, plafond du client et plafond global, double appel", () => {
    expect(c(`select vis_go_fenetre('${SITE}', current_date, 9)`, MICKAEL)).toBe("22023");
    expect(erreur(b, `select vis_go_fenetre('${SITE}', current_date + 2, 9)`, humain(MICKAEL))).toMatch(/plafond du client dépassé \(2\.00 \$ dépensés ou engagés ce mois \+ 9\.00 \$ > 10\.00 \$\)/);
    m(`select vis_moteur_estimer('${SITE}', '${J0}', 'reference', 'J0', null, 5, 4, array['chatgpt'], 7, '{"appels": 20}')`);
    expect(erreur(b, `select vis_go_fenetre('${SITE}', current_date + 2, 9)`, humain(MICKAEL))).toMatch(/estimation changée, recharger \(estimation courante : 7\.00 \$\)/);
    q("select vis_fixer_plafond(null, 8)", MICKAEL);
    expect(erreur(b, `select vis_go_fenetre('${SITE}', current_date + 2, 7)`, humain(MICKAEL))).toMatch(/plafond global dépassé/);
    q("select vis_fixer_plafond(null, 100)", MICKAEL);
    expect(c(`select vis_go_fenetre('${SITE}', current_date + 2, 7)`, VIEWER)).toBe("42501");
    expect(c(`select vis_go_fenetre('${SITE}', current_date + 2, 7)`, SERVICE)).toBe("42501");
    expect(q(`select vis_go_fenetre('${SITE}', current_date + 2, 7)`, MICKAEL)).toBe(J0);
    expect(q(`select vis_go_fenetre('${SITE}', current_date + 2, 7)`, MICKAEL)).toBe(J0);
    expect(q("select count(*) from vis.demande where type = 'WINDOW_RUN'", MICKAEL)).toBe("1");
    expect(c(`select vis_go_fenetre('${SITE}', current_date + 3, 7)`, MICKAEL)).toBe("55000"); // une étude est déjà lancée
    expect(q(`select engage_usd || '|' || reel_usd || '|' || etat || '|' || plafond_global_usd from vis_budget_v2 where client_id = 'client-fictif' and mois = date_trunc('month', now())::date`, VIEWER)).toBe(
      "7.00|2.000000|proche|100.00",
    );
    expect(etape()).toBe("mesure_en_cours|moteur");
    expect(c(`select vis_valider_panel('${SITE}', array['${SITE}:question:fr-01','${SITE}:question:en-01'])`, MICKAEL)).toBe("55000");
  });

  it("le moteur mène l'étude ; arrêter est un geste avec motif ; pages sans script ; rapport validé", () => {
    let d = prendre()!;
    while (d && d.type !== "WINDOW_RUN") {
      m(`select vis_moteur_terminer('${d.id}', '{}', null)`);
      d = prendre()!;
    }
    expect((d as { charge?: { gel?: string } }).charge?.gel).toBe(`freeze-${J0}`);
    m(`select vis_moteur_fenetre('${SITE}', '${J0}', 'en_cours', null)`);
    const debut = q(`select debut from vis_fenetres_v2 where window_id = '${J0}'`, VIEWER);
    const jour = (plus: number) =>
      b.sql(`select set_config('vis.maintenant', (date '${debut}' + ${plus})::text || 'T12:00:00Z', false); select jour_courant || '|' || fenetre_active from vis_portefeuille_v2 where subject_id = '${SITE}'`, humain(VIEWER)).split("\n").at(-1);
    expect(jour(0)).toBe(`1|${J0}`);
    expect(jour(2)).toBe(`3|${J0}`);
    expect(jour(9)).toBe(`5|${J0}`);
    expect(c(`select vis_annuler_fenetre('${J0}', 'non')`, VIEWER)).toBe("42501");
    expect(c(`select vis_annuler_fenetre('${J0}', '')`, MICKAEL)).toBe("22023");
    expect(c(`select vis_annuler_fenetre('${RECO}', 'trop tard')`, MICKAEL)).toBe("55000");
    expect(b.sql(`select status from vis.window where id = '${J0}'`)).toBe("running");
    m(`select vis_moteur_fenetre('${SITE}', '${J0}', 'close', null)`);
    expect(code(b, `select vis_moteur_page('${SITE}', '${J0}', 'rapport', 'fr', '<p>x</p><script>alert(1)</script>')`, moteur())).toBe("22023");
    const page = m(`select vis_moteur_page('${SITE}', '${J0}', 'rapport', 'fr', '<h1>Rapport fictif</h1>')`);
    const rec = { id: "rec-fictif-sources", schemaVersion: 1, type: "SOURCE_TARGET", title: "Être cité par un annuaire fictif", statement: "L'annuaire fictif est cité, la marque en est absente.", impact: { level: "medium" }, effort: { level: "S" }, risk: "low", confidence: "medium", owner: "client", createdBy: "moteur" };
    expect(m(`select vis_moteur_recommandation('${SITE}', '${J0}', '${JSON.stringify(rec).replace(/'/g, "''")}')`)).toBe("t");
    expect(m(`select vis_moteur_recommandation('${SITE}', '${J0}', '${JSON.stringify(rec).replace(/'/g, "''")}')`)).toBe("f");
    m(`select vis_moteur_terminer('${d.id}', '{"rapport": "${page}"}', null)`);
    expect(etape()).toBe("rapport_a_valider|mickael");
    expect(c(`select vis_valider_rapport('${page}')`, VIEWER)).toBe("42501");
    q(`select vis_valider_rapport('${page}')`, MICKAEL);
    expect(c(`select vis_valider_rapport('${page}')`, MICKAEL)).toBe("55000");
    expect(q(`select etat || '|' || valide_par from vis_pages_client_v2 where id = '${page}'`, VIEWER)).toBe(`valide|${MICKAEL}`);
    expect(q(`select prochaine_action from vis_portefeuille_v2 where subject_id = '${SITE}'`, VIEWER)).toBe("Valider les recommandations (1)");
  });

  it("déclarer une exécution : acceptée d'abord, preuve et date, une seule fois ; puis remesure", () => {
    expect(c("select vis_declarer_execution('rec-fictif-sources', 'abc1234', current_date)", MICKAEL)).toBe("55000");
    q("select vis_valider_recommandation('rec-fictif-sources')", MICKAEL);
    expect(etape()).toBe("actions_en_cours|client");
    expect(c("select vis_declarer_execution('rec-fictif-sources', 'abc1234', current_date)", VIEWER)).toBe("42501");
    expect(c("select vis_declarer_execution('rec-fictif-sources', 'pas une preuve', current_date)", MICKAEL)).toBe("22023");
    expect(c("select vis_declarer_execution('rec-fictif-sources', 'abc1234', current_date + 1)", MICKAEL)).toBe("22023");
    expect(c("select vis_declarer_execution('rec-absente', 'abc1234', current_date)", MICKAEL)).toBe("P0002");
    expect(q("select vis_declarer_execution('rec-fictif-sources', 'https://site-fictif.example/annuaire', current_date, 'fiche créée') > 0", APPROVER)).toBe("t");
    expect(c("select vis_declarer_execution('rec-fictif-sources', 'abc1234', current_date)", MICKAEL)).toBe("55000");
    expect(etape()).toBe("remesure_proposee|moteur");
    m(`select vis_moteur_estimer('${SITE}', '${J1}', 'remesure', 'J1', '${J0}', 5, 4, array['chatgpt'], 3, '{}')`);
    expect(etape()).toBe("remesure_proposee|mickael");
    expect(q(`select vis_go_fenetre('${SITE}', current_date + 21, 3)`, MICKAEL)).toBe(J1);
    q(`select vis_annuler_fenetre('${J1}', 'remesure reportée')`, MICKAEL);
    expect(q(`select statut from vis_fenetres_v2 where window_id = '${J1}'`, VIEWER)).toBe("annulee");
    expect(q(`select statut from vis_demandes_v2 where type = 'WINDOW_RUN' and charge ->> 'window_id' = '${J1}'`, VIEWER)).toBe("CANCELLED");
    expect(JSON.parse(m(`select vis_moteur_sujet('${SITE}')`)).executions).toEqual([{ recommandation: "rec-fictif-sources", date: q("select current_date", MICKAEL), fenetre: null }]);
  });

  it("alertes et état du moteur", () => {
    const a = m(`select vis_moteur_alerter('client-fictif', '${SITE}', 'bloquant', 'PLAFOND', 'Plafond du mois atteint')`);
    expect(code(b, `select vis_moteur_alerter('client-fictif', null, 'grave', 'PLAFOND', 'x')`, moteur())).toBe("23514");
    expect(q(`select etape || '|' || alertes_ouvertes from vis_portefeuille_v2 where subject_id = '${SITE}'`, VIEWER)).toBe("bloque|1");
    expect(c(`select vis_acquitter_alerte('${a}')`, AUTRE)).toBe("42501");
    q(`select vis_acquitter_alerte('${a}')`, APPROVER);
    q(`select vis_acquitter_alerte('${a}')`, APPROVER);
    expect(q(`select acquittee_par from vis_alertes_v2 where id = '${a}'`, VIEWER)).toBe(APPROVER);
    m("select vis_moteur_signe('mac-test', 'abc1234', now() + interval '5 minutes')");
    expect(code(b, "select vis_moteur_signe('mac-test', 'abc1234', null)", humain(MICKAEL))).toBe("42501");
    const etat = (h: string) => b.sql(`select set_config('vis.maintenant', (now() + interval '${h}')::text, false); select etat || '|' || hote || '|' || demandes_en_file from vis_moteur_v2`, humain(VIEWER)).split("\n").at(-1);
    expect(etat("1 minute")).toMatch(/^actif\|mac-test\|\d+$/);
    expect(etat("30 minutes")).toMatch(/^en_retard\|/);
    expect(etat("3 hours")).toMatch(/^muet\|/);
    expect(q("select count(*) from vis_moteur_v2", "00000000-0000-4000-8000-0000000000ff")).toBe("0");
  });

  it("RLS entre clients : un autre client ne voit rien ; anon n'a aucun droit", () => {
    for (const v of VUES_V2.slice(0, 8)) {
      const filtre = v === "vis_moteur_v2" ? "" : " where client_id = 'client-fictif'";
      expect(q(`select count(*) from ${v}${filtre}`, AUTRE), v).toBe(v === "vis_moteur_v2" ? "1" : "0");
      expect(code(b, `select count(*) from ${v}`, { role: "anon" }), v).toBe("42501");
    }
    expect(q("select count(*) from vis_budget_v2", AUTRE)).toBe("1");
    expect(q("select count(*) from vis.geste where client_id = 'client-fictif'", AUTRE)).toBe("0");
  });

  it("aucune écriture directe, même par le moteur ; ajout seul, propriétaire compris", () => {
    const d = b.sql("select id from vis.demande limit 1");
    for (const [sql, who] of [
      [`insert into vis.demande (client_id, type, demande_par) values ('client-fictif', 'SITE_ADD', 'x1')`, humain(MICKAEL)],
      [`insert into vis.demande_etat (demande_id, client_id, statut, tentative, par) values ('${d}', 'client-fictif', 'RUNNING', 9, 'x')`, moteur()],
      [`insert into vis.plafond (client_id, plafond_usd, par) values ('client-fictif', 1000, 'x1')`, humain(MICKAEL)],
      [`insert into vis.proposition_decision (element_id, version, client_id, subject_id, etat, par) values ('${SITE}:fait:prix', 1, 'client-fictif', '${SITE}', 'valide', 'x1')`, humain(MICKAEL)],
      [`insert into vis.fenetre_go (window_id, client_id, estimation_id, cout_vu_usd, mois, par) values ('${J0}', 'client-fictif', 1, 0, '2026-11-01', 'x1')`, moteur()],
      [`insert into vis.geste (fonction, par) values ('vis_x', 'x1')`, humain(MICKAEL)],
      [`insert into vis.alerte (client_id, gravite, type, message) values ('client-fictif', 'info', 'RAPPORT_PRET', 'xxx')`, moteur()],
    ] as const) expect(code(b, sql, who), sql).toBe("42501");
    for (const t of ["demande", "demande_etat", "proposition", "fenetre_go", "plafond", "geste", "page", "moteur_signe"]) {
      expect(erreur(b, `truncate vis.${t} cascade`), t).toMatch(/ajout seul/);
    }
    expect(erreur(b, "update vis.demande set charge = '{}'")).toMatch(/ajout seul/);
    expect(erreur(b, "delete from vis.proposition")).toMatch(/ajout seul/);
  });

  it("chaque geste réussi est journalisé dans vis.geste, avec son auteur", () => {
    expect(q("select string_agg(distinct fonction, ',' order by fonction) from vis.geste", MICKAEL)).toBe(
      "vis_acquitter_alerte,vis_ajouter_proposition,vis_annuler_fenetre,vis_declarer_execution,vis_demander_site,vis_fixer_plafond,vis_go_fenetre,vis_go_reconnaissance,vis_modifier_proposition,vis_relancer_demande,vis_valider_concurrents,vis_valider_faits,vis_valider_panel,vis_valider_rapport",
    );
    expect(b.sql("select count(*) from vis.geste where par not in (select user_id from vis.client_member)")).toBe("0");
  });
});

describe.skipIf(!postgresDisponible)("contrat Visibility v2 : la file du moteur", () => {
  let b: Banc;
  beforeAll(() => {
    ({ b } = installer());
    b.sql(`insert into vis.client (id, display_name, ownership, status, default_repo_action_mode) values ('client-file', 'Client file', 'external', 'active', 'lecture');
           insert into vis.client_member (user_id, client_id, role) values ('${APPROVER}', 'client-file', 'approver');`);
    for (let i = 1; i <= 10; i++) b.sql(`select vis_demander_site('https://f-${i}.example', 'Site ${i}', array['fr'], array['FR'], 'client-file')`, humain(APPROVER));
  });
  afterAll(() => b?.arreter());

  it("sans signe de vie, le moteur est muet et les sites en attente sont bloqués ; une alerte MOTEUR_MUET calculée", () => {
    expect(b.sql("select etat || '|' || demandes_en_file from vis_moteur_v2", humain(APPROVER))).toBe("muet|10");
    expect(b.sql("select type || '|' || gravite || '|' || client_id from vis_alertes_v2", humain(MICKAEL))).toBe("MOTEUR_MUET|bloquant|oia");
    expect(b.sql("select count(*) from vis_alertes_v2", humain(APPROVER))).toBe("0");
    const id = b.sql("select id from vis_alertes_v2", humain(MICKAEL));
    expect(code(b, `select vis_acquitter_alerte('${id}')`, humain(MICKAEL))).toBe("P0002");
    b.sql("insert into vis.moteur_signe (hote, version, prochain, le) values ('mac-test', 'x', null, now() - interval '3 hours')");
    expect(b.sql("select message from vis_alertes_v2", humain(MICKAEL))).toMatch(/^Moteur muet depuis le /);
    expect(b.sql("select count(*) from vis_portefeuille_v2 where etape = 'bloque' and prochaine_action like 'Le moteur est muet%'", humain(APPROVER))).toBe("10");
  });

  it("une demande est prise une seule fois, même par trois moteurs en concurrence", async () => {
    const prises = () => b.sqlAsync(Array.from({ length: 6 }, () => "select vis_moteur_prendre('mac-test') ->> 'id';").join("\n"), moteur());
    const sorties = await Promise.all([prises(), prises(), prises()]);
    const ids = sorties.flatMap((s) => s.split("\n").filter(Boolean));
    for (let r = b.sql("select vis_moteur_prendre('mac-test') ->> 'id'", moteur()); r; r = b.sql("select vis_moteur_prendre('mac-test') ->> 'id'", moteur())) ids.push(r);
    expect(ids).toHaveLength(10);
    expect(new Set(ids).size).toBe(10);
    expect(b.sql("select count(*) from vis.demande_etat where statut = 'RUNNING'")).toBe("10");
    expect(b.sql("select vis_moteur_prendre('mac-test') is null", moteur())).toBe("t");
  });

  it("une demande RUNNING depuis plus de 30 minutes repasse en file, puis se reprend (tentative 2)", () => {
    const d = b.sql("select id from vis.demande order by demande_le limit 1");
    // Prise abandonnée : sa dernière ligne d'état date de 31 minutes (écrite comme le moteur l'aurait fait).
    b.sql(`insert into vis.demande_etat (demande_id, client_id, statut, tentative, hote, par, le) values ('${d}', 'client-file', 'QUEUED', null, 'test', 'test', now() - interval '40 minutes');
           insert into vis.demande_etat (demande_id, client_id, statut, tentative, hote, par, le) values ('${d}', 'client-file', 'RUNNING', 2, 'mac-ancien', 'test', now() - interval '31 minutes');`);
    const pris = JSON.parse(b.sql("select vis_moteur_prendre('mac-neuf')", moteur()));
    expect([pris.id, pris.statut]).toEqual([d, "RUNNING"]);
    expect(b.sql(`select string_agg(statut || ':' || coalesce(tentative::text, '-') || ':' || coalesce(hote, '-'), ',' order by id) from vis.demande_etat where demande_id = '${d}'`)).toBe(
      "RUNNING:1:mac-test,QUEUED:-:test,RUNNING:2:mac-ancien,QUEUED:-:mac-neuf,RUNNING:3:mac-neuf",
    );
    // Une prise de moins de 30 minutes reste au moteur qui la tient.
    expect(b.sql("select vis_moteur_prendre('mac-neuf') is null", moteur())).toBe("t");
    expect(b.sql(`select tentatives from vis_demandes_v2 where id = '${d}'`, humain(APPROVER))).toBe("3");
    // Troisième prise abandonnée : FAILED, alerte ECHEC_DEMANDE, plus jamais reprise.
    b.sql(`insert into vis.demande_etat (demande_id, client_id, statut, tentative, hote, par, le) values ('${d}', 'client-file', 'QUEUED', null, 'test', 'test', now() - interval '35 minutes'),
           ('${d}', 'client-file', 'RUNNING', 4, 'mac-x', 'test', now() - interval '31 minutes')`);
    expect(b.sql("select vis_moteur_prendre('mac-neuf') is null", moteur())).toBe("t");
    expect(b.sql(`select statut || '|' || erreur || '|' || tentatives from vis_demandes_v2 where id = '${d}'`, humain(APPROVER))).toBe(
      "FAILED|abandonnée après 3 tentatives (moteur arrêté en cours de traitement)|4",
    );
    expect(b.sql("select type || '|' || gravite from vis_alertes_v2 where client_id = 'client-file'", humain(APPROVER))).toBe("ECHEC_DEMANDE|bloquant");
    expect(code(b, `select vis_moteur_terminer('${d}', '{}', null)`, moteur())).toBe("55000");
  });
});

describe.skipIf(!postgresDisponible)("contrat Visibility v2 : jugements de Jev, sources et coûts par réponse", () => {
  let b: Banc;
  const L = "00000000-0000-4000-8000-0000000000b9";
  beforeAll(() => {
    ({ b } = installer());
    const ins = (n: number, collecteur: string, engine: string, structured: object, citations: unknown[] = [], cout = 0.1, texte = "Réponse fictive") =>
      `insert into vis.evidence (id, client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, collector_name, raw_text, raw_sha256, structured, citations, cost_usd)
       values ('00000000-0000-4000-8000-0000000c000${n}', 'client-j', 'sujet-j', 'sujet-j-j0', 'fr-01', 1, 'fr', '${engine}', '${collecteur}', '${texte}', '\\x00', '${JSON.stringify(structured).replace(/'/g, "''")}', '${JSON.stringify(citations)}', ${cout});`;
    const jev = (sentiment: string | null, position: number | null) => ({
      brand: sentiment ? { mentioned: true, probability: 0.9, sentiment, position, mentionCount: 2, passageText: "un atelier fiable" } : undefined,
      competitors: {},
    });
    b.sql(`insert into vis.client (id, display_name, ownership, status, default_repo_action_mode) values ('client-j', 'Client j', 'external', 'active', 'lecture');
           insert into vis.subject (id, client_id, status) values ('sujet-j', 'client-j', 'active');
           insert into vis.window (id, subject_id, client_id, kind, panel_version, status) values ('sujet-j-j0', 'sujet-j', 'client-j', 'baseline', 1, 'done');
           insert into vis.client_member (user_id, client_id, role) values ('${L}', 'client-j', 'viewer');
           ${ins(1, "elmo-0.7.7", "chatgpt", { brandMentioned: true, jev: { statut: "extrait (Jev 1.13)", assessments: jev("positive", 1) }, webQueries: ["atelier fictif lyon"], provider: "openai" }, [{ url: "https://a.example/x", title: "A", index: 0 }, "https://b.example/"], 0.2)}
           ${ins(2, "elmo-0.7.7", "chatgpt", { brandMentioned: false, jev: { statut: "extrait (Jev 1.13)", assessments: null }, webQueries: [], provider: "openai" })}
           ${ins(3, "elmo", "claude", { brandMentioned: true })}
           ${ins(4, "elmo-0.7.7", "mistral", { brandMentioned: null, jev: null, non_mesuree: true, webQueries: "unavailable" }, [], 0.05, "")}
           ${ins(5, "oia-direct", "gemini", { brandMentioned: true, mentions: { judge: { status: "juge", assessments: jev("negative", 2), cost: { usd: 0.01 } } }, webQueries: [], provider: "openrouter" }, [], 0.3)}
           ${ins(6, "oia-direct", "gemini", { brandMentioned: null, mentions: { judge: { status: "echec", cost: { usd: 0.01 } } }, webQueries: ["q1", "q2"], provider: "google" }, [], 0.3)}`);
  });
  afterAll(() => b?.arreter());
  const v = (sql: string) => b.sql(sql, humain(L));

  it("jugement par réponse : extrait (Jev 1.13), ou non mesurable avec sa raison, jamais 0", () => {
    expect(v("select string_agg(right(reponse_id::text, 1) || ':' || etat || ':' || coalesce(marque_citee::text, '-') || ':' || coalesce(sentiment, '-') || ':' || coalesce(position::text, '-') || ':' || coalesce(raison_non_mesurable, '-'), ',' order by reponse_id) from vis_jugements_v2")).toBe(
      "1:extrait:true:positive:1:-,2:extrait:false:-:-:-,3:non_mesurable:-:-:-:synchronisée avant l'import des jugements de Jev,4:non_mesurable:-:-:-:réponse reçue sans texte,5:extrait:true:negative:2:-,6:non_mesurable:-:-:-:échec du juge",
    );
    expect(v("select distinct source from vis_jugements_v2")).toBe("extrait (Jev 1.13)");
  });

  it("par assistant et par fenêtre : sentiments, position moyenne ; non mesurable sans jugement", () => {
    expect(v("select string_agg(moteur || ':' || jugees || '/' || reponses || ':' || marque_citee || ':' || sentiment_positif || sentiment_negatif || ':' || coalesce(position_moyenne::text, '-') || ':' || etat, ',' order by moteur) from vis_jugements_moteurs_v2")).toBe(
      "chatgpt:2/2:1:10:1.00:mesure,claude:0/1:0:00:-:non_mesurable,gemini:1/2:1:01:2.00:mesure,mistral:0/1:0:00:-:non_mesurable,tous:3/6:2:11:1.50:mesure",
    );
    expect(v("select raison from vis_jugements_moteurs_v2 where moteur = 'claude'")).toBe("aucune réponse jugée par Jev");
  });

  it("sources : adresses citées, recherches fournies, aucune ou non fournies", () => {
    expect(v("select citations::text || '|' || nb_citations from vis_reponses_sources_v2 where right(reponse_id::text, 1) = '1'")).toBe(
      '[{"url": "https://a.example/x", "ordre": 1, "titre": "A", "domaine": "a.example"}, {"url": "https://b.example/", "ordre": 2, "titre": null, "domaine": "b.example"}]|2',
    );
    expect(v("select string_agg(right(reponse_id::text, 1) || ':' || etat_recherches || ':' || coalesce(recherches::text, '-'), ',' order by reponse_id) from vis_reponses_sources_v2")).toBe(
      '1:fourni:["atelier fictif lyon"],2:aucune:-,3:non_fourni:-,4:non_fourni:-,5:non_fourni:-,6:fourni:["q1", "q2"]',
    );
  });

  it("coûts par assistant : estimé pour toutes les réponses, réel pour le collecteur OIA seul", () => {
    expect(v("select string_agg(moteur || ':' || cout_estime_usd || ':' || reponses_cout_reel || ':' || coalesce(cout_reel_usd::text, '-'), ',' order by moteur) from vis_couts_moteurs_v2")).toBe(
      "chatgpt:0.300000:0:-,claude:0.100000:0:-,gemini:0.600000:2:0.620000,mistral:0.050000:0:-,tous:1.050000:2:0.620000",
    );
    expect(b.sql("select count(*) from vis_jugements_v2", humain(AUTRE))).toBe("0");
  });
});

describe.skipIf(!postgresDisponible)("contrat Visibility v2 : retour arrière et démonstration", () => {
  let b: Banc;
  let v1: string;
  beforeAll(() => {
    ({ b, v1 } = installer());
  });
  afterAll(() => b?.arreter());

  it("la démonstration v2 figée (docs/interface/demo/visibility-v2-demo.json) est à jour", () => {
    b.fichier(DEMO_SQL);
    const MEMBRE = "00000000-0000-4000-8000-00000000de00";
    const demo: Record<string, unknown> = { _avertissement: "Données entièrement fictives. Contrat Visibility version 2 (pilotage).", _membre: MEMBRE, _maintenant: "2026-11-18T10:00:00Z" };
    for (const v of VUES_V2.slice(0, 8)) {
      const sortie = b.sql(`select set_config('vis.maintenant', '2026-11-18T10:00:00Z', false); select coalesce(json_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]') from ${v} t`, humain(MEMBRE));
      demo[v] = JSON.parse(sortie.split("\n").at(-1)!);
    }
    const texte = `{\n${Object.entries(demo)
      .map(([k, v]) => (Array.isArray(v) ? `"${k}": [\n${v.map((x) => `  ${JSON.stringify(x)}`).join(",\n")}\n]` : `"${k}": ${JSON.stringify(v)}`))
      .join(",\n")}\n}\n`;
    if (process.env.OIA_ECRIRE_DEMO === "1" || !existsSync(DEMO_JSON)) writeFileSync(DEMO_JSON, texte);
    expect(readFileSync(DEMO_JSON, "utf8")).toBe(texte);
    const etapes = (demo.vis_portefeuille_v2 as { etape: string }[]).map((l) => l.etape).sort();
    expect(etapes).toEqual(["a_valider", "actions_en_cours", "bloque", "demande", "mesure_en_cours", "pret_pour_go", "rapport_a_valider", "reconnaissance_en_cours", "remesure_proposee"].sort());
    const mesure = (demo.vis_portefeuille_v2 as { etape: string; jour_courant: number | null }[]).find((l) => l.etape === "mesure_en_cours")!;
    expect(mesure.jour_courant).toBe(3);
    expect((demo.vis_moteur_v2 as { etat: string }[])[0]!.etat).toBe("actif");
    expect(demo.vis_alertes_v2).toHaveLength(2);
  });

  it("0011 puis vis 0006_pilotage se défont ; les vues v1 et de 0010 restent ; tout se réapplique", () => {
    b.fichier(ecrireTemp(`begin;\n${retourArriere(M0011)}\ncommit;`));
    expect(b.sql("select count(*) from pg_views where viewname in ('vis_portefeuille_v2','vis_demandes_v2','vis_budget_v2')")).toBe("0");
    expect(b.sql("select count(*) from pg_proc where proname like 'vis\\_moteur\\_%' or proname like 'vis\\_go\\_%'")).toBe("0");
    // La démonstration a écrit des lignes : le retour arrière de vis 0006 les supprime (export d'abord, en production).
    b.sql("delete from vis.window where kind = 'reconnaissance'");
    b.fichier(ecrireTemp(retourArriere(V0006)));
    expect(b.sql("select count(*) from pg_tables where schemaname = 'vis' and tablename in ('geste','demande','demande_etat','proposition','fenetre','plafond','alerte','moteur_signe','page')")).toBe("0");
    expect(b.sql(V1)).toBe(v1);
    b.fichier(V0006);
    b.fichier(M0011);
    expect(b.sql("select count(*) from pg_views where viewname = 'vis_portefeuille_v2'")).toBe("1");
  });
});
