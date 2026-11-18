import { createFileRoute } from "@tanstack/react-router";
import { VisibilityAccueilShell, VisibilityShell, moduleHead } from "@/components/oia/visibility";
import { VueEnsemble } from "@/components/oia/visibility-vues";
import { AccueilSitesVisibility } from "@/components/oia/visibility-sites";

export const Route = createFileRoute("/visibility/")({
  head: () => moduleHead("Visibility, sites analysés", "Sites analysés : visibilité dans les IA, santé technique, actions prioritaires et étapes."),
  component: Accueil,
});
function Accueil() {
  const { site } = Route.useSearch();
  if (!site) return <VisibilityAccueilShell><AccueilSitesVisibility /></VisibilityAccueilShell>;
  return <VisibilityShell><VueEnsemble /></VisibilityShell>;
}
