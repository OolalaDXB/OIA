import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Section } from "@/components/oia/ui";
import { useOiaAuth } from "@/lib/oia-auth";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  comparerMesures, departEtAujourdhui, efficaciteDemo, INDICATEURS, lireEfficacite, lireEfficaciteMesures, mesuresDemo, reperesResolution,
  tendanceScoreIa, trierJours, variation, type EfficaciteJourV3, type EfficaciteMesureV3, type Indicateur, type Variation,
} from "@/lib/donnees/visibility-efficacite";

export const PHRASE_HONNETETE = "Les moteurs mettent de plusieurs jours à plusieurs semaines à prendre en compte une correction. Une hausse ne prouve pas à elle seule qu'une correction en est la cause.";
const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const mois = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const d = (v: string) => new Date(v.length === 10 ? `${v}T00:00:00Z` : v);
const fmt = (v: number | null | undefined) => v === null || v === undefined ? "Non mesuré" : v.toLocaleString("fr-FR");

function valeurIndicateur(ligne: EfficaciteJourV3 | null, ind: Indicateur) {
  if (!ligne) return "Non mesuré";
  if (ind.cle === "google_pages_indexees") {
    const x = ligne.google_pages_indexees, y = ligne.google_pages_inspectees;
    return x === null ? "Non mesuré" : `${x.toLocaleString("fr-FR")}/${y === null ? "?" : y.toLocaleString("fr-FR")}`;
  }
  if (ind.cle === "score_indexation") return ligne.score_indexation === null ? "Non mesuré" : `${ligne.score_indexation} / 100`;
  return fmt(ligne[ind.cle]);
}

export function FlecheVariation({ v, sur }: { v: Variation; sur?: string }) {
  const Icone = v.delta === null || v.delta === 0 ? Minus : v.delta > 0 ? ArrowUp : ArrowDown;
  const classe = v.tendance === "amelioration" ? "text-ok" : v.tendance === "degradation" ? "text-block" : "text-muted-foreground";
  const texte = v.delta === null ? "variation non mesurable" : v.delta === 0 ? "stable" : `${v.delta > 0 ? "+" : ""}${v.delta.toLocaleString("fr-FR")}${sur ?? ""}`;
  const sens = v.tendance === "amelioration" ? "amélioration" : v.tendance === "degradation" ? "dégradation" : v.tendance === "stable" ? "stable" : "inconnue";
  return <span data-tendance={v.tendance} className={`num inline-flex items-center gap-1 text-xs ${classe}`}><Icone className="size-3.5" aria-hidden="true" />{texte}<span className="sr-only"> ({sens})</span></span>;
}

function Courbe({ points, domaine, reperes, label }: { points: { jour: string; v: number | null }[]; domaine: [number, number]; reperes: string[]; label: string }) {
  const L = 600, H = 70, P = 4;
  const vals = points.map((p) => p.v).filter((v): v is number => v !== null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const x = (jour: string) => domaine[1] === domaine[0] ? L / 2 : P + ((d(jour).getTime() - domaine[0]) / (domaine[1] - domaine[0])) * (L - 2 * P);
  const y = (v: number) => max === min ? H / 2 : H - P - ((v - min) / (max - min)) * (H - 2 * P);
  const segments: string[] = []; let courant = "";
  for (const p of points) { if (p.v === null) { if (courant) segments.push(courant); courant = ""; continue; } courant += `${courant ? "L" : "M"}${x(p.jour).toFixed(1)},${y(p.v).toFixed(1)}`; }
  if (courant) segments.push(courant);
  return <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className="h-12 w-full" role="img" aria-label={label}>
    {reperes.map((r) => <line key={r} data-repere={r} x1={x(r)} x2={x(r)} y1={0} y2={H} className="stroke-warn" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />)}
    {segments.map((s, i) => <path key={i} d={s} fill="none" className="stroke-chart-1" strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
    {vals.length === 0 && <text x={L / 2} y={H / 2} textAnchor="middle" className="fill-muted-foreground text-xs">Non mesuré</text>}
  </svg>;
}

export function MiniCourbe({ valeurs, label }: { valeurs: (number | null)[]; label: string }) {
  const vals = valeurs.filter((v): v is number => v !== null);
  if (vals.length < 2) return <span className="text-xs text-tertiary">Impressions Google non mesurées</span>;
  const min = Math.min(...vals), max = Math.max(...vals), L = 100, H = 24;
  const pts = valeurs.map((v, i) => v === null ? null : `${(i / (valeurs.length - 1)) * L},${max === min ? H / 2 : H - 2 - ((v - min) / (max - min)) * (H - 4)}`).filter(Boolean);
  return <svg viewBox={`0 0 ${L} ${H}`} preserveAspectRatio="none" className="h-6 w-24" role="img" aria-label={label}><polyline points={pts.join(" ")} fill="none" className="stroke-chart-1" strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>;
}

function useEfficacite(subject?: string) {
  const { connecte } = useVisibilityV3();
  const auth = useOiaAuth();
  const userId = auth.user?.id ?? "";
  const options = { enabled: connecte && Boolean(userId) && !auth.loading, retry: false, refetchOnWindowFocus: false } as const;
  const jours = useQuery({ queryKey: ["visibility-efficacite", userId, subject ?? "tous"], queryFn: () => lireEfficacite(subject), ...options });
  const mesures = useQuery({ queryKey: ["visibility-efficacite-mesures", userId, subject ?? "tous"], queryFn: () => lireEfficaciteMesures(subject), ...options });
  return { connecte, jours, mesures, lignes: connecte ? jours.data ?? [] : efficaciteDemo, lignesMesures: connecte ? mesures.data ?? [] : mesuresDemo };
}

export function VueEfficacite({ subject }: { subject: string }) {
  const { donnees } = useVisibilityV3();
  const { connecte, jours, mesures, lignes, lignesMesures } = useEfficacite(subject);
  const serie = trierJours(lignes, subject);
  const { depart, aujourdhui } = departEtAujourdhui(serie);
  const reperes = reperesResolution(donnees.constats, subject);
  const premier = serie[0], dernier = serie[serie.length - 1];
  const domaine: [number, number] = premier && dernier ? [d(premier.jour).getTime(), d(dernier.jour).getTime()] : [0, 0];
  const reperesVisibles = reperes.filter((r) => serie.length && d(r).getTime() >= domaine[0] && d(r).getTime() <= domaine[1]);
  const comparaisons = comparerMesures(lignesMesures, subject).reverse();
  return <div className="mt-6 grid gap-6">
    <Section titre="Efficacité des corrections" aside={<span className="text-xs text-tertiary">Ce qu'on corrige fait-il bouger les choses ?</span>}>
      {connecte && jours.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement de l'historique d'hygiène…</p>
      : connecte && jours.error ? <div role="alert" className="text-sm text-block">{jours.error.message}</div>
      : serie.length === 0 ? <p className="text-sm text-muted-foreground">Aucun jour d'hygiène enregistré pour ce site.</p>
      : <div className="overflow-x-auto"><table className="num w-full text-sm">
        <thead className="text-left text-xs text-tertiary"><tr className="border-b border-border"><th className="py-2 pr-3 font-normal">Indicateur</th><th className="py-2 pr-3 text-right font-normal">Point de départ<span className="block">{dateCourte.format(d(depart!.jour))}</span></th><th className="py-2 pr-3 text-right font-normal">Aujourd'hui<span className="block">{dateCourte.format(d(aujourdhui!.jour))}</span></th><th className="py-2 text-right font-normal">Variation</th></tr></thead>
        <tbody>{INDICATEURS.map((ind) => <tr key={ind.cle} className="border-b border-border last:border-0"><td className="py-2.5 pr-3">{ind.label}</td><td className="py-2.5 pr-3 text-right">{valeurIndicateur(depart, ind)}</td><td className="py-2.5 pr-3 text-right">{valeurIndicateur(aujourdhui, ind)}</td><td className="py-2.5 text-right"><FlecheVariation v={variation(depart?.[ind.cle], aujourdhui?.[ind.cle], ind.sens)} /></td></tr>)}</tbody>
      </table></div>}
    </Section>
    {serie.length > 1 && <Section titre="Évolution dans le temps" aside={<span className="inline-flex items-center gap-2 text-xs text-tertiary"><svg width="14" height="10" aria-hidden="true"><line x1="7" x2="7" y1="0" y2="10" className="stroke-warn" strokeDasharray="2 2" /></svg>Constat résolu</span>}>
      <div className="grid gap-4">{INDICATEURS.map((ind) => <div key={ind.cle}><p className="text-xs text-tertiary">{ind.label}</p><Courbe label={`${ind.label} dans le temps`} points={serie.map((l) => ({ jour: l.jour, v: l[ind.cle] }))} domaine={domaine} reperes={reperesVisibles} /></div>)}</div>
      <div className="mt-2 flex justify-between text-xs text-tertiary"><span>{premier && dateCourte.format(d(premier.jour))}</span><span>{dernier && dateCourte.format(d(dernier.jour))}</span></div>
      {reperesVisibles.length > 0 && <p className="mt-3 text-xs text-muted-foreground">Constats résolus le {reperesVisibles.map((r) => dateCourte.format(d(r))).join(", ")}.</p>}
    </Section>}
    <Section titre="Visibilité dans les IA, mois par mois">
      {connecte && mesures.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des mesures…</p>
      : connecte && mesures.error ? <div role="alert" className="text-sm text-block">{mesures.error.message}</div>
      : comparaisons.length === 0 ? <p className="text-sm text-muted-foreground">Aucune mesure de visibilité dans les IA pour ce site.</p>
      : <ul>{comparaisons.map(({ mesure: m, precedente, comparable, deltaScore }) => <li key={`${m.realise_le}-${m.id ?? ""}`} className="flex flex-wrap items-start justify-between gap-3 border-b border-border py-3 text-sm last:border-0">
        <div><p className="capitalize">{mois.format(d(m.realise_le))}{m.mensuelle === false && <span className="ml-2 text-xs normal-case text-tertiary">mesure ponctuelle</span>}</p>
          <p className="num mt-1 text-muted-foreground">{m.citations_sans_nom === null || m.reponses_sans_nom === null ? "Citations sans le nom non mesurées" : `Cité ${m.citations_sans_nom} fois sur ${m.reponses_sans_nom} réponses sans le nom`}</p>
          <p className="mt-1 text-xs text-tertiary">{!precedente ? "Première mesure" : comparable ? <>Comparé à {mois.format(d(precedente.realise_le))} : <FlecheVariation v={{ delta: deltaScore, tendance: deltaScore === null ? "inconnue" : deltaScore > 0 ? "amelioration" : deltaScore < 0 ? "degradation" : "stable" }} sur=" points" /></> : "Questions différentes, non comparable"}</p></div>
        <div className="text-right"><p className="num text-lg">{m.score === null ? "Non mesuré" : <>{m.score}<span className="text-xs"> / 100</span></>}</p><p className="num text-xs text-tertiary">Coût réel {m.cout_reel_usd === null ? "non relevé" : `${m.cout_reel_usd.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`}</p></div>
      </li>)}</ul>}
    </Section>
    <p className="text-xs text-muted-foreground">{PHRASE_HONNETETE}</p>
  </div>;
}

/** Résumé pour les cartes de l'accueil des sites : une lecture commune pour tous les sites. */
export function useResumeEfficacite() {
  const { lignes, lignesMesures } = useEfficacite();
  return (subject: string) => ({
    impressions: trierJours(lignes, subject).map((l) => l.google_impressions_28j),
    tendance: tendanceScoreIa(lignesMesures, subject),
  });
}
export function ResumeEfficaciteCarte({ impressions, tendance }: { impressions: (number | null)[]; tendance: ReturnType<typeof tendanceScoreIa> }) {
  return <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
    <div><p className="text-xs text-tertiary">Impressions Google</p><MiniCourbe valeurs={impressions} label="Impressions Google dans le temps" /></div>
    <div className="text-right"><p className="text-xs text-tertiary">Tendance score IA</p>{tendance.comparable ? <FlecheVariation v={tendance} sur=" pts" /> : <span className="text-xs text-tertiary">Non comparable</span>}</div>
  </div>;
}
export type { EfficaciteMesureV3 };
