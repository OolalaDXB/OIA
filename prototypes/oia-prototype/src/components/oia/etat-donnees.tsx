import { Component, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useEtatDonnees, type ModuleDonnees } from "@/lib/donnees/provider";

function Indisponible({ reessayer }: { reessayer: () => void }) {
  return <div role="alert" className="border-t border-border py-8"><p className="text-sm text-muted-foreground">Les données sont indisponibles pour le moment.</p><Button variant="outline" className="mt-4 min-h-11" onClick={reessayer}>Réessayer</Button></div>;
}
class ErreurEcran extends Component<{ children: ReactNode }, { erreur: boolean }> {
  override state = { erreur: false };
  static getDerivedStateFromError() { return { erreur: true }; }
  override render() { return this.state.erreur ? <Indisponible reessayer={() => this.setState({ erreur: false })} /> : this.props.children; }
}
/** Ne produit aucun élément supplémentaire quand les données sont prêtes. */
export function EtatEcran({ module, children }: { module: ModuleDonnees; children: ReactNode }) {
  const { etat, recharger } = useEtatDonnees(module);
  if (etat.statut === "chargement") return <p role="status" className="border-t border-border py-8 text-sm text-muted-foreground">Chargement des données…</p>;
  if (etat.statut === "vide") return <p role="status" className="border-t border-border py-8 text-sm text-muted-foreground">Aucune donnée pour le moment.</p>;
  if (etat.statut === "erreur") return <Indisponible reessayer={recharger} />;
  return <ErreurEcran key={module}>{children}</ErreurEcran>;
}