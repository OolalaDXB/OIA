import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { VueReglages } from "@/components/oia/visibility-reglages";
import { SourcesProvider } from "@/lib/donnees/provider";
import { VisibilityV3Provider } from "@/lib/donnees/visibility-v3-provider";
import { CLE_REGLAGES_VISIBILITY } from "@/lib/visibility-reglages";

function monter() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SourcesProvider><VisibilityV3Provider><VueReglages /></VisibilityV3Provider></SourcesProvider></QueryClientProvider>);
}
function ouvrirOnglet(nom: string) {
  const onglet = screen.getByRole("tab", { name: nom });
  fireEvent.mouseDown(onglet, { button: 0, ctrlKey: false });
  fireEvent.click(onglet);
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("Ajouts dans les réglages Visibility", () => {
  it("n'écrit plus les concurrents dans le stockage local", async () => {
    monter();
    ouvrirOnglet("Concurrents");
    expect(screen.getByRole("button", { name: "Ajouter un concurrent" })).toBeDisabled();
    expect(screen.getByText("La démonstration est en lecture seule. Connectez-vous pour enregistrer le classement en base.")).toBeInTheDocument();
    expect(window.localStorage.getItem(CLE_REGLAGES_VISIBILITY)).toBeNull();
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
