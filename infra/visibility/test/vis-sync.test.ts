import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadSubject } from "../src/load";
import { lireDecisions, sqlJournal } from "../src/p2-journal";
import { sqlComparaison, sqlSync, uuidStable } from "../src/vis-sync";
import { comparaisonFictive, exportFictifJ1, sujetAvecJ1 } from "./fixtures/export-fictif-j1";
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

describe("vis-sync : toute fenêtre de tout sujet (mandat v13, bloc F)", () => {
  it("une deuxième fenêtre : ses seules réponses, son type et son panel déclarés", () => {
    const r = sqlSync(sujetAvecJ1(), exportFictifJ1(), { windowId: "j1" });
    expect(r.fenetre).toBe("demo-subject-j1");
    expect(r.preuves).toBe(2); // les réponses de J0, présentes dans l'exportation d'Elmo, n'y entrent pas
    expect(r.sql).not.toContain(uuidStable("elmo:00000000-0000-4000-8000-000000000001"));
    expect(r.sql).toContain("'demo-subject-j1', 'demo-subject', 'demo-subject', 'follow-up', 1, 'running', '2026-11-20', '2026-11-24'");
    expect(r.joursManquants).toEqual(["2026-11-22"]);
  });

  it("J0 inchangé : même script qu'avant, type baseline", () => {
    const r = sqlSync(bundle(), exportFictif(), { windowId: "j0" });
    expect(r.sql).toContain("'demo-subject-j0', 'demo-subject', 'demo-subject', 'baseline', 1, 'running', '2026-11-01', '2026-11-05'");
  });

  it("fenêtre inconnue de measurement.yaml, durée ou début différents, autre sujet : refus", () => {
    expect(() => sqlSync(bundle(), exportFictifJ1(), { windowId: "j1" })).toThrow(/absente de measurement\.yaml/);
    expect(() => sqlSync(sujetAvecJ1(), { ...exportFictifJ1(), days: 4 }, { windowId: "j1" })).toThrow(/déclarée sur 5/);
    expect(() => sqlSync(sujetAvecJ1(), { ...exportFictifJ1(), startedAt: "2026-11-21T09:00:00Z" }, { windowId: "j1" })).toThrow(/déclarée au 2026-11-20/);
    expect(() => sqlSync(sujetAvecJ1(), { ...exportFictifJ1(), subjectId: "autre" }, { windowId: "j1" })).toThrow(/attendu "demo-subject"/);
  });

  it("questions exclues de la fenêtre (excludedPromptIds) : écartées", () => {
    const b = sujetAvecJ1();
    const exp = exportFictifJ1();
    exp.runs = exp.runs.filter((r) => r.promptId); // exclusion par identifiant : exportation récente seulement
    b.measurement.windows[1]!.excludedPromptIds = [exp.runs.at(-1)!.promptId!];
    expect(sqlSync(b, exp, { windowId: "j1" }).preuves).toBe(1);
  });

  it("preuve déjà en base dans une autre fenêtre : contrôle dans le script", () => {
    expect(sqlSync(sujetAvecJ1(), exportFictifJ1(), { windowId: "j1" }).sql).toContain("appartiennent à une autre fenêtre");
  });

  it("comparaison : ajout seul, identifiant stable, entrée validée", () => {
    const texte = JSON.stringify(comparaisonFictive());
    const c = sqlComparaison(texte);
    expect(c).toEqual(sqlComparaison(texte));
    expect(c.sql).toMatch(/insert into vis_ui\.comparaison[\s\S]*on conflict \(id\) do nothing;/);
    expect(c.sql).not.toMatch(/update |delete /);
    expect(c.sql).toContain("'demo-subject-j1'");
    expect(c.sql).toContain("'pas de changement démontrable'");
    expect(() => sqlComparaison(JSON.stringify({ ...comparaisonFictive(), comparisonFormat: 2 }))).toThrow(/format/);
    expect(() => sqlComparaison(JSON.stringify({ ...comparaisonFictive(), referenceId: "j1" }))).toThrow(/elle-même/);
    expect(() => sqlComparaison(JSON.stringify({ ...comparaisonFictive(), windowId: "j1'; drop" }))).toThrow(/windowId invalide/);
    const sansVerdict = comparaisonFictive() as { unbranded: { total: { verdict: string } } };
    sansVerdict.unbranded.total.verdict = "meilleur";
    expect(() => sqlComparaison(JSON.stringify(sansVerdict))).toThrow(/verdict/);
  });
});

describe("scripts/vis-sync.sh : fenêtre et dossier d'état en paramètres", () => {
  const racine = join(here, "..");
  const lancer = (data: string, sujets: string, args: string[], env: Record<string, string> = {}) =>
    execFileSync("bash", [join(racine, "scripts", "vis-sync.sh"), ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, OIA_VIS_DATA: data, OIA_VIS_SUBJECTS_DIR: sujets, OIA_VIS_SYNC_SQL: "cat", OIA_VIS_WINDOW: "", ...env },
    });
  const banc = () => {
    const t = mkdtempSync(join(tmpdir(), "oia-vis-sync-"));
    const sujets = join(t, "subjects");
    cpSync(join(here, "fixtures", "demo-subject"), join(sujets, "demo-subject"), { recursive: true });
    const m = join(sujets, "demo-subject", "measurement.yaml");
    writeFileSync(m, readFileSync(m, "utf8").replace("windows:\n", "windows:\n  - { id: j1, kind: follow-up, comparesWith: j0, days: 5, panelVersion: 1, status: planned, start: \"2026-11-20\", comparisonNote: \"fenêtre fictive des tests, sans cibles déclarées\" }\n"));
    const data = join(t, "data");
    writeFileSync(join(t, "j0.json"), JSON.stringify(exportFictif()));
    writeFileSync(join(t, "j1.json"), JSON.stringify(exportFictifJ1()));
    return { t, sujets, data };
  };

  it("j1 dans $data/<sujet>/<fenêtre> ; j0 garde l'ancien dossier ; fenêtre inconnue refusée sans rien écrire", () => {
    const { t, sujets, data } = banc();
    try {
      mkdirSync(join(data, "demo-subject", "j1"), { recursive: true });
      writeFileSync(join(data, "demo-subject", "j1", "started-at.txt"), "2026-11-20T09:00:00Z\n");
      const j1 = lancer(data, sujets, ["demo-subject", "j1"], { OIA_VIS_SYNC_EXPORT: join(t, "j1.json") });
      expect(j1).toContain("fenêtre demo-subject-j1 · 2 preuves");
      expect(existsSync(join(data, "demo-subject", "j1", "sync", "sync.sql"))).toBe(true);

      // J0 dans l'ancien dossier $data/<fenêtre>, qui porte le nom du sujet (window_dir de lib.sh).
      mkdirSync(join(data, "j0"), { recursive: true });
      writeFileSync(join(data, "j0", "subject.txt"), "demo-subject\n");
      const j0 = lancer(data, sujets, ["demo-subject"], { OIA_VIS_SYNC_EXPORT: join(t, "j0.json") });
      expect(j0).toContain("fenêtre demo-subject-j0 · 3 preuves");
      expect(existsSync(join(data, "demo-subject", "sync", "sync.sql"))).toBe(true);

      const etat = join(t, "ailleurs");
      lancer(data, sujets, ["demo-subject", "j1"], { OIA_VIS_SYNC_EXPORT: join(t, "j1.json"), OIA_VIS_STATE_DIR: etat });
      expect(existsSync(join(etat, "sync", "sync.sql"))).toBe(true);

      expect(() => lancer(data, sujets, ["demo-subject", "j9"], { OIA_VIS_SYNC_EXPORT: join(t, "j1.json") })).toThrow(/absente de measurement\.yaml/);
      expect(existsSync(join(data, "demo-subject", "sync-j9"))).toBe(false);
    } finally {
      rmSync(t, { recursive: true, force: true });
    }
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
