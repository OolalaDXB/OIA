import { createFileRoute } from "@tanstack/react-router";
import { VisibilityShell, AjouterCompte, SitesSuivis, SeoResume, moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/visibility/sites")({ head: () => moduleHead("Sites, Visibility", "Sites suivis dans le module Visibility."), component: () => (<VisibilityShell page="Sites" active="sites"><AjouterCompte /><SitesSuivis /></VisibilityShell>) });
