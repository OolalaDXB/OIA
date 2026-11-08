import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/oia/ui";
import { moduleHead } from "@/components/oia/visibility";
import { ForgotPassword } from "@/components/oia/password-recovery";

export const Route = createFileRoute("/forgot-password")({
  head: () => moduleHead("Mot de passe oublié | OIA", "Recevoir un lien pour réinitialiser le mot de passe de votre compte OIA existant."),
  component: () => <Shell fictif={false}><ForgotPassword /></Shell>,
});