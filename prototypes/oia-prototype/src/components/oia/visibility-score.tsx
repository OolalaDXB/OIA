import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/oia/ui";
import { BarreColoree } from "@/components/oia/graphiques";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { libelleVisibility, menuVisibility } from "@/components/oia/visibility-ui";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useSelectionVisibility, useVisibilityDonnees } from "@/lib/donnees/provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  actionsPrioritairesMixtes, COMPOSANTES_IA, COMPOSANTES_SITE, couleurScore, demandeAnalyseActive,
  historiqueParJour, valeurComposante, variationScore, type ComposanteScore, type PointHistorique, type ScoreV3,
} from "@/lib/donnees/visibility-v3";

export function EtatVisibilityV3({ children }: { children: ReactNode }) {
  const { connecte, query } = useVisibilityV3();
  if (connecte && query.isPending) return <p role="status" className="border-t border-border py-8 text-sm text-muted-foreground">Chargement du score et des analyses…</p>;
  if (connecte && query.error) return <div role="alert" className="border-t border-border py-8"><p className="text-sm text-block">{query.error.message}</p><Button variant="outline" className="mt-4 min-h-11" onClick={() => void query.refetch()}>Réessayer</Button></div>;
  return children;
}

export function SelecteurSujetV3({ subject }: { subject: string }) {
  const { connecte, donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  if (!connecte) return null;
  const ids = [...new Set([...selection.sujets.map((s) => s.id), ...donnees.scores.map((s) => s.subject_id).filter((id): id is string => Boolean(id)), ...donnees.audits.map((a) => a.subject_id).filter((id): id is string => Boolean(id))])];
  return <label className="grid min-w-56 gap-1.5 text-xs text-tertiary">Site<select aria-label="Site analysé" className={menuVisibility} value={subject} onChange={(e) => selection.setSujetId(e.target.value)}>{ids.map((id) => <option key={id} value={id}>{selection.sujets.find((s) => s.id === id)?.nom ?? id}</option>)}</select></label>;
}

export function BoutonAnalyse({ subject, compact = false }: { subject: string; compact?: boolean }) {
  const { connecte } = useVisibilityV3();
  const { global } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const active = demandeAnalyseActive(global?.demandes ?? [], subject);
  const label = active?.statut === "RUNNING" ? "Analyse en cours" : active?.statut === "QUEUED" ? "Analyse en file" : geste.enCours ? "Demande en cours…" : "Analyser maintenant";
  return <div className={compact ? "inline-block" : ""}>
    <Button type="button" variant={compact ? "outline" : "default"} className="min-h-11" disabled={!connecte || geste.enCours || Boolean(active)} title={!connecte ? "Connectez-vous pour demander une analyse réelle" : "Analyse gratuite, sans GO ni plafond"} onClick={async () => {
      try { await geste.executer("vis_demander_analyse", { p_subject: subject }); } catch { /* message RPC affiché */ }
    }}>{label}</Button>
    {!connecte && <span className="mt-1 block text-xs text-tertiary">Connexion requise pour lancer une analyse réelle.</span>}
    {active && <p role="status" className="mt-2 text-xs text-tertiary">La demande est suivie dans l'activité du moteur. Les vues seront relues après chaque action.</p>}
    <ErreurGeste erreur={geste.erreur} />
  </div>;
}

export function JaugeScore({ score, petite = false }: { score: number | null | undefined; petite?: boolean }) {
  const valeur = typeof score === "number" && Number.isFinite(score) ? score : null;
  const rayon = 52;
  const circonference = 2 * Math.PI * rayon;
  const progression = valeur === null ? 0 : Math.max(0, Math.min(100, valeur));
  return <div className={`relative ${petite ? "size-28" : "size-44"}`} role="img" aria-label={valeur === null ? "Score non mesuré" : `Score ${valeur} sur 100`}>
    <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={rayon} fill="none" stroke="var(--track)" strokeWidth="11" />
      {valeur !== null && <circle cx="60" cy="60" r={rayon} fill="none" stroke={couleurScore(valeur)} strokeWidth="11" strokeLinecap="round" strokeDasharray={circonference} strokeDashoffset={circonference * (1 - progression / 100)} />}
    </svg>
    <span className={`num absolute inset-0 flex items-center justify-center ${valeur === null ? "px-3 text-center text-xs text-muted-foreground" : petite ? "text-3xl" : "text-5xl"}`}>{valeur === null ? "Non mesuré" : valeur}<span className="sr-only">sur 100</span></span>
  </div>;
}

function Variation({ score }: { score: ScoreV3 | undefined }) {
  const { donnees } = useVisibilityV3();
  const variation = variationScore(score, donnees.historique);
  if (variation === null) return <p className="mt-2 text-xs text-tertiary">Aucun point précédent pour calculer la variation.</p>;
  const Icone = variation > 0 ? ArrowUpRight : variation < 0 ? ArrowDownRight : Minus;
  return <p className="num mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><Icone className="size-4" aria-hidden="true" />{variation > 0 ? "+" : ""}{String(variation).replace(".", ",")} point{Math.abs(variation) > 1 ? "s" : ""} depuis le point précédent</p>;
}

function Composantes({ score, subject, composantes }: { score: ScoreV3 | undefined; subject: string; composantes: readonly { id: ComposanteScore; label: string; mesure: string }[] }) {
  const { connecte } = useVisibilityV3();
  return <div>
    {composantes.map((composante) => {
      const valeur = valeurComposante(score, composante.id);
      const manquante = valeur === null;
      return <div key={composante.id} className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(9rem,1fr)_minmax(7rem,1fr)_auto] sm:items-center sm:gap-4">
        <p className="text-sm">{composante.label}</p>
        {manquante ? <span className="block h-5 rounded-sm bg-track" aria-label={`${composante.label} non mesurée`} /> : <BarreColoree label={composante.label} largeur={valeur ?? 0} detail={`${valeur} sur 100`} couleur={couleurScore(valeur)} />}
        <div className="sm:min-w-28 sm:text-right">{manquante ? <div><span className="text-xs text-muted-foreground">Non mesurée</span>{connecte && (composante.mesure === "ia" ? <Button asChild variant="link" className="mt-1 h-auto min-h-11 px-0 text-xs"><Link to="/sites/$slug" params={{ slug: subject }}>Préparer la mesure IA</Link></Button> : <BoutonAnalyse subject={subject} compact />)}</div> : <span className="num text-sm font-medium">{valeur} / 100</span>}</div>
      </div>;
    })}
  </div>;
}

function TopActions({ subject, limite = 3 }: { subject: string; limite?: number }) {
  const { donnees } = useVisibilityV3();
  const { recommandationsV2 } = useVisibilityDonnees();
  const actions = actionsPrioritairesMixtes(recommandationsV2 ?? [], donnees.constats, subject, limite);
  if (!actions.length) return <p className="text-sm text-muted-foreground">Aucune recommandation en attente ni constat ouvert.</p>;
  return <ol>{actions.map((action, index) => <li key={action.id} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-border py-4 last:border-0">
    <span className="num text-sm text-tertiary">{String(index + 1).padStart(2, "0")}</span>
    <div><p className="mb-1 text-xs font-medium text-module-visibility">{action.origine}</p><h4 className="text-sm font-medium">{action.titre}</h4><p className="mt-1 text-sm text-muted-foreground">{action.explication}</p><p className="mt-2 text-xs text-tertiary">{action.impact ? `Gain attendu : ${libelleVisibility(action.impact)}` : "Gain attendu non chiffré"} · Effort {action.effort ?? "non fourni"}</p></div>
  </li>)}</ol>;
}

const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function CourbeScore({ subject }: { subject: string }) {
  const { donnees } = useVisibilityV3();
  const { recommandationsV2 } = useVisibilityDonnees();
  const points: Array<PointHistorique & { actions: string }> = historiqueParJour(donnees.historique, subject).map((point) => {
    const actions = (recommandationsV2 ?? []).filter((r) => r.execute_le?.slice(0, 10) === point.jour).map((r) => r.titre).filter(Boolean);
    return { ...point, actions: actions.join(" · ") };
  });
  const annotations = points.filter((p) => p["actions"]);
  const dernier = points.at(-1);
  return <Section titre="Évolution des deux scores">
    <p className="mb-4 text-sm text-muted-foreground">La visibilité IA et la santé technique évoluent séparément : une bonne technique ne compense pas une absence dans les réponses.</p>
    {points.length === 0 ? <p className="text-sm text-muted-foreground">Aucun historique pour ce site.</p> : <>
      <p className="carte-chiffre mb-5 text-sm" style={{ "--carte-couleur": "var(--module-visibility)" } as React.CSSProperties}><strong className="num text-xl">{typeof dernier?.["score"] === "number" ? `${dernier["score"]} / 100` : "Non mesuré"}</strong><span className="mt-1 block">de visibilité IA au dernier point, contre {typeof dernier?.["score_site"] === "number" ? `${dernier["score_site"]} / 100` : "une santé technique non mesurée"} pour le site.</span></p>
      <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="jour" tickFormatter={(v: string) => dateCourte.format(new Date(`${v}T00:00:00Z`))} tick={{ fill: "var(--tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} width={36} tick={{ fill: "var(--tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const point = payload[0]?.payload as Record<string, string | number | null>;
          return <div role="status" className="max-w-xs rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-card"><p>{dateCourte.format(new Date(`${label}T00:00:00Z`))}</p><p className="num mt-2">Visibilité IA : {typeof point["score"] === "number" ? `${point["score"]} / 100` : "Non mesurée"}</p><p className="num mt-1">Santé technique : {typeof point["score_site"] === "number" ? `${point["score_site"]} / 100` : "Non mesurée"}</p>{point["actions"] && <p className="mt-2">Correction exécutée : {point["actions"]}</p>}</div>;
        }} />
        {annotations.map((p) => <ReferenceLine key={String(p.jour)} x={String(p.jour)} stroke="var(--warn)" strokeDasharray="3 3" />)}
        <Line type="linear" dataKey="score" name="Visibilité dans les IA" stroke="var(--module-visibility)" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
        <Line type="linear" dataKey="score_site" name="Santé technique du site" stroke="var(--chart-2)" strokeWidth={4} dot={{ r: 4 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
      </LineChart></ResponsiveContainer></div>
      <div className="mt-3 flex flex-wrap gap-5 text-xs"><span className="inline-flex items-center gap-2"><span className="h-1 w-6 bg-module-visibility" />Visibilité dans les IA</span><span className="inline-flex items-center gap-2"><span className="h-1 w-6 bg-chart-2" />Santé technique du site</span></div>
    </>}
  </Section>;
}

function useNomSite(subject: string) {
  const selection = useSelectionVisibility();
  const { global } = useVisibilityPilotage();
  const donnees = useVisibilityDonnees();
  return selection.sujets.find((s) => s.id === subject)?.nom
    ?? global?.portefeuille.find((s) => s.subject_id === subject)?.nom
    ?? (subject === "studio-ardoise" ? donnees.marque.nom : subject);
}

function BlocScore({ subject, score, technique = false }: { subject: string; score: ScoreV3 | undefined; technique?: boolean }) {
  const valeur = technique ? score?.score_site : score?.score;
  return <div className={`score-panel ${technique ? "" : "score-panel-principal"}`}>
    <div className={`flex items-center gap-5 ${technique ? "flex-row" : "flex-col sm:flex-row"}`}>
      <JaugeScore score={valeur} petite={technique} />
      <div><h3 className={technique ? "text-base" : "text-xl"}>{technique ? "Santé technique du site" : "Visibilité dans les IA"}</h3>{!technique && <Variation score={score} />}<p className="mt-2 text-sm text-muted-foreground">{technique ? "Performance, SEO, accessibilité et bonnes pratiques." : typeof score?.visibilite_ia === "number" ? `cité dans ${score.visibilite_ia} % des réponses aux questions qui ne le nomment pas` : "Visibilité sur les questions sans le nom non mesurée"}</p></div>
    </div>
    <div className="mt-5"><Composantes score={score} subject={subject} composantes={technique ? COMPOSANTES_SITE : COMPOSANTES_IA} /></div>
  </div>;
}

export function ResumeRapportV3({ subject, actions }: { subject: string; actions?: ReactNode }) {
  const { donnees } = useVisibilityV3();
  const vis = useVisibilityDonnees();
  const score = donnees.scores.find((s) => s.subject_id === subject);
  const concurrents = vis.vueSite.concurrents.filter((c) => c.nom !== vis.marque.nom).slice(0, 4);
  const plusieursFenetres = vis.fenetres.filter((f) => f.id).length > 1;
  return <EtatVisibilityV3><Section titre={plusieursFenetres ? "Repères du rapport" : "Résumé de J0"}>
    <p className="mb-5 text-sm text-muted-foreground">{plusieursFenetres ? "Ces repères accompagnent la comparaison des fenêtres, sans mélanger visibilité IA et santé technique." : "Une seule fenêtre est disponible : ce résumé établit le point de départ, sans inventer de comparaison avant et après."}</p>
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.score) } as React.CSSProperties}><p className="text-xs">Visibilité dans les IA</p><p className="num mt-2 text-4xl">{score?.score ?? "Non mesuré"}<span className="text-sm"> / 100</span></p></div>
      <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.score_site) } as React.CSSProperties}><p className="text-xs">Santé technique du site</p><p className="num mt-2 text-4xl">{score?.score_site ?? "Non mesuré"}<span className="text-sm"> / 100</span></p></div>
      <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.visibilite_ia) } as React.CSSProperties}><p className="text-xs">Questions sans le nom</p><p className="num mt-2 text-4xl">{score?.visibilite_ia ?? "Non mesuré"}{typeof score?.visibilite_ia === "number" && " %"}</p></div>
      <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.notoriete_ia) } as React.CSSProperties}><p className="text-xs">Questions avec le nom</p><p className="num mt-2 text-4xl">{score?.notoriete_ia ?? "Non mesuré"}{typeof score?.notoriete_ia === "number" && " %"}</p></div>
    </div>
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1.5fr]"><div><h3 className="text-sm font-medium">Concurrents cités</h3>{concurrents.length ? <ul className="mt-3 space-y-2 text-sm">{concurrents.map((c) => <li key={c.nom} className="flex justify-between gap-3 border-b border-border pb-2"><span>{c.nom}</span><span className="num">{c.v === null ? "Non mesurable" : `${c.v} %`}</span></li>)}</ul> : <p className="mt-3 text-sm text-muted-foreground">Aucun concurrent cité dans cette fenêtre.</p>}</div><div><h3 className="mb-2 text-sm font-medium">Les 3 actions prioritaires</h3><TopActions subject={subject} /></div></div>
    {actions && <div className="mt-5 flex flex-wrap gap-2 border-t border-border pt-5">{actions}</div>}
  </Section></EtatVisibilityV3>;
}

export function ScoreSite({ subject }: { subject: string }) {
  const { donnees, connecte } = useVisibilityV3();
  const score = donnees.scores.find((s) => s.subject_id === subject);
  const nom = useNomSite(subject);
  return <article className="grid gap-6" aria-label={`Scores et actions de ${nom}`}>
    <div className="mb-4 sm:hidden"><BoutonAnalyse subject={subject} /></div><Section titre="Comprendre la présence et la qualité du site" aside={<div className="hidden sm:block"><BoutonAnalyse subject={subject} /></div>}>
      <p className="mb-5 text-sm text-muted-foreground">Le score principal mesure uniquement la présence dans les IA. La santé technique reste un diagnostic séparé.</p>
      <div className="grid gap-5 xl:grid-cols-[1.25fr_1fr]"><BlocScore subject={subject} score={score} /><BlocScore subject={subject} score={score} technique /></div>
      {!connecte && <p className="mt-4 text-xs text-tertiary">Exemple fictif. Les boutons d'analyse réelle sont réservés aux comptes connectés.</p>}
    </Section>
    <div className="grid gap-6 xl:grid-cols-2"><Section titre="Les 3 actions prioritaires"><p className="mb-3 text-sm text-muted-foreground">Les recommandations de visibilité IA en attente passent avant les corrections techniques.</p><TopActions subject={subject} /><Button asChild variant="outline" className="mt-4 min-h-11"><Link to="/visibility/$onglet" params={{ onglet: "opportunites" }}>Voir tous les constats</Link></Button></Section><CourbeScore subject={subject} /></div>
  </article>;
}

export function ScoreSitesVisibility() {
  const { donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const subject = selection.sujetId ?? donnees.scores[0]?.subject_id;
  return <EtatVisibilityV3>{!subject ? <Section titre="Score Visibility"><p className="text-sm text-muted-foreground">Aucun site à analyser.</p></Section> : <div className="mb-8"><ScoreSite subject={subject} /></div>}</EtatVisibilityV3>;
}
