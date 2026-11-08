import { createFileRoute, notFound } from "@tanstack/react-router";
import { VisibilityShell, ongletsVisibility, moduleHead } from "@/components/oia/visibility";
import { vuesVisibility } from "@/components/oia/visibility-vues";

export const Route = createFileRoute("/visibility/$onglet")({
  beforeLoad: ({ params }) => { if (!(params.onglet in vuesVisibility)) throw notFound(); },
  head: ({ params }) => { const t = ongletsVisibility.find((o) => o.id === params.onglet)?.label ?? "Visibility"; return moduleHead(`${t}, Visibility`, `${t} : vue de mesure Visibility, données de démonstration.`); },
  component: Onglet,
});
function Onglet() {
  const { onglet } = Route.useParams();
  const Vue = vuesVisibility[onglet as keyof typeof vuesVisibility];
  const label = ongletsVisibility.find((o) => o.id === onglet)?.label ?? "";
  return <VisibilityShell page={label} active={onglet}><Vue /></VisibilityShell>;
}
