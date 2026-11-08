import { act, cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { OiaAuthProvider, useOiaAuth } from "@/lib/oia-auth";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), invalidate: vi.fn(), navigate: vi.fn(), callback: null as null | ((event: string, session: { user: { id: string } }) => void) }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: mocks.getUser, onAuthStateChange: (callback: typeof mocks.callback) => { mocks.callback = callback; return { data: { listener: {}, subscription: { unsubscribe: vi.fn() } } }; } } } }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => mocks.navigate, useRouter: () => router }));
const router = { invalidate: mocks.invalidate };
afterEach(cleanup);
it("ignore les événements SIGNED_IN répétés pour l’identité déjà validée", async () => {
  mocks.getUser.mockResolvedValue({ data: { user: { id: "same-user" } }, error: null });
  function State() { const auth = useOiaAuth(); return <p>{auth.loading ? "loading" : auth.user?.id}</p>; }
  const client = new QueryClient();
  render(<QueryClientProvider client={client}><OiaAuthProvider><State /></OiaAuthProvider></QueryClientProvider>);
  await screen.findByText("same-user");
  await act(async () => { for (let i = 0; i < 5; i++) mocks.callback?.("SIGNED_IN", { user: { id: "same-user" } }); });
  expect(mocks.getUser).toHaveBeenCalledTimes(1);
  expect(mocks.invalidate).not.toHaveBeenCalled();
  expect(screen.queryByText("loading")).toBeNull();
  client.clear();
});