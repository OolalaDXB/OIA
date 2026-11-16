import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResumeRapportV3 } from "@/components/oia/visibility-score";
import { Button } from "@/components/ui/button";

const donnees = vi.hoisted(() => ({
  score: { subject_id: "coach-gari", score: 19, score_site: 97, visibilite_ia: 0, notoriete_ia: 64 },
  recommandation: { id: "rec-1", subject_id: "coach-gari", etat: "pending", priorite: 1, titre: "Créer les réponses utiles" },
}));

vi.mock("@/lib/donnees/visibility-v3-provider", () => ({
  useVisibilityV3: () => ({ connecte: false, donnees: { scores: [donnees.score], constats: [] } }),
}));
vi.mock("@/lib/donnees/provider", () => ({
  useVisibilityDonnees: () => ({
    fenetres: [{ id: "coach-gari-j0" }],
    marque: { nom: "Coach Gari" },
    vueSite: { concurrents: [{ nom: "Coach Gari", v: 0 }, { nom: "FitDubai", v: 42 }] },
    recommandationsV2: [donnees.recommandation],
  }),
  useSelectionVisibility: () => ({ sujets: [], sujetId: "coach-gari" }),
}));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useVisibilityPilotage: () => ({ global: null }),
  useGesteVisibility: () => ({ enCours: false, erreur: null, executer: vi.fn() }),
}));

afterEach(cleanup);

describe("résumé J0 avec une seule fenêtre", () => {
  it("affiche les deux scores, les deux mesures IA, les concurrents et les actions sans comparaison vide", () => {
    const vue = render(<ResumeRapportV3 subject="coach-gari" actions={<><Button>Lire le rapport</Button><Button variant="outline">Valider</Button></>} />);
    expect(vue.getByRole("heading", { name: "Résumé de J0" })).toBeInTheDocument();
    expect(vue.getByText("Visibilité dans les IA")).toBeInTheDocument();
    expect(vue.getByText("Santé technique du site")).toBeInTheDocument();
    expect(vue.getByText("19", { exact: false })).toBeInTheDocument();
    expect(vue.getByText("97", { exact: false })).toBeInTheDocument();
    expect(vue.getByText("0 %")).toBeInTheDocument();
    expect(vue.getByText("64 %")).toBeInTheDocument();
    expect(vue.getByText("FitDubai")).toBeInTheDocument();
    expect(vue.getByText("Créer les réponses utiles")).toBeInTheDocument();
    expect(vue.getByRole("button", { name: "Lire le rapport" })).toBeInTheDocument();
    expect(vue.getByRole("button", { name: "Valider" })).toBeInTheDocument();
    expect(vue.queryByText("Avant et après, questions communes")).not.toBeInTheDocument();
  });
});
