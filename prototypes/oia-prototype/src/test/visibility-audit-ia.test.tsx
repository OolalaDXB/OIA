import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarteAuditIaExpress } from "@/components/oia/visibility-audit-ia";
import {
  auditsExternesAComparer, auditsIaPourSujet, budgetRestantAuditIa, delaiSuiviAuditIa,
  moteursEstimationAuditIa, raisonEtatAuditIa,
} from "@/lib/donnees/visibility-audit-ia";
import { lancerAuditIa, type ClientRpc } from "@/lib/donnees/visibility-pilotage";
import { sourceAuditExterne } from "@/lib/donnees/visibility-audits";
import type { AuditExterneV3, AuditIaV3, EstimationAuditIaV3 } from "@/lib/donnees/visibility-v3";

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
const estimation = ligne<EstimationAuditIaV3>({
  subject_id: "coach-gari", client_id: "coach", langues: ["fr"], questions: 20, appels: 120,
  moteurs: [{ moteur: "ChatGPT", cible: "chatgpt.com", appels: 20, max_usd: 2.4, habituel_usd: 0.7 }],
  cout_max_usd: 13.56, cout_habituel_usd: 3.85, plafond_usd: 30, reel_usd: 4, engage_usd: 2,
  plafond_global_usd: 100, etat: "ok",
});
const contexte = vi.hoisted(() => ({
  donnees: { estimationsAuditIa: [] as EstimationAuditIaV3[], auditsIa: [] as AuditIaV3[] },
  executer: vi.fn(),
  recharger: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock("@/lib/donnees/visibility-v3-provider", () => ({
  useVisibilityV3: () => ({ connecte: true, donnees: contexte.donnees, query: { refetch: contexte.refetch } }),
}));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useGesteVisibility: () => ({ executer: contexte.executer, recharger: contexte.recharger, enCours: false, erreur: null }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#budget">{children}</a>,
}));

beforeEach(() => {
  contexte.donnees = { estimationsAuditIa: [estimation], auditsIa: [] };
  contexte.executer.mockReset().mockResolvedValue("demande-1");
  contexte.recharger.mockReset().mockResolvedValue(undefined);
  contexte.refetch.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("estimation et plafonds de l'audit IA express", () => {
  it("affiche les montants contractuels et le budget restant", async () => {
    const vue = render(<CarteAuditIaExpress subject="coach-gari" />);
    expect(vue.getByText((_, element) => element?.tagName === "P" && /environ 3,85 \$.*au plus 13,56 \$/.test(element.textContent ?? ""))).toBeInTheDocument();
    expect(vue.getByText("Budget du mois restant : 24,00 $")).toBeInTheDocument();
    expect(vue.getByRole("button", { name: "Lancer l’audit" })).toBeEnabled();
    expect(moteursEstimationAuditIa(estimation)[0]).toMatchObject({ moteur: "ChatGPT", appels: 20, maxUsd: 2.4, habituelUsd: 0.7 });
    expect(budgetRestantAuditIa(estimation)).toBe(24);
    fireEvent.click(vue.getByRole("button", { name: "Détail du coût par moteur" }));
    expect(await vue.findByText("Estimation par moteur")).toBeInTheDocument();
    expect(vue.getByText("chatgpt.com")).toBeInTheDocument();
  });

  it("désactive le bouton sans plafond et donne la raison avec le lien Budget", () => {
    contexte.donnees.estimationsAuditIa = [ligne<EstimationAuditIaV3>({ ...estimation, etat: "plafond_client_non_fixe", plafond_usd: null })];
    const vue = render(<CarteAuditIaExpress subject="coach-gari" />);
    expect(vue.getByRole("button", { name: "Lancer l’audit" })).toBeDisabled();
    expect(vue.getByText("Plafond client non fixé. Définissez-le avant de lancer l’audit.")).toBeInTheDocument();
    expect(vue.getByRole("link", { name: "Réglages › Budget" })).toBeInTheDocument();
    expect(raisonEtatAuditIa("plafond_global_non_fixe")).toContain("Plafond global");
    expect(raisonEtatAuditIa("plafond_depasse")).toContain("dépassé");
  });
});

describe("lancement et suivi de l'audit IA express", () => {
  it("appelle la RPC avec le coût maximal réellement affiché après double confirmation", async () => {
    const vue = render(<CarteAuditIaExpress subject="coach-gari" />);
    fireEvent.click(vue.getByRole("button", { name: "Lancer l’audit" }));
    expect(vue.getByText(/Confirmez le lancement pour un montant maximal de/).textContent).toContain("13,56 $");
    await act(async () => { fireEvent.click(vue.getByRole("button", { name: "Confirmer pour 13,56 $" })); });
    expect(contexte.executer).toHaveBeenCalledWith("vis_lancer_audit_ia", { p_subject: "coach-gari", p_cout_vu_usd: 13.56, p_questions: 20 });
    expect(contexte.executer).toHaveBeenCalledTimes(1);

    const rpc = vi.fn().mockResolvedValue({ data: "demande-1", error: null });
    await expect(lancerAuditIa({ p_subject: "coach-gari", p_cout_vu_usd: 13.56, p_questions: 20 }, { rpc } as unknown as ClientRpc)).resolves.toBe("demande-1");
    expect(rpc).toHaveBeenCalledWith("vis_lancer_audit_ia", { p_subject: "coach-gari", p_cout_vu_usd: 13.56, p_questions: 20 });
  });

  it("suit QUEUED et RUNNING toutes les 30 secondes, puis arrête le rechargement", () => {
    const actif = ligne<AuditIaV3>({ id: "audit-1", subject_id: "coach-gari", statut: "RUNNING", le: "2026-11-16T19:06:00Z" });
    const termine = ligne<AuditIaV3>({ ...actif, statut: "DONE", le: "2026-11-16T19:00:00Z", terminee_le: "2026-11-16T19:05:00Z" });
    vi.useFakeTimers();
    contexte.donnees.auditsIa = [actif];
    const vue = render(<CarteAuditIaExpress subject="coach-gari" />);
    expect(vue.getByText("Audit en cours · En cours")).toBeInTheDocument();
    expect(vue.getByRole("progressbar", { name: "Audit IA express en cours" })).toBeInTheDocument();
    expect(vue.getByRole("button", { name: "Lancer l’audit" })).toBeDisabled();
    expect(delaiSuiviAuditIa([actif])).toBe(30_000);
    expect(delaiSuiviAuditIa([ligne<AuditIaV3>({ ...actif, statut: "QUEUED" })])).toBe(30_000);
    expect(delaiSuiviAuditIa([termine])).toBe(false);
    expect(auditsIaPourSujet([termine, actif], "coach-gari")[0]?.statut).toBe("RUNNING");
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(contexte.refetch).toHaveBeenCalledTimes(1);
    vue.unmount();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(contexte.refetch).toHaveBeenCalledTimes(1);
  });

  it("affiche l'erreur de la base telle quelle", () => {
    contexte.donnees.auditsIa = [ligne<AuditIaV3>({ id: "audit-1", subject_id: "coach-gari", statut: "FAILED", erreur: "moteur indisponible : réessayer plus tard", le: "2026-11-16T19:00:00Z" })];
    const vue = render(<CarteAuditIaExpress subject="coach-gari" />);
    expect(vue.getAllByText("moteur indisponible : réessayer plus tard").length).toBeGreaterThan(0);
  });
});

describe("résultats et recommandations", () => {
  it("choisit les derniers audits OIA et Perplexity du même site seulement", () => {
    const perplexity = ligne<AuditExterneV3>({ id: "p1", subject_id: "coach-gari", outil: "Perplexity Computer", realise_le: "2026-11-16" });
    const oia = ligne<AuditExterneV3>({ id: "o1", subject_id: "coach-gari", outil: "OIA · Audit IA express", realise_le: "2026-11-17" });
    const autre = ligne<AuditExterneV3>({ id: "o2", subject_id: "autre", outil: "OIA · Audit IA express", realise_le: "2026-11-18" });
    expect(auditsExternesAComparer([perplexity, oia, autre], "coach-gari")).toEqual({ oia, perplexity });
    expect(auditsExternesAComparer([perplexity, autre], "coach-gari")).toBeNull();
  });

  it("traduit la source des recommandations de l'audit IA express", () => {
    expect(sourceAuditExterne("audit-ia-express:2026-11-17")).toBe("Audit IA express · 17/11/2026");
  });
});
