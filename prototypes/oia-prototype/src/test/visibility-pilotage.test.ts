import { describe, expect, it, vi } from "vitest";
import {
  acquitterAlerte, ajouterProposition, annulerFenetre, declarerExecution, demanderSite,
  demainIso, dollars, fixerPlafond, gesteVisibility, goFenetre, goReconnaissance,
  modifierProposition, proprietesRapport, raisonGo, relancerDemande, validerConcurrents,
  validerFaits, validerPanel, validerRapport, type ClientRpc, type LignePilotage,
} from "@/lib/donnees/visibility-pilotage";

function client() {
  const rpc = vi.fn().mockResolvedValue({ data: "ok", error: null });
  return { rpc, client: { rpc } as unknown as ClientRpc };
}
const ligne = <T,>(valeur: Partial<T>): T => valeur as T;

describe("gestes Visibility v2", () => {
  it("chaque action appelle sa fonction avec les paramètres exacts", async () => {
    const cas: [(c: ClientRpc) => Promise<unknown>, string, Record<string, unknown>][] = [
      [(c) => demanderSite({ p_url: "https://exemple.fr", p_nom: "Marque", p_langues: ["fr"], p_marches: ["FR"], p_client_id: "client", p_client_nom: "" }, c), "vis_demander_site", { p_url: "https://exemple.fr", p_nom: "Marque", p_langues: ["fr"], p_marches: ["FR"], p_client_id: "client", p_client_nom: "" }],
      [(c) => modifierProposition({ p_id: "s:fait:1", p_contenu: { enonce: "Fait", categorie: "offre" } }, c), "vis_modifier_proposition", { p_id: "s:fait:1", p_contenu: { enonce: "Fait", categorie: "offre" } }],
      [(c) => ajouterProposition({ p_subject: "s", p_nature: "fait", p_contenu: { enonce: "Fait" } }, c), "vis_ajouter_proposition", { p_subject: "s", p_nature: "fait", p_contenu: { enonce: "Fait" } }],
      [(c) => validerFaits({ p_subject: "s", p_ids: ["a"], p_rejetes: ["b"] }, c), "vis_valider_faits", { p_subject: "s", p_ids: ["a"], p_rejetes: ["b"] }],
      [(c) => validerPanel({ p_subject: "s", p_ids: ["q"] }, c), "vis_valider_panel", { p_subject: "s", p_ids: ["q"] }],
      [(c) => validerConcurrents({ p_subject: "s", p_ids: ["c"], p_homonymes: ["h"] }, c), "vis_valider_concurrents", { p_subject: "s", p_ids: ["c"], p_homonymes: ["h"] }],
      [(c) => goReconnaissance({ p_subject: "s", p_cout_vu_usd: 12.34 }, c), "vis_go_reconnaissance", { p_subject: "s", p_cout_vu_usd: 12.34 }],
      [(c) => goFenetre({ p_subject: "s", p_debut: "2026-11-18", p_cout_vu_usd: 25 }, c), "vis_go_fenetre", { p_subject: "s", p_debut: "2026-11-18", p_cout_vu_usd: 25 }],
      [(c) => annulerFenetre({ p_window: "s-j0", p_motif: "Arrêt demandé" }, c), "vis_annuler_fenetre", { p_window: "s-j0", p_motif: "Arrêt demandé" }],
      [(c) => validerRapport({ p_page: "page" }, c), "vis_valider_rapport", { p_page: "page" }],
      [(c) => declarerExecution({ p_recommandation: "r", p_preuve: "abc123", p_date: "2026-11-16", p_note: "Fait" }, c), "vis_declarer_execution", { p_recommandation: "r", p_preuve: "abc123", p_date: "2026-11-16", p_note: "Fait" }],
      [(c) => fixerPlafond({ p_client: "client", p_plafond_usd: 30 }, c), "vis_fixer_plafond", { p_client: "client", p_plafond_usd: 30 }],
      [(c) => relancerDemande({ p_demande: "d" }, c), "vis_relancer_demande", { p_demande: "d" }],
      [(c) => acquitterAlerte({ p_alerte: "a" }, c), "vis_acquitter_alerte", { p_alerte: "a" }],
    ];
    for (const [appel, nom, params] of cas) {
      const c = client();
      await appel(c.client);
      expect(c.rpc).toHaveBeenCalledWith(nom, params);
    }
  });

  it("transmet les noms et paramètres sans transformation", async () => {
    const c = client();
    await gesteVisibility("vis_go_fenetre", { p_subject: "coach", p_debut: "2026-11-18", p_cout_vu_usd: 42.5 }, c.client);
    await gesteVisibility("vis_valider_recommandation", { p_recommandation: "r1" }, c.client);
    await gesteVisibility("vis_rejeter_recommandation", { p_recommandation: "r2", p_motif: "Non retenu" }, c.client);
    expect(c.rpc).toHaveBeenNthCalledWith(1, "vis_go_fenetre", { p_subject: "coach", p_debut: "2026-11-18", p_cout_vu_usd: 42.5 });
    expect(c.rpc).toHaveBeenNthCalledWith(2, "vis_valider_recommandation", { p_recommandation: "r1" });
    expect(c.rpc).toHaveBeenNthCalledWith(3, "vis_rejeter_recommandation", { p_recommandation: "r2", p_motif: "Non retenu" });
  });

  it("conserve le code et le message de refus de la base", async () => {
    const c = client(); c.rpc.mockResolvedValue({ data: null, error: { code: "22023", message: "estimation changée, recharger" } });
    await expect(goReconnaissance({ p_subject: "s", p_cout_vu_usd: 10 }, c.client)).rejects.toMatchObject({ code: "22023", message: "estimation changée, recharger" });
  });
});

describe("garde-fous du cockpit", () => {
  it("refuse le GO sans plafond et au plafond atteint", () => {
    expect(raisonGo(undefined, 10)).toContain("Plafond mensuel non fixé");
    expect(raisonGo(ligne<LignePilotage<"vis_budget_v2">>({ etat: "non_fixe", plafond_usd: null }), 10)).toContain("Plafond mensuel non fixé");
    expect(raisonGo(ligne<LignePilotage<"vis_budget_v2">>({ etat: "ok", plafond_usd: 30, plafond_global_usd: null }), 10)).toContain("Plafond global");
    expect(raisonGo(ligne<LignePilotage<"vis_budget_v2">>({ etat: "atteint", plafond_usd: 30, plafond_global_usd: 100 }), 10)).toContain("atteint");
  });
  it("refuse un coût supérieur au plafond restant et accepte un coût couvert", () => {
    const budget = ligne<LignePilotage<"vis_budget_v2">>({ etat: "ok", plafond_usd: 30, plafond_global_usd: 100, reel_usd: 10, engage_usd: 5 });
    expect(raisonGo(budget, 16)).toContain("supérieure");
    expect(raisonGo(budget, 15)).toBeNull();
  });
  it("isole le HTML sans aucune capacité de script", () => {
    const props = proprietesRapport("<script>window.evil=true</script><h1>Rapport</h1>");
    expect(props.sandbox).toBe("");
    expect(props.srcDoc).toContain("Rapport");
    expect(props).not.toHaveProperty("allow");
    expect(props).not.toHaveProperty("allowScripts");
  });
  it("fixe le début au plus tôt demain et formate les montants", () => {
    expect(demainIso(new Date("2026-11-16T23:30:00Z"))).toBe("2026-11-17");
    expect(dollars(12.5)).toBe("12,50 $");
    expect(dollars(null)).toBe("Non mesurable");
  });
});
