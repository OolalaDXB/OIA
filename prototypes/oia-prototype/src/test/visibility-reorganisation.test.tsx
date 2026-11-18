import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { entreeActive, entreesSite } from "@/components/oia/visibility";
import type { ScoreV3 } from "@/lib/donnees/visibility-v3";
import { AccueilSitesVisibility, resumeSite } from "@/components/oia/visibility-sites";
import { FormulaireRapportExterne } from "@/components/oia/visibility-rapport-externe";
import { ActiviteMoteur } from "@/components/oia/visibility-pilotage";
import {
  badgeOrigine, compteurPlan, enteteHorizon, erreurTexteRapport, erreurTronquee, extraireTextePdf, groupesHorizon,
  libelleTypeDemande, lireFichierRapport, peutRelancer, regrouperPlan, type ChargeurPdf, type PlanActionV3,
} from "@/lib/donnees/visibility-plan";

const l = <T,>(v: Partial<T>): T => v as T;
const plan: PlanActionV3[] = [
  l<PlanActionV3>({ id: "a", subject_id: "coach-gari", nature: "recommandation", origine: { type: "audit_externe", libelle: "Audit externe · Perplexity Computer", date: "2026-11-16" }, priorite: "P0", horizon: "Cette semaine", ordre: 1, titre: "Page cours", etat: "a_valider" }),
  l<PlanActionV3>({ id: "b", subject_id: "coach-gari", nature: "constat", origine: { type: "lighthouse", libelle: "Analyse Lighthouse" }, priorite: "P1", horizon: "Sous 2 à 6 semaines", ordre: 2, titre: "Images hors écran", etat: "a_faire" }),
  l<PlanActionV3>({ id: "c", subject_id: "coach-gari", nature: "constat", origine: { type: "lighthouse", libelle: "Analyse Lighthouse" }, priorite: "P1", horizon: "Sous 2 à 6 semaines", ordre: 3, titre: "Images hors écran", etat: "a_faire" }),
  l<PlanActionV3>({ id: "d", subject_id: "coach-gari", nature: "constat", origine: { type: "lecture_site", libelle: "Lecture du site" }, priorite: "P0", horizon: "Cette semaine", ordre: 0, titre: "noindex", etat: "a_faire" }),
  l<PlanActionV3>({ id: "e", subject_id: "coach-gari", nature: "constat", origine: { libelle: "Note du contenu" }, priorite: "P0", horizon: "Cette semaine", titre: "Corrigé", etat: "fait" }),
];

const ctx = vi.hoisted(() => ({ executer: vi.fn(), connecte: true, portefeuille: [] as unknown[], demandes: [] as unknown[] }));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, search, params, to, ...rest }: { children: React.ReactNode; search?: { site?: string }; params?: { onglet?: string }; to?: string } & Record<string, unknown>) =>
    <a href={`${to ?? ""}${params?.onglet ? `/${params.onglet}` : ""}${search?.site ? `?site=${search.site}` : ""}`} aria-label={rest["aria-label"] as string | undefined}>{children}</a>,
}));
vi.mock("@/lib/donnees/visibility-v3-provider", () => ({
  useVisibilityV3: () => ({ connecte: ctx.connecte, query: { isPending: false, error: null }, donnees: { scores: [{ subject_id: "coach-gari", score: 19, score_site: 97, analyse_le: "2026-11-16T10:00:00Z" }], planAction: plan, constats: [] } }),
}));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useVisibilityPilotage: () => ({ connecte: ctx.connecte, global: { portefeuille: ctx.portefeuille, demandes: ctx.demandes, moteur: [], alertes: [], budgets: [] }, globalQuery: { isPending: false, error: null, refetch: vi.fn() }, sujetQuery: { isPending: false, error: null } }),
  useGesteVisibility: () => ({ executer: ctx.executer, enCours: false, erreur: null }),
}));
vi.mock("@/lib/donnees-visibility", () => ({ useDonnees: () => ({ reel: true, sites: [] }) }));
vi.mock("@/lib/donnees/provider", () => ({ useSelectionVisibility: () => ({ reel: true, sujets: [], sujetId: "coach-gari", setSujetId: vi.fn() }) }));

beforeEach(() => { ctx.executer.mockReset().mockResolvedValue("uuid-1"); ctx.connecte = true; ctx.demandes = []; });
afterEach(cleanup);

describe("accueil des sites analysés", () => {
  it("résume les deux scores séparés et les actions P0 à faire", () => {
    const r = resumeSite({ id: "coach-gari", nom: "Coach Gari", adresse: "", etape: null, prochaineAction: null, coutMois: null, jour: null }, [l<ScoreV3>({ subject_id: "coach-gari", score: 19, score_site: 97, analyse_le: "2026-11-16T10:00:00Z" })], plan);
    expect(r).toEqual({ visibilite: 19, sante: 97, p0: 2, derniereMesure: "16 novembre 2026" });
  });
  it("affiche une carte par site qui ouvre le site", () => {
    ctx.portefeuille = [{ subject_id: "coach-gari", nom: "Coach Gari", site_url: "https://coachgari.com", etape: "actions_en_cours", prochaine_action: "Valider le rapport", cout_mois_usd: 4.2, jour_courant: null }];
    const vue = render(<AccueilSitesVisibility />);
    expect(vue.getByRole("heading", { name: "Sites analysés" })).toBeInTheDocument();
    expect(vue.getByRole("button", { name: "Ajouter un site" })).toBeEnabled();
    expect(vue.getByRole("link", { name: "Ouvrir Coach Gari" })).toHaveAttribute("href", "/visibility?site=coach-gari");
    expect(vue.getByText("Valider le rapport")).toBeInTheDocument();
    expect(vue.getByText("4,20 $")).toBeInTheDocument();
  });
});

describe("navigation d'un site", () => {
  it("n'a que quatre entrées, sans Sites et portefeuille", () => {
    expect(entreesSite.map((e) => e.label)).toEqual(["Vue d'ensemble", "Plan d'action", "Résultats", "Études"]);
    expect(entreesSite.flatMap((e) => [e.id, ...e.sous])).not.toContain("sites");
  });
  it("range les anciens onglets dans la bonne entrée", () => {
    expect(entreeActive("opportunites")).toBe("plan");
    expect(entreeActive("recommandations")).toBe("plan");
    expect(entreeActive("performance")).toBe("resultats");
    expect(entreeActive("contenu")).toBe("resultats");
    expect(entreeActive("audits")).toBe("etudes");
    expect(entreeActive("seo-command")).toBe("reglages");
  });
});

describe("plan d'action unique", () => {
  it("groupe par horizon et fusionne les constats Lighthouse mobile et ordinateur", () => {
    const cartes = regrouperPlan(plan.filter((a) => a.etat !== "fait"));
    expect(cartes).toHaveLength(3);
    expect(cartes.find((c) => c.action.titre === "Images hors écran")?.mobileEtOrdinateur).toBe(true);
    const groupes = groupesHorizon(cartes);
    expect(groupes.map((g) => enteteHorizon(g.horizon, g.cartes.length))).toEqual(["Cette semaine · 2 actions", "Sous 2 à 6 semaines · 1 action"]);
    expect(groupes[0]!.cartes[0]!.action.id).toBe("d");
    expect(compteurPlan(cartes)).toBe("3 actions · 2 cette semaine · 1 à valider");
  });
  it("affiche l'origine avec sa date courte", () => {
    expect(badgeOrigine(plan[0]!)).toBe("Audit externe · Perplexity Computer · 16 nov.");
    expect(badgeOrigine(plan[1]!)).toBe("Analyse Lighthouse");
  });
});

describe("rapport externe", () => {
  const texte = "Rapport Semrush. ".repeat(20);
  it("borne le texte entre 200 et 400 000 caractères", () => {
    expect(erreurTexteRapport("court")).toMatch(/au moins 200/);
    expect(erreurTexteRapport("x".repeat(400_001))).toMatch(/dépasse/);
    expect(erreurTexteRapport(texte)).toBeNull();
  });
  it("extrait le texte d'un PDF page par page dans le navigateur", async () => {
    const chargeur: ChargeurPdf = async () => ({ numPages: 2, getPage: async (n) => ({ getTextContent: async () => ({ items: [{ str: `Page ${n}`, hasEOL: true }, { str: "suite" }] }) }) });
    expect(await extraireTextePdf(new ArrayBuffer(4), chargeur)).toBe("Page 1\nsuite\n\nPage 2\nsuite");
    const pdf = new File(["%PDF"], "rapport.pdf", { type: "application/pdf" });
    expect(await lireFichierRapport(pdf, chargeur)).toContain("Page 2");
    expect(await lireFichierRapport(new File(["bonjour"], "notes.txt", { type: "text/plain" }))).toBe("bonjour");
    await expect(lireFichierRapport(new File(["x"], "a.docx"))).rejects.toThrow(/\.md, \.txt ou \.pdf/);
  });
  it("envoie le texte collé à vis_importer_rapport_externe", async () => {
    const vue = render(<FormulaireRapportExterne subject="coach-gari" onFerme={() => {}} />);
    fireEvent.change(vue.getByLabelText("Outil"), { target: { value: "Semrush" } });
    fireEvent.change(vue.getByLabelText("Date"), { target: { value: "2026-11-16" } });
    fireEvent.change(vue.getByLabelText("Titre"), { target: { value: "Audit SEO" } });
    fireEvent.change(vue.getByLabelText("Texte du rapport"), { target: { value: texte } });
    fireEvent.click(vue.getByRole("button", { name: "Envoyer le rapport" }));
    await waitFor(() => expect(ctx.executer).toHaveBeenCalledWith("vis_importer_rapport_externe", { p_subject: "coach-gari", p_outil: "Semrush", p_realise_le: "2026-11-16", p_titre: "Audit SEO", p_rapport_md: texte.trim() }));
    expect(await vue.findByText("Tirer le plan d'action de ce rapport")).toBeInTheDocument();
    fireEvent.click(vue.getByRole("button", { name: "Tirer le plan d'action" }));
    fireEvent.click(vue.getByRole("button", { name: "Confirmer" }));
    await waitFor(() => expect(ctx.executer).toHaveBeenCalledWith("vis_extraire_plan", { p_audit_externe: "uuid-1", p_cout_vu_usd: 0.25 }));
  });
  it("refuse un texte trop court sans appeler la base", async () => {
    const vue = render(<FormulaireRapportExterne subject="coach-gari" onFerme={() => {}} />);
    fireEvent.change(vue.getByLabelText("Outil"), { target: { value: "Semrush" } });
    fireEvent.change(vue.getByLabelText("Titre"), { target: { value: "Audit" } });
    fireEvent.change(vue.getByLabelText("Texte du rapport"), { target: { value: "trop court" } });
    fireEvent.click(vue.getByRole("button", { name: "Envoyer le rapport" }));
    expect(await vue.findByText(/au moins 200/)).toBeInTheDocument();
    expect(ctx.executer).not.toHaveBeenCalled();
  });
});

describe("activité du moteur", () => {
  it("ne propose pas Relancer sur une demande remplacée", () => {
    expect(peutRelancer({ id: "d1", statut: "FAILED", remplacee_par: "d2" })).toBe(false);
    expect(peutRelancer({ id: "d1", statut: "FAILED", remplacee_par: null })).toBe(true);
    ctx.demandes = [
      { id: "d1", type: "EXTRAIRE_PLAN", statut: "FAILED", remplacee_par: "d2", erreur: "e".repeat(200), demande_le: "2026-11-16" },
      { id: "d3", type: "NOTE_CONTENU", statut: "FAILED", remplacee_par: null, erreur: "court", demande_le: "2026-11-15" },
    ];
    const vue = render(<ActiviteMoteur />);
    expect(vue.getByRole("link", { name: "relancée" })).toHaveAttribute("href", "#demande-d2");
    expect(vue.getAllByRole("button", { name: "Relancer" })).toHaveLength(1);
    expect(vue.getByText("Extraction du plan")).toBeInTheDocument();
    expect(vue.getByText("Note du contenu")).toBeInTheDocument();
  });
  it("traduit les types et tronque l'erreur à 160 caractères", () => {
    expect(libelleTypeDemande("ANALYSE")).toBe("Analyse");
    expect(libelleTypeDemande("EXTRAIRE_PLAN")).toBe("Extraction du plan");
    const e = erreurTronquee("x".repeat(200));
    expect(e.tronquee).toBe(true);
    expect(e.court).toHaveLength(161);
  });
});
