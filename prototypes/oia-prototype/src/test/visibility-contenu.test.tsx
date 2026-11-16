import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarteLancerNoteContenu, VueQualiteContenu } from "@/components/oia/visibility-contenu";
import { ReglagesDepotGithub } from "@/components/oia/visibility-depot";
import {
  constatsContenuOuverts, delaiSuiviNoteContenu, etatCritereContenu, noteContenuResultat, preuveCritere,
  type CritereContenu,
} from "@/lib/donnees/visibility-contenu";
import { lancerNoteContenu, lierDepot, type ClientRpc } from "@/lib/donnees/visibility-pilotage";
import type { ConstatV3, DepotV3, EstimationNoteContenuV3, NoteContenuV3 } from "@/lib/donnees/visibility-v3";

const ligne = <T,>(valeur: Partial<T>): T => valeur as T;
const estimation = ligne<EstimationNoteContenuV3>({
  subject_id: "coach-gari", client_id: "coach", depot: "OolalaDXB/OIA", branche: "main",
  cout_max_usd: 0.2, cout_habituel_usd: 0.03, plafond_usd: 30, reel_usd: 4, engage_usd: 2,
  plafond_global_usd: 100, etat: "ok",
});
const contexte = vi.hoisted(() => ({
  donnees: {
    estimationsNotesContenu: [] as EstimationNoteContenuV3[], notesContenu: [] as NoteContenuV3[],
    depots: [] as DepotV3[], constats: [], scores: [],
  },
  executer: vi.fn(), recharger: vi.fn(), refetch: vi.fn(),
}));

vi.mock("@/lib/donnees/visibility-v3-provider", () => ({
  useVisibilityV3: () => ({ connecte: true, donnees: contexte.donnees, query: { isPending: false, error: null, refetch: contexte.refetch } }),
}));
vi.mock("@/lib/donnees/visibility-pilotage-provider", () => ({
  useGesteVisibility: () => ({ executer: contexte.executer, recharger: contexte.recharger, enCours: false, erreur: null }),
}));
vi.mock("@/lib/donnees/provider", () => ({
  useSelectionVisibility: () => ({ sujetId: "coach-gari" }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="#lien">{children}</a>,
}));

beforeEach(() => {
  contexte.donnees = { estimationsNotesContenu: [estimation], notesContenu: [], depots: [], constats: [], scores: [] };
  contexte.executer.mockReset().mockResolvedValue("demande-1");
  contexte.recharger.mockReset().mockResolvedValue(undefined);
  contexte.refetch.mockReset().mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("notes et critères du contenu", () => {
  it("conserve les trois notes nulles comme non mesurées et le critère IA comme non vérifiable", () => {
    const note = ligne<NoteContenuV3>({
      id: "n1", subject_id: "coach-gari", statut: "DONE", derniere: true, le: "2026-11-16T10:00:00Z",
      note_technique: null, note_fonctionnelle: null, note_commerciale: null,
      criteres: [{ id: "ia", axe: "commercial", titre: "Promesse citée", points: 10, ok: null, valeur: "Citation absente", source: "modele", preuve: {} }],
      depot_lu: { depot: "OolalaDXB/OIA", sha: "1234567890abcdef", branche: "main", fichiers: 12, sensibles: 0 },
    });
    contexte.donnees.notesContenu = [note];
    const vue = render(<VueQualiteContenu />);
    expect(vue.getAllByRole("img", { name: "Score non mesuré" })).toHaveLength(3);
    expect(vue.queryByText("0", { exact: true })).not.toBeInTheDocument();
    expect(vue.getByText("non vérifiable", { exact: true })).toBeInTheDocument();
    fireEvent.click(vue.getByText("Promesse citée"));
    expect(vue.getByText("Non vérifiable : l’IA n’a pas pu citer le site.")).toBeInTheDocument();
    expect(vue.getByText("1234567")).toBeInTheDocument();
    expect(noteContenuResultat([note], "coach-gari")?.id).toBe("n1");
  });

  it("trie les constats de contenu ouverts par gravité avant leur ordre secondaire", () => {
    const lignes = [
      ligne<ConstatV3>({ id: "mineur", subject_id: "coach-gari", source: "contenu", etat: "ouvert", gravite: "mineur", ordre: 1 }),
      ligne<ConstatV3>({ id: "critique", subject_id: "coach-gari", source: "contenu", etat: "ouvert", gravite: "critique", ordre: 9 }),
      ligne<ConstatV3>({ id: "resolu", subject_id: "coach-gari", source: "contenu", etat: "resolu", gravite: "critique", ordre: 1 }),
      ligne<ConstatV3>({ id: "autre", subject_id: "coach-gari", source: "crawl", etat: "ouvert", gravite: "critique", ordre: 1 }),
    ];
    expect(constatsContenuOuverts(lignes, "coach-gari").map((item) => item.id)).toEqual(["critique", "mineur"]);
  });

  it("rend une citation IA exacte entre guillemets et signale les secrets sans leur contenu", () => {
    const critere: CritereContenu = { id: "ia", axe: "commercial", titre: "Offre", points: 5, ok: true, valeur: "Présente", source: "modele", preuve: { citation: "Coaching pour indépendants" } };
    expect(preuveCritere(critere).citation).toBe("Coaching pour indépendants");
    expect(etatCritereContenu(critere)).toBe("conforme");
    contexte.donnees.notesContenu = [ligne<NoteContenuV3>({
      id: "n1", subject_id: "coach-gari", statut: "DONE", derniere: true, note_technique: 80,
      criteres: [critere], depot_lu: { sensibles: 2 },
    })];
    const vue = render(<VueQualiteContenu />);
    expect(vue.getByRole("alert")).toHaveTextContent("Fichiers secrets versionnés dans le dépôt : changer les clés et les retirer");
    fireEvent.click(vue.getByText("Offre"));
    expect(vue.getByText("« Coaching pour indépendants »")).toBeInTheDocument();
    expect(vue.queryByText(/motdepasse|secret=/i)).not.toBeInTheDocument();
  });
});

describe("lancement et plafonds de la note du contenu", () => {
  it("désactive le bouton sans plafond et affiche la raison", () => {
    contexte.donnees.estimationsNotesContenu = [ligne<EstimationNoteContenuV3>({ ...estimation, etat: "plafond_client_non_fixe", plafond_usd: null })];
    const vue = render(<CarteLancerNoteContenu subject="coach-gari" />);
    expect(vue.getByRole("button", { name: "Lancer la note du contenu" })).toBeDisabled();
    expect(vue.getByText("Plafond client non fixé. Définissez-le avant de lancer la note du contenu.")).toBeInTheDocument();
  });

  it("appelle la fonction avec le coût vu après double confirmation", async () => {
    const vue = render(<CarteLancerNoteContenu subject="coach-gari" />);
    expect(vue.getByText((_, element) => element?.tagName === "P" && /environ 0,03 \$.*au plus 0,20 \$/.test(element.textContent ?? ""))).toBeInTheDocument();
    fireEvent.click(vue.getByRole("button", { name: "Lancer la note du contenu" }));
    await act(async () => { fireEvent.click(vue.getByRole("button", { name: "Confirmer pour 0,20 $" })); });
    expect(contexte.executer).toHaveBeenCalledWith("vis_lancer_note_contenu", { p_subject: "coach-gari", p_cout_vu_usd: 0.2 });

    const rpc = vi.fn().mockResolvedValue({ data: "demande-1", error: null });
    await expect(lancerNoteContenu({ p_subject: "coach-gari", p_cout_vu_usd: 0.2 }, { rpc } as unknown as ClientRpc)).resolves.toBe("demande-1");
    expect(rpc).toHaveBeenCalledWith("vis_lancer_note_contenu", { p_subject: "coach-gari", p_cout_vu_usd: 0.2 });
  });

  it("recharge une note active après 30 secondes seulement", () => {
    vi.useFakeTimers();
    const active = ligne<NoteContenuV3>({ id: "n1", subject_id: "coach-gari", statut: "RUNNING", le: "2026-11-16T10:00:00Z" });
    contexte.donnees.notesContenu = [active];
    const vue = render(<CarteLancerNoteContenu subject="coach-gari" />);
    expect(delaiSuiviNoteContenu(active)).toBe(30_000);
    expect(vue.getByRole("button", { name: "Lancer la note du contenu" })).toBeDisabled();
    act(() => { vi.advanceTimersByTime(29_999); });
    expect(contexte.refetch).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(contexte.refetch).toHaveBeenCalledTimes(1);
    vue.unmount();
  });
});

describe("liaison du dépôt GitHub", () => {
  it("lie proprietaire/nom et sa branche puis délie avec null", async () => {
    contexte.donnees.depots = [ligne<DepotV3>({ subject_id: "coach-gari", depot: "ancien/depot", branche: "main" })];
    const vue = render(<ReglagesDepotGithub />);
    fireEvent.change(vue.getByLabelText("Dépôt GitHub"), { target: { value: "OolalaDXB/OIA" } });
    fireEvent.change(vue.getByLabelText("Branche, facultative"), { target: { value: "production" } });
    await act(async () => { fireEvent.click(vue.getByRole("button", { name: "Lier le dépôt" })); });
    expect(contexte.executer).toHaveBeenCalledWith("vis_lier_depot", { p_subject: "coach-gari", p_depot: "OolalaDXB/OIA", p_branche: "production" });
    await act(async () => { fireEvent.click(vue.getByRole("button", { name: "Délier" })); });
    expect(contexte.executer).toHaveBeenLastCalledWith("vis_lier_depot", { p_subject: "coach-gari", p_depot: null });

    const rpc = vi.fn().mockResolvedValue({ data: 12, error: null });
    await expect(lierDepot({ p_subject: "coach-gari", p_depot: null }, { rpc } as unknown as ClientRpc)).resolves.toBe(12);
    expect(rpc).toHaveBeenCalledWith("vis_lier_depot", { p_subject: "coach-gari", p_depot: null });
  });
});
