import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { demarrer, ecrireTemp, erreur, postgresDisponible, type Banc } from "./pg/banc";
import { loadSubject } from "../../../infra/visibility/src/load";
import { sqlComparaison, sqlSync } from "../../../infra/visibility/src/vis-sync";
import { comparaisonFictive, exportFictifJ1, sujetAvecJ1 } from "../../../infra/visibility/test/fixtures/export-fictif-j1";
import { exportFictif } from "../../../infra/visibility/test/fixtures/export-fictif";

/**
 * Mandat v13, bloc F : vis-sync sur une deuxième fenêtre (j1 fictive) après
 * J0, puis 0010 (contrat v2, proposée) appliquée par-dessus, sur un Postgres
 * jetable. Sujet, exportations et comparaison fictifs.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const MEMBRE = "00000000-0000-4000-8000-00000000de00";
const AUTRE = "00000000-0000-4000-8000-00000000de01";

let b: Banc;
const en = { role: "authenticated", utilisateur: MEMBRE };
const j0 = (exp = exportFictif()) => sqlSync(loadSubject(chemin("../../../infra/visibility/test/fixtures/demo-subject")), exp, { windowId: "j0" });
const j1 = (exp = exportFictifJ1()) => sqlSync(sujetAvecJ1(), exp, { windowId: "j1" });
const empreintes = () => b.sql("select string_agg(id::text || window_id || encode(raw_sha256, 'hex'), ',' order by id) from vis.evidence");

describe.skipIf(!postgresDisponible)("vis-sync : deuxième fenêtre, puis contrat v2 (0010), sur Postgres jetable", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    b.fichier(chemin("../supabase/migrations/0006_visibility_vues.sql"));
    b.fichier(ecrireTemp(j0().sql));
    b.sql(`insert into vis.client_member (user_id, client_id, role) values ('${MEMBRE}', 'demo-subject', 'owner')`);
  });
  afterAll(() => b?.arreter());

  it("j1 synchronisée après j0 : ses seules preuves, j0 intacte, les vues v1 montrent les deux fenêtres", () => {
    const avant = empreintes();
    b.fichier(ecrireTemp(j1().sql));
    expect(b.sql("select string_agg(window_id || ':' || n, ',' order by window_id) from (select window_id, count(*) n from vis.evidence group by window_id) t"))
      .toBe("demo-subject-j0:3,demo-subject-j1:2");
    for (const ligne of avant.split(",")) expect(empreintes()).toContain(ligne);
    expect(b.sql("select string_agg(id || '|' || kind, ',' order by id) from vis.window")).toBe("demo-subject-j0|baseline,demo-subject-j1|follow-up");
    expect(b.sql("select string_agg(window_id || '|' || jours_mesures || '|' || reponses, ',' order by window_id) from vis_mesure_v1", en))
      .toBe("demo-subject-j0|2|3,demo-subject-j1|2|2");
    expect(b.sql("select string_agg(window_id::text || '|' || missing_on, ',' order by window_id, missing_on) from vis.window_missing_day"))
      .toBe("demo-subject-j0|2026-11-02,demo-subject-j1|2026-11-22");
  });

  it("rejouer j0 puis j1 : aucune preuve réécrite", () => {
    const avant = empreintes();
    b.fichier(ecrireTemp(j0().sql));
    b.fichier(ecrireTemp(j1().sql));
    expect(empreintes()).toBe(avant);
  });

  it("empreinte modifiée dans j1 : échec, rien ne change (ni la nouvelle réponse)", () => {
    const avant = empreintes();
    const exp = exportFictifJ1();
    exp.runs.at(-1)!.text = "Texte réécrit après coup";
    exp.runs.push({ ...exp.runs.at(-1)!, id: "00000000-0000-4000-8000-000000000199", text: "Nouvelle réponse" });
    expect(erreur(b, j1(exp).sql)).toMatch(/ne correspondent plus au texte exporté/);
    expect(empreintes()).toBe(avant);
  });

  it("preuve de j0 présentée comme réponse de j1 : refus", () => {
    const avant = empreintes();
    const exp = exportFictifJ1();
    // Le run 1 de J0, daté dans J1 (exportation incohérente) : même identifiant, autre fenêtre.
    exp.runs.push({ ...exportFictif().runs[0]!, createdAt: "2026-11-21T10:00:00Z" });
    expect(erreur(b, j1(exp).sql)).toMatch(/appartiennent à une autre fenêtre/);
    expect(empreintes()).toBe(avant);
  });

  describe("0010 appliquée par-dessus", () => {
    const comparaison = JSON.stringify(comparaisonFictive(), null, 2);
    beforeAll(() => {
      b.fichier(chemin("../supabase/migrations/0010_visibility_vues_v2.sql"));
    });

    it("les vues v1 ne changent pas ; v2 les prolonge", () => {
      expect(b.sql("select count(*) from vis_mesure_v1", en)).toBe("2");
      expect(b.sql("select string_agg(window_id || '|' || rang_fenetre || '|' || coalesce(fenetre_reference, '-'), ',' order by window_id) from vis_mesure_v2", en))
        .toBe("demo-subject-j0|1|-,demo-subject-j1|2|-");
    });

    it("comparaison : ajoutée une fois, rejouable, lue par le membre seul", () => {
      const c = sqlComparaison(comparaison);
      b.fichier(ecrireTemp(c.sql));
      b.fichier(ecrireTemp(c.sql));
      expect(b.sql("select count(*) from vis_ui.comparaison")).toBe("1");
      expect(b.sql("select window_id || '|' || fenetre_reference || '|' || verdict_non_marque || '|' || verdict_marque || '|' || derniere || '|' || empreinte from vis_comparaisons_v2", en))
        .toBe(`demo-subject-j1|demo-subject-j0|pas de changement démontrable|hausse|true|${c.empreinte}`);
      expect(b.sql("select fenetre_reference || '|' || verdict_non_marque from vis_mesure_v2 where window_id = 'demo-subject-j1'", en))
        .toBe("demo-subject-j0|pas de changement démontrable");
      expect(b.sql("select string_agg(famille || ':' || moteur || ':' || reference_moyenne || ':' || courante_borne_haute || ':' || fragile, ',' order by ordre, moteur) from vis_comparaison_moteurs_v2", en))
        .toBe("non_marquee:chatgpt:0.1:0.18:true,non_marquee:tous:0.1:0.18:false,marquee:chatgpt:0.1:0.18:true,marquee:tous:0.1:0.18:false");
      expect(b.sql("select count(*) from vis_comparaisons_v2", { role: "authenticated", utilisateur: AUTRE })).toBe("0");
      expect(erreur(b, "select count(*) from vis_comparaisons_v2", { role: "anon" })).toMatch(/permission denied/);
    });

    it("comparaison en ajout seul : ni modification ni suppression, même par le propriétaire", () => {
      expect(erreur(b, "update vis_ui.comparaison set verdict_non_marque = 'hausse'")).toMatch(/ajout seul/);
      expect(erreur(b, "delete from vis_ui.comparaison")).toMatch(/ajout seul/);
      expect(erreur(b, "truncate vis_ui.comparaison")).toMatch(/ajout seul/);
      expect(erreur(b, "insert into vis_ui.comparaison (id) values (gen_random_uuid())", en)).toMatch(/permission denied/);
    });

    it("comparaison refaite (nouvelles preuves) : nouvelle ligne, la plus récente fait foi", () => {
      const refaite = comparaisonFictive();
      refaite.provenance.current = { evidenceCount: 4, digest: "c".repeat(64) };
      refaite.unbranded.total.verdict = "hausse";
      b.fichier(ecrireTemp(sqlComparaison(JSON.stringify(refaite)).sql));
      expect(b.sql("select count(*) || '|' || count(*) filter (where derniere) from vis_comparaisons_v2", en)).toBe("2|1");
      expect(b.sql("select verdict_non_marque from vis_mesure_v2 where window_id = 'demo-subject-j1'", en)).toBe("hausse");
    });

    it("comparaison d'une fenêtre absente : refus, rien n'est ajouté", () => {
      expect(erreur(b, sqlComparaison(JSON.stringify({ ...comparaisonFictive(), windowId: "j2" })).sql)).toMatch(/absentes de la base/);
      expect(b.sql("select count(*) from vis_ui.comparaison")).toBe("2");
    });

    it("fenêtre qui mesure une exécution : du même sujet seulement, en ajout seul, dans vis_recommandations_v2", () => {
      b.sql(`insert into vis.recommendation (id, client_id, subject_id, type, title, statement, impact_level, effort_level, risk, confidence, created_by, payload)
             values ('rec-demo-1', 'demo-subject', 'demo-subject', 'TECH_FIX', 'robots', 'fictif', 'medium', 'XS', 'low', 'high', 'test', '{}');
             insert into vis.execution (recommendation_id, client_id, kind, ref) values ('rec-demo-1', 'demo-subject', 'commit', 'abc1234');`);
      const x = b.sql("select id from vis.execution where recommendation_id = 'rec-demo-1'");
      b.sql(`insert into vis_ui.execution_mesure (execution_id, client_id, measured_by_window, declared_by) values (${x}, 'demo-subject', 'demo-subject-j1', 'Mickaël')`);
      expect(b.sql("select id || '|' || mesuree_par_fenetre from vis_recommandations_v2", en)).toBe("rec-demo-1|demo-subject-j1");
      expect(b.sql("select count(*) from vis_recommandations_v1", en)).toBe("1");
      expect(erreur(b, "update vis_ui.execution_mesure set measured_by_window = 'demo-subject-j0'")).toMatch(/ajout seul/);
      // Fenêtre d'un autre sujet du même client : refusée.
      b.sql(`insert into vis.subject (id, client_id, status) values ('autre-sujet', 'demo-subject', 'active');
             insert into vis.window (id, subject_id, client_id, kind, panel_version, status) values ('autre-sujet-j0', 'autre-sujet', 'demo-subject', 'baseline', 1, 'planned');`);
      expect(erreur(b, `insert into vis_ui.execution_mesure (execution_id, client_id, measured_by_window, declared_by) values (${x}, 'demo-subject', 'autre-sujet-j0', 'Mickaël')`))
        .toMatch(/clients ou de sujets différents/);
    });
  });
});
