import { createFileRoute } from "@tanstack/react-router";
import { VisibilityShell, SitesSuivis, moduleHead } from "@/components/oia/visibility";
import { PortefeuilleVisibility } from "@/components/oia/visibility-pilotage";
import { useDonnees } from "@/lib/donnees-visibility";
export const Route = createFileRoute("/visibility/sites")({ head: () => moduleHead("Sites, Visibility", "Portefeuille des sites et pilotage des études Visibility."), component: () => (<VisibilityShell page="Sites" active="sites"><SitesOuPortefeuille /></VisibilityShell>) });
function SitesOuPortefeuille() { const { reel } = useDonnees(); return reel ? <PortefeuilleVisibility /> : <SitesSuivis />; }
