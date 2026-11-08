import { createFileRoute } from "@tanstack/react-router";
import { ModulePage } from "@/components/oia/module-page";
import { moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/data")({ head: () => moduleHead("Data", "Data, module de démonstration OIA."), component: () => <ModulePage slug="data" /> });
