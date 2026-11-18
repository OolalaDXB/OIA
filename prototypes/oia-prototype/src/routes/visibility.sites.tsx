import { createFileRoute, redirect } from "@tanstack/react-router";
/** Ancienne adresse du portefeuille : l'accueil Visibility liste désormais les sites. */
export const Route = createFileRoute("/visibility/sites")({
  beforeLoad: () => { throw redirect({ to: "/visibility", search: ((prev: { site?: string; reglage?: string }) => ({ ...prev, site: undefined })) as unknown as () => { reglage?: string }, hash: "ajouter-un-site" }); },
});
