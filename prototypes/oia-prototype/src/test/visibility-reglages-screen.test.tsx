import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { VueReglages } from "@/components/oia/visibility-reglages";
import { SourcesProvider } from "@/lib/donnees/provider";
import { CLE_REGLAGES_VISIBILITY } from "@/lib/visibility-reglages";

function monter() {
  return render(<SourcesProvider><VueReglages /></SourcesProvider>);
}
function ouvrirOnglet(nom: string) {
  const onglet = screen.getByRole("tab", { name: nom });
  fireEvent.mouseDown(onglet, { button: 0, ctrlKey: false });
  fireEvent.click(onglet);
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("Ajouts dans les réglages Visibility", () => {
  it("ajoute un concurrent et le retrouve après une nouvelle ouverture", async () => {
    const vue = monter();
    ouvrirOnglet("Concurrents");
    const ouvrir = screen.getByRole("button", { name: "Ajouter un concurrent" });
    await waitFor(() => expect(ouvrir).toBeEnabled());
    fireEvent.click(ouvrir);
    fireEvent.change(screen.getByLabelText("Nom du concurrent"), { target: { value: "Atelier Local" } });
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "Atelier indépendant" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText("Atelier Local")).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(CLE_REGLAGES_VISIBILITY)).toContain("Atelier Local"));

    vue.unmount();
    monter();
    ouvrirOnglet("Concurrents");
    expect(await screen.findByText("Atelier Local")).toBeInTheDocument();
  });

  it("refuse un concurrent déjà présent", async () => {
    monter();
    ouvrirOnglet("Concurrents");
    const ouvrir = screen.getByRole("button", { name: "Ajouter un concurrent" });
    await waitFor(() => expect(ouvrir).toBeEnabled());
    fireEvent.click(ouvrir);
    fireEvent.change(screen.getByLabelText("Nom du concurrent"), { target: { value: "atelier terre de rance" } });
    fireEvent.change(screen.getByLabelText("Catégorie"), { target: { value: "Autre" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ce concurrent est déjà présent.");
  });

  it("ajoute puis retire un prompt local", async () => {
    monter();
    ouvrirOnglet("Questions");
    const ouvrir = screen.getByRole("button", { name: "Ajouter une question ou un prompt de recherche" });
    await waitFor(() => expect(ouvrir).toBeEnabled());
    fireEvent.click(ouvrir);
    const prompt = "Quel stage de poterie offrir à un débutant ?";
    fireEvent.change(screen.getByLabelText("Question ou prompt"), { target: { value: prompt } });
    fireEvent.change(screen.getByLabelText("Famille"), { target: { value: "Cadeaux et famille" } });
    fireEvent.change(screen.getByLabelText("Langue"), { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "Ajouter" }));
    expect(await screen.findByText(prompt)).toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(CLE_REGLAGES_VISIBILITY)).toContain(prompt));

    fireEvent.click(screen.getByRole("button", { name: `Retirer ${prompt}` }));
    expect(screen.queryByText(prompt)).not.toBeInTheDocument();
    await waitFor(() => expect(window.localStorage.getItem(CLE_REGLAGES_VISIBILITY)).toBeNull());
  });
});
