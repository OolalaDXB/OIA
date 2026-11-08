import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useMutation } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RepriseMoney } from "@/components/oia/money-import";
const mock = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/donnees/money", () => ({
  useVueMoney: () => ({ data: [{ id: "import-1", actif: true, importe_le: "2026-11-08", importe_par: "test", bilan: {} }], acces: { data: "proprietaire" }, isPending: false, isFetching: false, error: null, refetch: vi.fn() }),
  useActionMoney: (name: string) => useMutation({ mutationFn: (args: unknown) => mock.rpc(name, args) }),
}));
vi.mock("@/components/oia/ui", () => ({ Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
beforeEach(() => { vi.clearAllMocks(); mock.rpc.mockImplementation(async (name: string) => name === "oia_apercu_annulation" ? { modifies_depuis_import: [{ table: "notes", id: "a" }], non_verifiables: 2, a_supprimer: { notes: 3 } } : { import_id: "import-1", notes: 1 }); });
afterEach(cleanup);
function mount() { return render(<QueryClientProvider client={new QueryClient()}><RepriseMoney /></QueryClientProvider>); }
it("envoie les six clés originales inchangées après aperçu local", async () => {
  mount();
  const backup = { kind: "oia.workspace.backup", version: 1, data: { "oia.audit.v1": [], "oia.tags.v1": {}, "oia.notes.v1": [{ id: "n", text: "test" }], "oia.tasks.v1": [], "oia.contacts.v1": [], "oia.views.v1": [] } };
  const file = new File([JSON.stringify(backup)], "backup.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => JSON.stringify(backup) });
  fireEvent.change(screen.getByLabelText("Fichier de sauvegarde JSON"), { target: { files: [file] } });
  await waitFor(() => expect(screen.getByRole("button", { name: "Importer dans l'espace OIA" })).toBeEnabled());
  expect(mock.rpc).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Importer dans l'espace OIA" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("oia_importer_sauvegarde", { p_espace: "00000000-0000-4000-8000-000000000001", p_sauvegarde: backup }));
});
it("exige une confirmation explicite des modifications et éléments non vérifiables", async () => {
  mount(); fireEvent.click(screen.getByRole("button", { name: "Annuler cet import" }));
  const checkbox = await screen.findByRole("checkbox");
  expect(screen.getByRole("button", { name: "Confirmer l'annulation" })).toBeDisabled();
  fireEvent.click(checkbox); fireEvent.click(screen.getByRole("button", { name: "Confirmer l'annulation" }));
  await waitFor(() => expect(mock.rpc).toHaveBeenCalledWith("oia_annuler_import", { p_import: "import-1", p_confirmer_modifications: true }));
});
it("recharge l’aperçu et efface la confirmation après un conflit 55000", async () => {
  mock.rpc.mockImplementation(async (name: string) => {
    if (name === "oia_annuler_import") throw Object.assign(new Error("modified"), { code: "55000" });
    return { modifies_depuis_import: [{ id: "a" }], non_verifiables: 0 };
  });
  mount(); fireEvent.click(screen.getByRole("button", { name: "Annuler cet import" }));
  fireEvent.click(await screen.findByRole("checkbox")); fireEvent.click(screen.getByRole("button", { name: "Confirmer l'annulation" }));
  await waitFor(() => expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_apercu_annulation")).toHaveLength(2));
  await waitFor(() => expect(screen.getByRole("checkbox")).not.toBeChecked());
  expect(screen.getByRole("button", { name: "Confirmer l'annulation" })).toBeDisabled();
});