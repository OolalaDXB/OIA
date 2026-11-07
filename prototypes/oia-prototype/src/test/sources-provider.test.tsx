import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SourcesProvider, useEtatDonnees, type Sources } from "@/lib/donnees/provider";
import { lireDemoAccueil } from "@/lib/donnees/accueil";
import { lireDemoMoney } from "@/lib/donnees/money";
import { lireDemoShyrka } from "@/lib/donnees/shyrka";
import { lireDemoVisibility } from "@/lib/donnees/visibility";

afterEach(cleanup);
function Probe() { const { etat } = useEtatDonnees("money"); return <output>{etat.statut}</output>; }
const sources: Sources = { accueil: lireDemoAccueil, money: lireDemoMoney, shyrka: lireDemoShyrka, visibility: lireDemoVisibility };
describe("états des sources à venir", () => {
  it("la démonstration est prête immédiatement, sans attente artificielle", () => { const r = render(<SourcesProvider><Probe /></SourcesProvider>); expect(r.getByRole("status").textContent).toBe("pret"); });
  it("une source en attente passe de chargement à prêt", async () => {
    let terminer: (d: ReturnType<typeof lireDemoMoney>) => void = () => {};
    const attente = new Promise<ReturnType<typeof lireDemoMoney>>((resolve) => { terminer = resolve; });
    const r = render(<SourcesProvider sources={{ ...sources, money: () => attente }}><Probe /></SourcesProvider>);
    expect(r.getByRole("status").textContent).toBe("chargement");
    await act(async () => { terminer(lireDemoMoney()); });
    expect(r.getByRole("status").textContent).toBe("pret");
  });
  it("une source vide ne se fait pas passer pour une démonstration prête", async () => {
    const r = render(<SourcesProvider sources={{ ...sources, money: () => ({ ...lireDemoMoney(), opportunites: [], signals: [] }) }}><Probe /></SourcesProvider>);
    await waitFor(() => expect(r.getByRole("status").textContent).toBe("vide"));
  });
  it("une source rejetée donne un état erreur", async () => {
    const r = render(<SourcesProvider sources={{ ...sources, money: () => { throw Error("indisponible"); } }}><Probe /></SourcesProvider>);
    await waitFor(() => expect(r.getByRole("status").textContent).toBe("erreur"));
  });
});