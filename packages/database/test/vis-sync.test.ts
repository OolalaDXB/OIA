import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { demarrer, ecrireTemp, erreur, postgresDisponible, type Banc } from "./pg/banc";
import { loadSubject } from "../../../infra/visibility/src/load";
import { sqlSync } from "../../../infra/visibility/src/vis-sync";
import { exportFictif } from "../../../infra/visibility/test/fixtures/export-fictif";

/**
 * Mandat v9, bloc C : le script de infra/visibility/src/vis-sync.ts appliqué sur
 * un Postgres jetable (vis 0001 à 0004, puis 0006), lu par les vues du contrat.
 * Sujet et exportation fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const MEMBRE = "00000000-0000-4000-8000-00000000de00";

let b: Banc;
const en = { role: "authenticated", utilisateur: MEMBRE };
const sync = (exp = exportFictif()) => sqlSync(loadSubject(chemin("../../../infra/visibility/test/fixtures/demo-subject")), exp, { windowId: "j0" });

describe.skipIf(!postgresDisponible)("vis-sync sur Postgres jetable", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    b.fichier(chemin("../supabase/migrations/0006_visibility_vues.sql"));
  });
  afterAll(() => b?.arreter());

  it("crée client, site, sujet, fenêtre, questions et preuves ; les vues les montrent au membre", () => {
    b.fichier(ecrireTemp(sync().sql));
    b.sql(`insert into vis.client_member (user_id, client_id, role) values ('${MEMBRE}', 'demo-subject', 'owner')`);
    expect(b.sql("select count(*) from vis.evidence")).toBe("3");
    expect(b.sql("select string_agg(missing_on::text, ',') from vis.window_missing_day")).toBe("2026-11-02");
    expect(b.sql("select window_id || '|' || statut_fenetre || '|' || etat || '|' || jours_mesures || '/' || jours_prevus || '|' || reponses from vis_mesure_v1", en))
      .toBe("demo-subject-j0|running|mesure_en_cours|2/5|3");
    expect(Number(b.sql("select count(*) from vis_reponses_v1 where marque_citee", en))).toBe(2);
    expect(Number(b.sql("select count(*) from vis_citations_v1 where url = 'https://cited.example/page'", en))).toBe(0); // sans cache de redirection
  });

  it("rejouer ne change rien, et l'empreinte en base est celle du texte", () => {
    const avant = b.sql("select string_agg(id::text || encode(raw_sha256, 'hex'), ',' order by id) from vis.evidence");
    b.fichier(ecrireTemp(sync().sql));
    expect(b.sql("select string_agg(id::text || encode(raw_sha256, 'hex'), ',' order by id) from vis.evidence")).toBe(avant);
    expect(b.sql("select count(*) from vis.evidence where encode(raw_sha256, 'hex') <> encode(sha256(convert_to(raw_text, 'UTF8')), 'hex')")).toBe("0");
  });

  it("un texte exporté qui ne correspond plus à la preuve en base : tout est refusé", () => {
    const exp = exportFictif();
    exp.runs[0]!.text = "Texte réécrit après coup";
    exp.runs.push({ ...exp.runs[1]!, id: "00000000-0000-4000-8000-000000000099", text: "Nouvelle réponse" });
    const e = erreur(b, sync(exp).sql.replace(/^begin;$/m, "begin;").replace(/^commit;$/m, "commit;"));
    expect(e).toMatch(/ne correspondent plus au texte exporté/);
    expect(b.sql("select count(*) from vis.evidence")).toBe("3"); // la nouvelle réponse non plus n'est pas entrée
  });

  it("une fenêtre terminée reste terminée", () => {
    b.sql("update vis.window set status = 'done'");
    b.fichier(ecrireTemp(sync().sql));
    expect(b.sql("select status from vis.window")).toBe("done");
  });
});
