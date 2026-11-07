import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/oia/module-page";
import { moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/portefeuille")({ head: () => moduleHead("Portefeuille", "Projets du studio et leur avancement, module de démonstration OIA."), component: () => <ModulePage slug="portefeuille" /> });
