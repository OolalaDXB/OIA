import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/oia/module-page";
import { moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/training")({ head: () => moduleHead("Training", "Training, module de démonstration OIA."), component: () => <ModulePage slug="training" /> });
