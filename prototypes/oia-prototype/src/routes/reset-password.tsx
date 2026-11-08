import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/oia/ui";
import { moduleHead } from "@/components/oia/visibility";
import { ResetPassword } from "@/components/oia/password-recovery";

export const Route = createFileRoute("/reset-password")({
  head: () => moduleHead("Nouveau mot de passe | OIA", "Choisir un nouveau mot de passe OIA depuis le lien de récupération reçu par e-mail."),
  component: () => <Shell fictif={false}><ResetPassword /></Shell>,
});