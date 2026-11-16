import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { demarrer, ecrireTemp, erreur, postgresDisponible, type Banc } from "./pg/banc";
import { buildImport, importSql } from "../../../infra/visibility/src/elmo-import-final";
import { exportElmo, sujet } from "../../../infra/visibility/test/fixtures/elmo-export-fictif";

/**
 * Mandat v14, bloc B : import final d'Elmo sur un Postgres jetable, avec 0005
 * (réponses sans texte non mesurées). Export et sujet fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const MEMBRE = "00000000-0000-4000-8000-00000000de00";
let b: Banc;
const sql = () => importSql([sujet()], buildImport([sujet()], exportElmo()), "test");
const empreintes = () => b.sql("select string_agg(id::text || window_id || encode(raw_sha256, 'hex'), ',' order by id) from vis.evidence");

describe.skipIf(!postgresDisponible)("import final d'Elmo (0005), sur Postgres jetable", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    b.fichier(chemin("../supabase/migrations/0006_visibility_vues.sql"));
  });
  afterAll(() => b?.arreter());

  it("sans 0005, une réponse sans texte est refusée et rien n'entre", () => {
    expect(erreur(b, sql())).toMatch(/raw_text_check/);
    expect(b.sql("select count(*) from vis.evidence")).toBe("0");
  });

  it("avec 0005 : toutes les réponses entrent, rangées par fenêtre, l'empreinte du texte vide comprise", () => {
    b.fichier(VIS("0005_evidence_non_mesuree"));
    b.fichier(ecrireTemp(sql()));
    expect(b.sql("select string_agg(window_id || ':' || n, ',' order by window_id) from (select window_id, count(*) n from vis.evidence group by window_id) t"))
      .toBe("demo-subject-hors-fenetre:1,demo-subject-j0:2,demo-subject-j0-hors-panel:1");
    expect(b.sql("select encode(raw_sha256, 'hex') from vis.evidence where raw_text = ''")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(b.sql("select count(*) from vis.evidence where collector_name = 'elmo-0.7.7'")).toBe("4");
  });

  it("vues v1 : la fenêtre mesurée ne compte ni la réponse hors panel ni le jugement d'une réponse sans texte", () => {
    b.sql(`insert into vis.client_member (user_id, client_id, role) values ('${MEMBRE}', 'demo-subject', 'owner') on conflict do nothing`);
    const en = { role: "authenticated", utilisateur: MEMBRE };
    expect(b.sql("select reponses || '|' || coalesce(reponses_jugees::text, '') from vis_mesure_v1 where window_id = 'demo-subject-j0'", en)).toMatch(/^2\|1$/);
  });

  it("rejouer l'import ne change rien ; texte modifié : refus, base inchangée", () => {
    const avant = empreintes();
    b.fichier(ecrireTemp(sql()));
    expect(empreintes()).toBe(avant);
    const rows = buildImport([sujet()], exportElmo());
    rows[0]!.raw_text = "réécrit";
    expect(erreur(b, importSql([sujet()], rows, "test"))).toMatch(/ne correspondent pas au texte/);
    expect(empreintes()).toBe(avant);
  });

  it("0005 garde l'exigence d'un texte pour toute autre preuve", () => {
    expect(erreur(b, "insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, collector_name, raw_text) values ('demo-subject', 'demo-subject', 'demo-subject-j0', 'en-01', 1, 'en', 'chatgpt', 'manual', '')")).toMatch(/raw_text_ou_non_mesuree/);
  });
});
