import { Section } from "@/components/oia/ui";
import { LogoAssistant } from "@/components/oia/visibility-identites";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFiltres } from "@/components/oia/mesure";
import { useVisibilityDonnees } from "@/lib/donnees/provider";

const categories = [
  { id: "positifN", label: "Positif", couleur: "var(--chart-2)" },
  { id: "neutreN", label: "Neutre", couleur: "var(--chart-3)" },
  { id: "negatifN", label: "Négatif", couleur: "var(--chart-4)" },
] as const;

export function RepartitionSentiment() {
  const donnees = useVisibilityDonnees();
  const f = useFiltres();
  const lignes = donnees.assistants.map((assistant) => {
    const sentiment = donnees.sentimentAssistants?.[f.fenetreActive.id]?.[assistant.nom];
    return { assistant, sentiment };
  }).filter(({ sentiment }) => sentiment && sentiment.positif !== null && sentiment.effectif);
  return <Section titre="Répartition du sentiment par assistant">
    <p className="mb-5 text-sm text-muted-foreground">Comparez le nombre de réponses positives, neutres et négatives pour repérer l'assistant à corriger en priorité.</p>
    {lignes.length === 0 ? <p className="text-sm text-muted-foreground">Non mesurable : aucune répartition jugée par assistant pour cette fenêtre.</p> : <>
      <div className="mb-5 flex flex-wrap gap-4 text-xs text-tertiary" aria-label="Légende du sentiment">{categories.map((c) => <span key={c.id} className="inline-flex items-center gap-2"><span className="size-2 rounded-sm" style={{ backgroundColor: c.couleur }} />{c.label}</span>)}</div>
      <div className="grid gap-5">{lignes.map(({ assistant, sentiment }) => {
        const effectif = sentiment!.effectif ?? 0;
        return <div key={assistant.nom} className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)_5rem] sm:items-center sm:gap-4"><span className="flex items-center gap-2 text-sm"><LogoAssistant nom={assistant.nom} petite />{assistant.nom}</span><TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild><span tabIndex={0} aria-label={`Sentiment ${assistant.nom}, ${effectif} réponses citant la marque`} className="flex h-5 w-full overflow-hidden rounded-sm bg-track outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">{categories.map((c) => {
          const nombre = sentiment![c.id] ?? 0;
          return nombre > 0 ? <span key={c.id} style={{ width: `${nombre / effectif * 100}%`, backgroundColor: c.couleur }} /> : null;
        })}</span></TooltipTrigger><TooltipContent className="border border-border bg-popover text-popover-foreground"><p className="mb-2">{assistant.nom} · {effectif} réponse{effectif > 1 ? "s" : ""}</p>{categories.map((c) => { const n = sentiment![c.id] ?? 0; return <p key={c.id} className="num flex items-center justify-between gap-5 py-0.5"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-sm" style={{ backgroundColor: c.couleur }} />{c.label}</span><span>{n} · {Math.round(n / effectif * 10000) / 100} %</span></p>; })}{(sentiment!.mixteN ?? 0) > 0 && <p className="num mt-1">Mixtes : {sentiment!.mixteN}</p>}</TooltipContent></Tooltip></TooltipProvider><span className="num text-xs text-tertiary sm:text-right">{effectif} réponse{effectif > 1 ? "s" : ""}</span></div>;
      })}</div>
    </>}
  </Section>;
}
