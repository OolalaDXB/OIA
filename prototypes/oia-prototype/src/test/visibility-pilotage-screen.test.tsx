import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { proprietesRapport, type ClientRpc } from "@/lib/donnees/visibility-pilotage";

afterEach(cleanup);
function BoutonTest({ client }: { client: ClientRpc }) {
  const geste = useGesteVisibility(client);
  return <><button onClick={() => void geste.executer("vis_acquitter_alerte", { p_alerte: "alerte-1" }).catch(() => {})}>Acquitter</button>{geste.erreur && <p role="alert">{geste.erreur}</p>}</>;
}

describe("comportement des gestes à l'écran", () => {
  it("invalide et relit les vues seulement après la réponse de la base", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const client: ClientRpc = { rpc: vi.fn().mockResolvedValue({ data: null, error: null }) };
    const r = render(<QueryClientProvider client={queryClient}><BoutonTest client={client} /></QueryClientProvider>);
    fireEvent.click(r.getByRole("button", { name: "Acquitter" }));
    await waitFor(() => expect(client.rpc).toHaveBeenCalledWith("vis_acquitter_alerte", { p_alerte: "alerte-1" }));
    await waitFor(() => expect(invalidate).toHaveBeenCalled());
    expect(invalidate.mock.calls[0]![0]).toHaveProperty("predicate");
  });
  it("affiche le message de la base près du bouton sans état optimiste", async () => {
    const queryClient = new QueryClient();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const client: ClientRpc = { rpc: vi.fn().mockResolvedValue({ data: null, error: { code: "42501", message: "droit refusé" } }) };
    const r = render(<QueryClientProvider client={queryClient}><BoutonTest client={client} /></QueryClientProvider>);
    fireEvent.click(r.getByRole("button", { name: "Acquitter" }));
    await waitFor(() => expect(r.getByRole("alert").textContent).toBe("droit refusé"));
    expect(invalidate).not.toHaveBeenCalled();
  });
  it("rend le rapport dans une iframe sans permission", () => {
    const props = proprietesRapport("<h1>Rapport réel</h1><script>throw Error('exécuté')</script>");
    const r = render(<iframe title="Rapport" {...props} />);
    const iframe = r.getByTitle("Rapport");
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toContain("Rapport réel");
    expect(iframe.getAttribute("allow")).toBeNull();
    expect(iframe.getAttribute("allow-scripts")).toBeNull();
  });
});
