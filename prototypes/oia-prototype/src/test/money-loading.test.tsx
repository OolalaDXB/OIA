import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MoneyProvider, Aujourdhui, Liste } from "@/components/oia/money";
import { AccesMoney } from "@/components/oia/money-commun";
const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), user: { id: "test-session" } }));
vi.mock("@/lib/supabase", () => ({ supabase: { from: mock.from, rpc: mock.rpc } }));
vi.mock("@/lib/oia-auth", () => ({ useOiaAuth: () => ({ user: mock.user, loading: false }), ConnexionOia: () => null }));
vi.mock("@/components/oia/money-fiche", () => ({ FicheMoney: () => null }));
vi.mock("@/components/oia/ui", () => ({ Shell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
let client: QueryClient;
beforeEach(() => {
  vi.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === "oia_role" ? "owner" : null, error: null }));
  mock.from.mockImplementation((view: string) => {
    const builder = { select: () => builder, eq: () => builder, range: async () => ({ data: view === "ml_aujourdhui_v2" ? [{ raison: "TACHE_A_FAIRE", titre: "Travail à reprendre", reference: "test" }] : [], error: null }) };
    return builder;
  });
});
afterEach(() => { cleanup(); client.clear(); });
function Screen({ tab = "today" }: { tab?: string }) {
  return <QueryClientProvider client={client}><MoneyProvider><AccesMoney>{tab === "today" ? <Aujourdhui /> : <Liste type="Financement" />}</AccesMoney></MoneyProvider></QueryClientProvider>;
}
async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); }); }
describe("Chargement Money sans boucle", () => {
  it("lit chaque vue une seule fois malgré les observateurs du rôle et la visite", async () => {
    const rendered = render(<Screen />);
    await screen.findByText("Travail à reprendre");
    await settle();
    rendered.rerender(<Screen />);
    await settle();
    for (const view of ["ml_aujourdhui_v2", "ml_clos_depuis_visite_v1", "ml_toutes_v2"]) {
      expect(mock.from.mock.calls.filter(([name]) => name === view)).toHaveLength(1);
    }
    expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_role")).toHaveLength(1);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_marquer_visite")).toHaveLength(1);
  });
  it("ne relit pas le rôle ou la visite au changement d’onglet et lit une fois les nouvelles vues", async () => {
    const rendered = render(<Screen />);
    await screen.findByText("Travail à reprendre");
    rendered.rerender(<Screen tab="funding" />);
    await waitFor(() => expect(mock.from).toHaveBeenCalledWith("ml_financements_v2"));
    await settle();
    for (const view of ["ml_financements_v2", "ml_vues_enregistrees_v1"]) expect(mock.from.mock.calls.filter(([name]) => name === view)).toHaveLength(1);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_role")).toHaveLength(1);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_marquer_visite")).toHaveLength(1);
    rendered.unmount(); render(<Screen />);
    await screen.findByText("Travail à reprendre"); await settle();
    expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_marquer_visite")).toHaveLength(2);
    expect(mock.rpc.mock.calls.filter(([name]) => name === "oia_role")).toHaveLength(1);
  });
});