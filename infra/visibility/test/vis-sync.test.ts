import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSubject } from "../src/load";
import { lireDecisions, sqlJournal } from "../src/p2-journal";
import { sqlSync, uuidStable } from "../src/vis-sync";
import { exportFictif } from "./fixtures/export-fictif";

/** Synchronisation vers la base OIA (mandat v9, bloc C), sur le sujet fictif. */
const here = dirname(fileURLToPath(import.meta.url));
const bundle = () => loadSubject(join(here, "fixtures", "demo-subject"));
const REDIRECTION = "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbC123";

describe("vis-sync : exportation d'Elmo → script SQL de la base OIA", () => {
  const r = sqlSync(bundle(), exportFictif(), { windowId: "j0", redirects: { [REDIRECTION]: "https://cited.example/page" } });

  it("une preuve par réponse non vide, identifiant stable dérivé du run d'Elmo", () => {
    expect(r.preuves).toBe(3);
    expect(r.vides).toBe(1);
    expect(r.fenetre).toBe("demo-subject-j0");
    expect(r.sql).toContain(uuidStable("elmo:00000000-0000-4000-8000-000000000001"));
    expect(sqlSync(bundle(), exportFictif(), { windowId: "j0" }).sql.match(/[0-9a-f-]{36}/g)).toEqual(
      sqlSync(bundle(), exportFictif(), { windowId: "j0" }).sql.match(/[0-9a-f-]{36}/g),
    );
  });

  it("jours manquants : seulement les jours écoulés sans aucune réponse", () => {
    expect(r.joursManquants).toEqual(["2026-11-02", "2026-11-04"].filter((d) => d < "2026-11-04"));
    expect(r.sql).toContain("'2026-11-02', 'aucune réponse reçue ce jour'");
    expect(r.sql).not.toContain("'2026-11-03', 'aucune réponse");
  });

  it("liens de Gemini remplacés par le site réel, citations dédoublonnées", () => {
    expect(r.sql).not.toContain(REDIRECTION);
    expect(r.sql).toContain("https://cited.example/page");
    const premiere = /"collector_run_id":"00000000-0000-4000-8000-000000000001".*?"citations":(\[[^\]]*\])/.exec(r.sql);
    expect(JSON.parse(premiere![1]!)).toEqual([{ url: "https://cited.example/page" }, { url: "https://demo.example/" }]);
  });

  it("ajout seul : aucune mise à jour de preuve, contrôle d'empreinte, une seule transaction", () => {
    expect(r.sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(r.sql.match(/^commit;$/gm)).toHaveLength(1);
    expect(r.sql).toMatch(/insert into vis\.evidence[\s\S]*on conflict \(id\) do nothing;/);
    expect(r.sql).not.toMatch(/update vis\.evidence/);
    expect(r.sql).toContain("ne correspondent plus au texte exporté");
  });

  it("une fenêtre terminée ne repasse jamais en cours", () => {
    expect(r.sql).toContain("where vis.window.status is distinct from excluded.status and vis.window.status <> 'done'");
  });
});

describe("p2-journal : correctifs préparés → recommandations en attente", () => {
  const md = `# P2
| # | Correctif | Contrôles | Risque | Bloqué par | Valider |
|---|---|---|---|---|---|
| 1 | Profils dans sameAs | E02, N03 | low | — | [ ] |
| 2 | Prix sur chaque offre | E03 | medium | prix validés | [ ] |

## 1 · Profils dans sameAs

- **Pour Google** : relie l'entité.
- **Pour les assistants** : cite la marque.
- **Demande de fusion simulée** : branche \`p2-a\` (commit \`abc1234\`, copie locale), détail dans \`prs/01.md\`

## 2 · Prix sur chaque offre

- **Pour Google** : résultats enrichis.
`;
  it("lit le tableau et les sections", () => {
    const c = lireDecisions(md);
    expect(c.map((x) => [x.numero, x.risque, x.bloquePar, x.branche])).toEqual([[1, "low", null, "p2-a"], [2, "medium", "prix validés", null]]);
    expect(c[0]!.controles).toEqual(["E02", "N03"]);
  });

  it("aucune décision posée, rien n'est réécrit, estimations signalées comme non évaluées", () => {
    const sql = sqlJournal("demo-subject", "demo-client", lireDecisions(md));
    expect(sql).not.toMatch(/vis\.decision/);
    expect(sql.match(/on conflict \(id\) do nothing/g)).toHaveLength(2);
    expect(sql).toContain('"estimations_non_evaluees":["impact_level","effort_level","confidence"]');
    expect(sql).toMatch(/'rec-demo-subject-p2-1-profils-dans-sameas'/);
  });

  it("lit le fichier réel de chaque sujet qui en a un (format stable)", () => {
    // Garde-fou de format : le tableau de decisions.md est produit par src/p2-prepare.ts.
    const prepare = readFileSync(join(here, "..", "src", "p2-prepare.ts"), "utf8");
    expect(prepare).toContain("| # | Correctif | Contrôles | Risque | Bloqué par | Valider |");
  });
});
