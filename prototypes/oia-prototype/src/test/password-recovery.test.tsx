import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DefinePassword, ForgotPassword, ResetPassword } from "@/components/oia/password-recovery";

const mocks = vi.hoisted(() => ({
  reset: vi.fn(), update: vi.fn(),
  auth: { user: null as null | { id: string }, loading: false, recovery: false },
}));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { resetPasswordForEmail: mocks.reset, updateUser: mocks.update } } }));
vi.mock("@/lib/oia-auth", () => ({ useOiaAuth: () => mocks.auth }));
vi.mock("@tanstack/react-router", () => ({ Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.user = null; mocks.auth.recovery = false;
  window.history.replaceState(null, "", "/reset-password");
  mocks.reset.mockResolvedValue({ error: null }); mocks.update.mockResolvedValue({ error: null });
});
afterEach(cleanup);
describe("Récupération OIA", () => {
  it("transmet le mot de passe actuel pour un changement connecté", async () => {
    render(<DefinePassword />);
    fireEvent.click(screen.getByRole("button", { name: "Définir mon mot de passe" }));
    fireEvent.change(screen.getByLabelText("Mot de passe actuel, si vous en avez un"), { target: { value: "Old-example-123" } });
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "New-example-123" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "New-example-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password: "New-example-123", current_password: "Old-example-123" }));
  });
  it("permet la définition initiale quand le compte n’a pas encore de mot de passe", async () => {
    render(<DefinePassword />);
    fireEvent.click(screen.getByRole("button", { name: "Définir mon mot de passe" }));
    fireEvent.change(screen.getByLabelText("Nouveau mot de passe"), { target: { value: "New-example-123" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "New-example-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password: "New-example-123" }));
  });
  it("demande un lien sur la page publique de réinitialisation", async () => {
    render(<ForgotPassword />);
    fireEvent.change(screen.getByLabelText("E-mail"), { target: { value: "test@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Recevoir le lien" }));
    await waitFor(() => expect(mocks.reset).toHaveBeenCalledWith("test@example.com", { redirectTo: `${window.location.origin}/reset-password` }));
  });
  it("n’autorise pas un changement sans lien de récupération", async () => {
    mocks.auth.user = { id: "existing" };
    render(<ResetPassword />);
    await screen.findByRole("alert");
    expect(screen.queryByLabelText("Nouveau mot de passe")).toBeNull();
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("envoie uniquement le nouveau mot de passe depuis une session de récupération", async () => {
    mocks.auth.user = { id: "existing" }; mocks.auth.recovery = true;
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("Nouveau mot de passe"), { target: { value: "Example-only-123" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "Example-only-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    await waitFor(() => expect(mocks.update).toHaveBeenCalledWith({ password: "Example-only-123" }));
  });
  it("bloque des mots de passe différents", async () => {
    mocks.auth.user = { id: "existing" }; mocks.auth.recovery = true;
    render(<ResetPassword />);
    fireEvent.change(await screen.findByLabelText("Nouveau mot de passe"), { target: { value: "Example-only-123" } });
    fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "Different-123" } });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le mot de passe" }));
    expect(mocks.update).not.toHaveBeenCalled();
  });
});