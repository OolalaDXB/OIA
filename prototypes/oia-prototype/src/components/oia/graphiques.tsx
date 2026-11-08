import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export const couleursGraphique = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
export function couleurSerie(label: string) {
  let hash = 0;
  for (const c of label) hash = (hash + c.charCodeAt(0)) % couleursGraphique.length;
  return couleursGraphique[hash] ?? couleursGraphique[0];
}
export function BarreColoree({ label, largeur, detail, couleur }: { label: string; largeur: number; detail: string; couleur?: string | undefined }) {
  const color = couleur ?? couleurSerie(label);
  return <TooltipProvider delayDuration={100}><Tooltip><TooltipTrigger asChild>
    <span tabIndex={0} aria-label={`${label} : ${detail}`} className="block h-4 w-full rounded-sm bg-track outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">
      <span className="block h-full rounded-sm" style={{ width: `${Math.max(0, Math.min(100, largeur))}%`, backgroundColor: color }} />
    </span>
  </TooltipTrigger><TooltipContent className="border border-border bg-popover text-popover-foreground"><span className="inline-flex items-center gap-2"><span className="size-2 rounded-sm" style={{ backgroundColor: color }} />{label}</span><p className="num mt-1">{detail}</p></TooltipContent></Tooltip></TooltipProvider>;
}