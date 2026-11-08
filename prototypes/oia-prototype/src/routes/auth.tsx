import { createFileRoute } from "@tanstack/react-router";
import { Shell } from "@/components/oia/ui";
import { ConnexionOia } from "@/lib/oia-auth";
import { moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/auth")({ head: () => moduleHead("Connexion OIA", "Connexion aux comptes OIA existants, sans inscription."), component: () => <Shell fictif={false}><h1 className="mb-8 text-3xl">OIA</h1><ConnexionOia /></Shell> });