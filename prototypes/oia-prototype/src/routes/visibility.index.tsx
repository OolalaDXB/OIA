import { createFileRoute } from "@tanstack/react-router";
import { VisibilityShell, moduleHead } from "@/components/oia/visibility";
import { VueEnsemble } from "@/components/oia/visibility-vues";
export const Route = createFileRoute("/visibility/")({ head: () => moduleHead("Visibility, vue d’ensemble", "Présence dans les IA, part de voix, exactitude, position et paysage concurrentiel."), component: () => <VisibilityShell><VueEnsemble /></VisibilityShell> });
