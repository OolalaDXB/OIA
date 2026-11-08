import { Shell, Fictif, Statut } from "@/components/oia/ui";
import { useAccueilDonnees } from "@/lib/donnees/provider";
export function ModulePage({ slug }: { slug: string }) {
  const { modules } = useAccueilDonnees();
  const m = modules.find((m) => m.slug === slug);
  if (!m) return null;
  return <Shell><Fictif /><h1 className="mt-2 text-3xl">{m.nom}</h1><p className="mt-4 text-sm text-muted-foreground">{m.role}</p><section className="mt-10 border-t border-border py-8"><Statut etat={m.statut} label={m.etat} /><p className="mt-5 text-sm">{m.cle}</p><p className="mt-3 text-xs text-tertiary">Aucune opération en cours.</p></section></Shell>;
}
