import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VueIndexation } from "@/components/oia/visibility-hygiene";
import { entreeActive, entreesSite } from "@/components/oia/visibility";
import { demanderHygiene, type ClientRpc } from "@/lib/donnees/visibility-pilotage";
import { badgeOrigine, libelleTypeDemande, type PlanActionV3 } from "@/lib/donnees/visibility-plan";
import {
  controlesHygiene, delaiSuiviHygiene, demandeHygieneActive, hygieneDemo, scoreIndexation, trierControlesHygiene,
  type HygieneV3,
} from "@/lib/donnees/visibility-hygiene";
import type { DemandeV2 } from "@/lib/donnees/visibility-v3";

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
const contexte = vi.hoisted(() => ({
  hygiene: undefined as HygieneV3 | undefined,
  demandes: [] as DemandeV2[],
  connecte: true,
  executer: vi.fn(),
  refetch: vi.fn(),
  refetchGlobal: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: contexte.hygiene ? [contexte.hygiene] : [], isPending: false, error: null, refetch: contexte.refetch }),
}));
vi.mock("@/lib/oia-auth", () => ({ useOiaAuth: () => ({ user: contexte.connecte ? { id: "user-1" } : null, loading: false }) }));
vi.mock("@/lib/donnees/visibility-v3-provider", () => ({
  useVisibilityV3: () => ({ connecte: contexte.connecte, query: { isPending: false, error: null } }),
}));
vi.mock("@/lib/donnees/provider", () => ({ useSelectionVisibility: () => ({ sujetId: "coach-gari" }) }));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useVisibilityPilotage: () => ({ global: { demandes: contexte.demandes }, globalQuery: { refetch: contexte.refetchGlobal } }),
  useGesteVisibility: () => ({ executer: contexte.executer, enCours: false, erreur: null }),
}));

const hygieneBase: HygieneV3 = {
  subject_id: "coach-gari", analyse_id: "analyse-1", url: "https://coachgari.com", recu_le: "2026-11-17T09:30:00Z",
  scores: { indexation: 0.82 }, ecarts_ouverts: 1,
  metriques: {
    controles: [
      { id: "ok", titre: "Sitemap lisible", ok: true, valeur: "47 adresses", gravite: "mineur", preuve: {} },
      { id: "null", titre: "Canonique non mesuré", ok: null, valeur: null, gravite: "important", preuve: {} },
      { id: "ko", titre: "Page en noindex", ok: false, valeur: "1 page", gravite: "critique", preuve: { pages: ["https://coachgari.com/stages"] } },
    ],
    bing: {
      site: "https://coachgari.com", verifie: true,
      feeds: [{ url: "https://coachgari.com/sitemap.xml", statut: "SUCCESS", dernier_passage: "2026-11-17T08:00:00Z", adresses: 47 }],
      problemes: { total: 1, exemples: ["Page stages · noindex"] },
      exploration: { pages_explorees: 52, pages_indexees: 44 },
      requetes: [{ requete: "coach gari", impressions: 96, clics: 31, position: 1.2 }, { requete: "coaching independant", impressions: 184, clics: 12, position: 8.4 }],
    },
    actions: [{ action: "Sitemap soumis à Bing", cible: "https://coachgari.com/sitemap.xml", resultat: "Sitemap soumis à Bing le 17 nov." }],
  },
};

beforeEach(() => {
  contexte.hygiene = hygieneBase;
  contexte.demandes = [];
  contexte.connecte = true;
  contexte.executer.mockReset().mockResolvedValue("demande-1");
  contexte.refetch.mockReset().mockResolvedValue(undefined);
  contexte.refetchGlobal.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("score et contrôles d'indexation", () => {
  it("conserve les états ok, ko et null, puis met les écarts graves en premier", () => {
    const controles = controlesHygiene(hygieneBase);
    expect(controles.map((c) => c.ok)).toEqual([true, null, false]);
    expect(trierControlesHygiene(controles).map((c) => c.id)).toEqual(["ko", "null", "ok"]);
    expect(scoreIndexation(hygieneBase)).toBe(82);
    expect(scoreIndexation(ligne<HygieneV3>({ ...hygieneBase, scores: {} }))).toBeNull();

    const vue = render(<VueIndexation />);
    expect(vue.getByRole("img", { name: "Score 82 sur 100" })).toBeInTheDocument();
    const lignes = vue.container.querySelectorAll("details summary");
    expect(lignes[0]).toHaveTextContent("Page en noindex");
    expect(lignes[1]).toHaveTextContent("Canonique non mesuré");
    expect(lignes[1]).toHaveTextContent("non mesuré");
    expect(lignes[2]).toHaveTextContent("✓ conforme");
    fireEvent.click(vue.getByText("Page en noindex"));
    expect(vue.getByText("https://coachgari.com/stages")).toBeInTheDocument();
  });
});

describe("lecture de Bing Webmaster Tools", () => {
  it("affiche le site vérifié, le sitemap, l'exploration, les requêtes triées et les actions OIA", () => {
    const vue = render(<VueIndexation />);
    expect(vue.getByText("Site vérifié")).toBeInTheDocument();
    expect(vue.getAllByText("https://coachgari.com/sitemap.xml").length).toBeGreaterThan(0);
    expect(vue.getByText("52")).toBeInTheDocument();
    expect(vue.getByText("44")).toBeInTheDocument();
    const tables = vue.getAllByRole("table");
    const requetes = Array.from(tables[tables.length - 1]!.querySelectorAll("tbody tr"));
    expect(requetes[0]).toHaveTextContent("coaching independant");
    expect(requetes[0]).toHaveTextContent("184");
    expect(vue.getByText("Sitemap soumis à Bing le 17 nov.")).toBeInTheDocument();
    expect(vue.getByRole("heading", { name: "Bing Webmaster Tools" }).closest("section")).toHaveTextContent("Sitemap soumis à Bing le 17 nov.");
    expect(vue.queryByText("Bientôt : branchement par compte de service.")).not.toBeInTheDocument();
  });

  it("conserve l'erreur Bing telle quelle sans inventer de statistiques", () => {
    contexte.hygiene = ligne<HygieneV3>({ ...hygieneBase, metriques: { controles: [], bing: { erreur: "Bing refuse la lecture : quota atteint" } } });
    const vue = render(<VueIndexation />);
    expect(vue.getByRole("alert")).toHaveTextContent("Bing refuse la lecture : quota atteint");
    expect(vue.getByText("Indisponible : Bing n'a pas pu être lu.")).toBeInTheDocument();
  });

  it("propose la vérification quand le site n'est pas vérifié", () => {
    contexte.hygiene = ligne<HygieneV3>({ ...hygieneBase, metriques: { controles: [], bing: { site: "https://coachgari.com", verifie: false } } });
    const vue = render(<VueIndexation />);
    expect(vue.getByText("Ajouter et vérifier le site dans Bing Webmaster Tools")).toBeInTheDocument();
    expect(vue.getByRole("link", { name: "Ouvrir Bing Webmaster Tools" })).toHaveAttribute("href", "https://www.bing.com/webmasters");
    expect(vue.getByText("Indisponible : site non vérifié dans Bing.")).toBeInTheDocument();
  });
});

const gscLu = {
  propriete: "sc-domain:maisons.co", autorisation: "siteOwner",
  sitemaps: [{ url: "https://maisons.co/sitemap.xml", envoye: "2026-11-17T08:00:00Z", lu: "2026-11-17T09:00:00Z", erreurs: 0, avertissements: 1, soumises: 47, indexees: 39 }],
  inspection: [
    { url: "https://maisons.co/", verdict: "PASS", couverture: "Envoyée et indexée", dernier_passage: "2026-11-16T10:00:00Z", canonique_google: "https://maisons.co/", canonique_site: "https://maisons.co" },
    { url: "https://maisons.co/stages", verdict: "NEUTRAL", couverture: "Exclue par la balise noindex", dernier_passage: null, canonique_google: null, canonique_site: "https://maisons.co/stages" },
    { url: "https://maisons.co/cours?a=1", verdict: "PASS", couverture: "Envoyée et indexée", dernier_passage: null, canonique_google: "https://maisons.co/cours-b", canonique_site: "https://maisons.co/cours" },
  ],
  requetes: [{ requete: "maisons", impressions: 50, clics: 9, position: 1.4 }, { requete: "maison bois", impressions: 300, clics: 4, position: 9.1 }],
};

describe("lecture de Google Search Console", () => {
  it("affiche propriété, sitemaps, pages inspectées, canonique divergente, requêtes et actions Google", () => {
    contexte.hygiene = { ...hygieneBase, gsc: gscLu, metriques: { ...(hygieneBase.metriques as object), actions: [{ action: "Sitemap soumis à Bing" }, { action: "Sitemap soumis à Google", resultat: "Sitemap soumis à Google le 17 nov." }] } };
    const vue = render(<VueIndexation />);
    const carte = vue.getByRole("heading", { name: "Google Search Console" }).closest("section")!;
    expect(carte).toHaveTextContent("sc-domain:maisons.co");
    expect(carte).toHaveTextContent("siteOwner");
    expect(carte).toHaveTextContent("47 soumises · 39 indexées");
    expect(carte).toHaveTextContent("Sitemap soumis à Google le 17 nov.");
    expect(carte).not.toHaveTextContent("Sitemap soumis à Bing");
    const lignes = vue.getByRole("table", { name: "Pages inspectées par Google" }).querySelectorAll("tbody tr");
    expect(lignes[0]).toHaveTextContent("✓ indexée");
    expect(lignes[0]).not.toHaveTextContent("Google choisit une autre adresse");
    expect(lignes[1]).toHaveTextContent("✗ Exclue par la balise noindex");
    expect(lignes[2]).toHaveTextContent("Google choisit une autre adresse");
    const requetes = vue.getByText("Top requêtes Google").parentElement!.querySelectorAll("tbody tr");
    expect(requetes[0]).toHaveTextContent("maison bois");
    expect(vue.getByText("Top requêtes Bing")).toBeInTheDocument();
  });

  it("conserve l'erreur Google telle quelle", () => {
    contexte.hygiene = { ...hygieneBase, gsc: { erreur: "403 : le compte de service n'a pas accès" } };
    const vue = render(<VueIndexation />);
    expect(vue.getByRole("alert")).toHaveTextContent("403 : le compte de service n'a pas accès");
    expect(vue.getByText("Indisponible : Google n'a pas pu être lu.")).toBeInTheDocument();
    expect(vue.queryByRole("table", { name: "Pages inspectées par Google" })).not.toBeInTheDocument();
  });

  it("signale une propriété introuvable sans inventer de statistiques", () => {
    contexte.hygiene = { ...hygieneBase, gsc: { propriete: null, sitemaps: [], inspection: [] } };
    const vue = render(<VueIndexation />);
    expect(vue.getByText("Propriété introuvable")).toBeInTheDocument();
    expect(vue.getByRole("link", { name: "Ouvrir Google Search Console" })).toBeInTheDocument();
    expect(vue.getByText("Indisponible : propriété Search Console introuvable.")).toBeInTheDocument();
  });
});

describe("demande et suivi du contrôle", () => {
  it("appelle uniquement vis_demander_hygiene avec le sujet exact", async () => {
    const vue = render(<VueIndexation />);
    await act(async () => { fireEvent.click(vue.getByRole("button", { name: "Contrôler maintenant" })); });
    expect(contexte.executer).toHaveBeenCalledWith("vis_demander_hygiene", { p_subject: "coach-gari" });
    expect(contexte.executer).toHaveBeenCalledTimes(1);
    expect(await vue.findByText(/Contrôle demandé/)).toBeInTheDocument();

    const rpc = vi.fn().mockResolvedValue({ data: "demande-1", error: null });
    await expect(demanderHygiene({ p_subject: "coach-gari" }, { rpc } as unknown as ClientRpc)).resolves.toBe("demande-1");
    expect(rpc).toHaveBeenCalledWith("vis_demander_hygiene", { p_subject: "coach-gari" });
  });

  it("suit une demande HYGIENE active toutes les 30 secondes et bloque un doublon", () => {
    vi.useFakeTimers();
    const active = ligne<DemandeV2>({ id: "h1", subject_id: "coach-gari", type: "HYGIENE", statut: "RUNNING", demande_le: "2026-11-17T10:00:00Z" });
    contexte.demandes = [active];
    const vue = render(<VueIndexation />);
    expect(demandeHygieneActive(contexte.demandes, "coach-gari")?.id).toBe("h1");
    expect(delaiSuiviHygiene(active)).toBe(30_000);
    expect(vue.getByRole("button", { name: "Contrôle en cours" })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(contexte.refetch).toHaveBeenCalledTimes(1);
    expect(contexte.refetchGlobal).toHaveBeenCalledTimes(1);
    vue.unmount();
  });

  it("range l'écran dans Résultats et humanise l'origine du plan et l'activité", () => {
    expect(entreesSite.find((e) => e.id === "resultats")?.sous).toContain("indexation");
    expect(entreeActive("indexation")).toBe("resultats");
    expect(libelleTypeDemande("HYGIENE")).toBe("Hygiène d'indexation");
    const action = ligne<PlanActionV3>({ origine: { type: "indexation", date: "2026-11-17" } });
    expect(badgeOrigine(action)).toBe("Hygiène d'indexation (site en ligne, Bing) · 17 nov.");
  });

  it("garde un exemple clairement séparé pour un visiteur non connecté", () => {
    contexte.connecte = false;
    const vue = render(<VueIndexation />);
    expect(vue.getByRole("img", { name: "Score 82 sur 100" })).toBeInTheDocument();
    expect(vue.getByRole("button", { name: "Contrôler maintenant" })).toBeDisabled();
    expect(hygieneDemo.subject_id).toBe("studio-ardoise");
  });
});
