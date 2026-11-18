import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EffetAction, BadgeVerification, OngletActions, OngletChantiers, MENTION_CAUSE } from "@/components/oia/visibility-chantiers";
import { compteurSuivi, consolideDemo, resumePilotage, suiviDemo, texteResumePilotage, type SuiviActionV3 } from "@/lib/donnees/visibility-suivi";

const ctx = vi.hoisted(() => ({ executer: vi.fn(), plans: [] as unknown[], suivi: [] as unknown[] }));
vi.mock("@/lib/donnees/visibility-v3-provider", () => ({ useVisibilityV3: () => ({ connecte: true, donnees: {} }) }));
vi.mock("@/lib/oia-auth", () => ({ useOiaAuth: () => ({ user: { id: "u1" }, loading: false }) }));
vi.mock("@/lib/donnees/provider", () => ({ useSelectionVisibility: () => ({ sujetId: "studio-ardoise" }) }));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useGesteVisibility: () => ({ executer: ctx.executer, enCours: false, erreur: null }),
  useVisibilityPilotage: () => ({ global: { demandes: [] }, globalQuery: { refetch: vi.fn() } }),
}));
vi.mock("@/lib/donnees/visibility-suivi", async (orig) => ({
  ...(await orig<typeof import("@/lib/donnees/visibility-suivi")>()),
  lireSuiviPlan: () => Promise.resolve(ctx.suivi),
  lirePlanConsolide: () => Promise.resolve(ctx.plans),
}));

const rendre = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
beforeEach(() => { ctx.executer.mockReset().mockResolvedValue(1); ctx.plans = consolideDemo; ctx.suivi = suiviDemo; });
afterEach(cleanup);

describe("Plan d'action : Actions", () => {
  it("cocher une action appelle vis_suivre_action avec l'état fait", async () => {
    const vue = rendre(<OngletActions subject="studio-ardoise" cible={null} />);
    fireEvent.click(await vue.findByRole("checkbox", { name: "Marquer fait : Collecter des avis clients" }));
    await waitFor(() => expect(ctx.executer).toHaveBeenCalledWith("vis_suivre_action", { p_subject: "studio-ardoise", p_action_cle: "recommandation:avis", p_etat: "fait" }));
    expect(vue.getByText("6 actions · 4 faites · 1 vérifiée · 1 en retard")).toBeInTheDocument();
    expect(vue.getAllByText("En retard").some((e) => e.tagName === "SPAN")).toBe(true);
  });

  it("affiche les quatre états de vérification", () => {
    const libelles = ["corrige_verifie", "pas_encore_corrige", "verification_en_attente", "a_mesurer"].map((v) => rendre(<BadgeVerification verification={v} />).container.textContent);
    expect(libelles).toEqual(["Corrigé, vérifié", "Pas encore corrigé, le contrôle le voit encore", "Vérification au prochain contrôle", "À mesurer"]);
  });

  it("effet trop tôt ou mesuré", () => {
    const trop = rendre(<EffetAction action={{ ...suiviDemo[1]!, effet: "trop_tot" }} />);
    expect(trop.container.textContent).toContain("trop tôt (14 jours au moins)");
    cleanup();
    const mesure = rendre(<EffetAction action={suiviDemo[0]!} />);
    expect(mesure.container.textContent).toMatch(/Pages indexées Google\s*\+6/);
    expect(mesure.container.textContent).toMatch(/Clics Google\s*-3/);
    expect(mesure.getByText(MENTION_CAUSE)).toBeInTheDocument();
  });

  it("compte et résume sans inventer", () => {
    expect(compteurSuivi([] as SuiviActionV3[])).toBe("0 action · 0 faite · 0 vérifiée · 0 en retard");
    expect(texteResumePilotage(resumePilotage(consolideDemo, suiviDemo, "studio-ardoise"))).toBe("2 chantiers · 1 action en retard");
  });
});

describe("Plan d'action : Chantiers", () => {
  it("« Marquer fait » appelle vis_suivre_action une fois par action, avec la preuve", async () => {
    const vue = rendre(<OngletChantiers subject="studio-ardoise" voirAction={vi.fn()} />);
    const carte = await vue.findByRole("region", { name: "Rendre le site lisible par les moteurs" });
    expect(carte.textContent).toContain("relevé par 3 sources");
    const { getByLabelText, getByRole } = within(carte);
    fireEvent.change(getByLabelText("Preuve (lien, commit)"), { target: { value: "commit abc" } });
    fireEvent.click(getByRole("button", { name: "Marquer fait" }));
    await waitFor(() => expect(ctx.executer).toHaveBeenCalledTimes(3));
    for (const cle of ["constat:indexation:sitemap", "constat:seo:titres", "constat:indexation:canonique"])
      expect(ctx.executer).toHaveBeenCalledWith("vis_suivre_action", { p_subject: "studio-ardoise", p_action_cle: cle, p_etat: "fait", p_preuve: "commit abc" });
    expect(vue.getByText("6 actions croisées depuis 3 sources")).toBeInTheDocument();
  });

  it("copie le prompt d'exécution", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    const vue = rendre(<OngletChantiers subject="studio-ardoise" voirAction={vi.fn()} />);
    fireEvent.click((await vue.findAllByRole("button", { name: "Copier le prompt" }))[0]!);
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(expect.stringContaining("public/robots.txt")));
    expect(await vue.findByText("Prompt copié")).toBeInTheDocument();
  });

  it("consolidation absente : bouton « Croiser maintenant » gratuit", async () => {
    ctx.plans = [];
    const vue = rendre(<OngletChantiers subject="studio-ardoise" voirAction={vi.fn()} />);
    fireEvent.click(await vue.findByRole("button", { name: "Croiser maintenant" }));
    await waitFor(() => expect(ctx.executer).toHaveBeenCalledWith("vis_demander_consolidation", { p_subject: "studio-ardoise" }));
  });
});
