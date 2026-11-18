import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { GestionEntitesVisibility } from "@/components/oia/visibility-entites";
import { groupeNature } from "@/lib/donnees/visibility-entites";
import type { EntiteV3 } from "@/lib/donnees/visibility-v3";

const etat = vi.hoisted(() => ({ entites: [] as EntiteV3[], executer: vi.fn() }));
vi.mock("@/lib/donnees/visibility-v3-provider", () => ({
  useVisibilityV3: () => ({ connecte: true, donnees: { entites: etat.entites, scores: [{ subject_id: "coach-gari" }] }, query: { isPending: false, error: null } }),
}));
vi.mock("@/lib/donnees/provider", () => ({ useSelectionVisibility: () => ({ sujetId: "coach-gari" }) }));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useGesteVisibility: () => ({ executer: etat.executer, enCours: false, erreur: null }),
}));

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
beforeEach(() => {
  etat.executer.mockReset().mockResolvedValue(1);
  etat.entites = [
    ligne<EntiteV3>({ subject_id: "coach-gari", entite: "Urban Padel", nature: "concurrent", origine: "humain" }),
    ligne<EntiteV3>({ subject_id: "coach-gari", entite: "Playtomic", nature: "plateforme", origine: "moteur" }),
    ligne<EntiteV3>({ subject_id: "coach-gari", entite: "Future", nature: "application", origine: "moteur" }),
    ligne<EntiteV3>({ subject_id: "coach-gari", entite: "Caliber", nature: "application", origine: "moteur" }),
    ligne<EntiteV3>({ subject_id: "coach-gari", entite: "Time Out", nature: "media", origine: "moteur" }),
  ];
});
afterEach(cleanup);

describe("FiltreSelect", () => {
  it("borne la largeur, réserve le chevron et supprime la flèche native", () => {
    const vue = render(<FiltreSelect aria-label="Assistant"><option>Tous</option><option>ChatGPT</option></FiltreSelect>);
    const select = screen.getByRole("combobox", { name: "Assistant" });
    expect(select).toHaveClass("h-9", "min-w-48", "sm:max-w-80", "appearance-none", "pr-9", "[field-sizing:content]");
    expect(select).toHaveClass("rounded-md", "border", "border-input");
    expect(vue.container.querySelector("svg")).toHaveClass("right-3", "pointer-events-none", "absolute");
    expect(select.parentElement).toHaveClass("w-fit", "justify-self-start");
  });
});

describe("classement des entités Visibility", () => {
  it("répartit concurrents, plateformes, applications, annuaires et médias", () => {
    expect(groupeNature("concurrent")).toBe("concurrents");
    expect(groupeNature("plateforme")).toBe("plateformes");
    expect(groupeNature("application")).toBe("plateformes");
    expect(groupeNature("annuaire")).toBe("annuaires");
    expect(groupeNature("media")).toBe("annuaires");
    render(<GestionEntitesVisibility />);
    const plateformes = screen.getByRole("heading", { name: "Plateformes et applications" }).closest("section")!;
    expect(within(plateformes).getByText("Playtomic")).toBeInTheDocument();
    expect(within(plateformes).getByText("Future")).toBeInTheDocument();
    expect(within(plateformes).getByText("Caliber")).toBeInTheDocument();
    expect(within(plateformes).getByText("sources où être présent, pas des concurrents")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Concurrents directs" }).closest("section")!).getByText("Urban Padel")).toBeInTheDocument();
    expect(within(screen.getByRole("heading", { name: "Annuaires et médias" }).closest("section")!).getByText("Time Out")).toBeInTheDocument();
    expect(screen.getAllByText("classé par l'IA")).toHaveLength(4);
  });

  it("appelle la fonction contractuelle pour changer une nature", async () => {
    render(<GestionEntitesVisibility />);
    fireEvent.change(screen.getByRole("combobox", { name: "Nature de Playtomic" }), { target: { value: "concurrent" } });
    await waitFor(() => expect(etat.executer).toHaveBeenCalledWith("vis_classer_entite", { p_subject: "coach-gari", p_entite: "Playtomic", p_nature: "concurrent" }));
  });

  it("ajoute un concurrent en base sans passer par le navigateur", async () => {
    render(<GestionEntitesVisibility />);
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un concurrent" }));
    fireEvent.change(screen.getByLabelText("Nom du concurrent"), { target: { value: "Padel Pro" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer comme concurrent direct" }));
    await waitFor(() => expect(etat.executer).toHaveBeenCalledWith("vis_classer_entite", { p_subject: "coach-gari", p_entite: "Padel Pro", p_nature: "concurrent" }));
  });
});
