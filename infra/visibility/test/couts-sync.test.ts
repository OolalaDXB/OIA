import { describe, expect, it } from "vitest";
import { journalParMois, lignes, lireRapportVeille, sqlCouts, type ElmoRun, type Entrees } from "../src/couts-sync.js";
import type { SubjectBundle } from "../src/schema.js";

/** Dépenses d'IA vers la base OIA (0009) : données fictives, aucune base. */
const sujet = {
  subject: { id: "demo-subject" },
  measurement: {
    windows: [
      { id: "j0", status: "running", start: "2026-11-07", days: 5, targets: ["claude:anthropic-api:claude-sonnet-5-5:online", "perplexity:openrouter:perplexity/sonar:online"] },
      { id: "j1", status: "planned", start: "2026-11-20", days: 5, targets: ["claude:anthropic-api:claude-sonnet-5-5:online"] },
    ],
  },
} as unknown as SubjectBundle;

const run = (over: Partial<ElmoRun>): ElmoRun => ({
  brand: "demo-subject", model: "claude", provider: "anthropic-api", version: "claude-sonnet-5-5", webSearch: false,
  usage: { input_tokens: 1_000_000, output_tokens: 0 }, searchItems: 0, month: "2026-11-01", ...over,
});
const journal = [
  "utc_time,month_utc,elmo_estimate_usd,grid_usd,openrouter_cum_usd,manual_usd,retained_usd,cap_usd,alert_usd,action",
  "2026-11-07T15:27:32Z,2026-11,0,0.0000,0,0,1.0000,30,24,none",
  "2026-11-08T15:27:32Z,2026-11,0,n/a,n/a,n/a,n/a,30,24,check-only(cost-unreadable)",
  "2026-11-08T16:27:32Z,2026-11,0,0.0000,0,0,24.0000,30,24,none",
].join("\n");
const entrees = (over: Partial<Entrees> = {}): Entrees => ({
  now: "2026-11-08T12:00:00Z",
  journal,
  elmo: { brands: [{ id: "demo-subject", enabledModels: ["claude", "perplexity", "grok"], promptsEnabled: 10 }], runs: [run({}), run({ usage: { input_tokens: 3_000_000, output_tokens: 0 } })] },
  veille: [
    { date: "2026-11-02T06:35:26Z", appels: 93, jetonsEntree: 1_000_000, jetonsSortie: 0 },
  ],
  ...over,
});

describe("dépenses d'IA vers la base OIA (couts-sync)", () => {
  it("garde le dernier relevé lisible du garde-fou par mois", () => {
    expect(journalParMois(journal).get("2026-11-01")).toEqual({ retenu: 24, plafond: 30, seuil: 24 });
  });

  it("estime chaque cible suivie avec la grille, sans coût retenu par modèle", () => {
    const ls = lignes(entrees(), [sujet]);
    const claude = ls.find((l) => l.assistant === "claude")!;
    // 2 $ par M de jetons d'entrée : runs à 2 $ et 6 $, moyenne 4 $ ; 5 jours × 10 questions (j1 est seulement prévue).
    expect(claude).toMatchObject({ fournisseur: "anthropic", voie_acces: "api_directe", nb_reponses: 2, nb_reponses_prevues: 50, cout_estime_par_reponse_usd: 4, cout_estime_mois_usd: 200, cout_retenu_mois_usd: null, statut_comptage: "compte" });
    expect(ls.find((l) => l.assistant === "perplexity")).toMatchObject({ voie_acces: "openrouter", fournisseur: "openrouter", nb_reponses: 0, cout_estime_mois_usd: null });
    expect(ls.find((l) => l.assistant === "grok")).toMatchObject({ suivi: false, statut_comptage: "non_compte", cout_estime_mois_usd: null });
  });

  it("porte le coût retenu sur une ligne agrégée ; alerte strictement au-delà du seuil", () => {
    const ls = lignes(entrees(), [sujet]);
    const agregee = ls.find((l) => l.service === "elmo" && l.marque_id === null)!;
    expect(agregee).toMatchObject({ assistant: null, modele: null, voie_acces: "toutes", cout_retenu_mois_usd: 24, nb_reponses: 2, cout_estime_mois_usd: null });
    for (const l of ls.filter((x) => x.module === "visibility")) expect([l.depense_budget_mois_usd, l.plafond_mois_usd, l.alerte_budget]).toEqual([24, 30, false]);
    const audela = lignes(entrees({ journal: `${journal}\n2026-11-08T17:00:00Z,2026-11,0,0,0,0,24.01,30,24,none` }), [sujet]);
    expect(audela.find((l) => l.marque_id === null && l.service === "elmo")!.alerte_budget).toBe(true);
  });

  it("Jev reste non compté ; la veille est estimée, partielle et sans plafond", () => {
    const ls = lignes(entrees(), [sujet]);
    expect(ls.find((l) => l.service === "jev")).toMatchObject({ fournisseur: "typesafe", statut_comptage: "non_compte", cout_retenu_mois_usd: null });
    // 1 M de jetons d'entrée à 0,70 $ par run ; 5 lundis en novembre 2026.
    expect(ls.find((l) => l.service === "veille-money")).toMatchObject({ module: "money_lookup", nb_appels: 93, cout_estime_mois_usd: 3.5, plafond_mois_usd: null, statut_comptage: "partiel" });
  });

  it("un run d'un modèle absent de la grille rend la ligne partielle", () => {
    const ls = lignes(entrees({ elmo: { brands: [{ id: "demo-subject", enabledModels: [], promptsEnabled: 10 }], runs: [run({}), run({ version: "claude-inconnu" })] } }), [sujet]);
    expect(ls.find((l) => l.assistant === "claude")).toMatchObject({ statut_comptage: "partiel", version: "non renseignée", cout_estime_par_reponse_usd: 2 });
  });

  it("lit les deux formats de rapport de la veille", () => {
    expect(lireRapportVeille("- model calls: 12 · tokens in/out: 68631/39399")).toEqual({ appels: 12, jetonsEntree: 68631, jetonsSortie: 39399 });
    expect(lireRapportVeille("- appels modèle / model calls: 81 · tokens 42673/16588")).toEqual({ appels: 81, jetonsEntree: 42673, jetonsSortie: 16588 });
    expect(lireRapportVeille("# rien")).toBeNull();
  });

  it("le script remplace les mois couverts, service par service, en une transaction, sans jamais écrire money-match ni shyrka", () => {
    const sql = sqlCouts(lignes(entrees(), [sujet]), "2026-11-08T12:00:00Z");
    expect(sql.split("\n")[1]).toBe("begin;");
    expect(sql.trim().endsWith("commit;")).toBe(true);
    expect(sql).toMatch(/delete from public\.oia_ia_cout where espace_id = '[0-9a-f-]+' and mois = '2026-11-01' and service = 'elmo';/);
    expect(sql).not.toMatch(/'money-match'|'shyrka'/);
    expect(sql).toContain("pour l''alias mistral-large-latest");
  });
});
