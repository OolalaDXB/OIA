import { useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section } from "@/components/oia/ui";
import { BarreColoree } from "@/components/oia/graphiques";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { menuVisibility } from "@/components/oia/visibility-ui";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useSelectionVisibility, useVisibilityDonnees } from "@/lib/donnees/provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  actionsPrioritaires, COMPOSANTES_SCORE, couleurScore, demandeAnalyseActive,
  historiqueParJour, valeurComposante, variationScore, type ComposanteScore, type ScoreV3,
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
  const ids = [...new Set([...selection.sujets.map((s) => s.id), ...donnees.scores.map((s) => s.subject_id).filter((id): id is string => Boolean(id))])];
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
  return <div className={`relative ${petite ? "size-28" : "size-40"}`} role="img" aria-label={valeur === null ? "Score non mesuré" : `Score ${valeur} sur 100`}>
    <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
      <circle cx="60" cy="60" r={rayon} fill="none" stroke="var(--track)" strokeWidth="8" />
      {valeur !== null && <circle cx="60" cy="60" r={rayon} fill="none" stroke={couleurScore(valeur)} strokeWidth="8" strokeLinecap="round" strokeDasharray={circonference} strokeDashoffset={circonference * (1 - progression / 100)} />}
    </svg>
    <span className={`num absolute inset-0 flex items-center justify-center ${valeur === null ? "px-3 text-center text-xs text-muted-foreground" : petite ? "text-2xl" : "text-4xl"}`}>{valeur === null ? "Non mesuré" : valeur}<span className="sr-only">sur 100</span></span>
  </div>;
}

function Variation({ score }: { score: ScoreV3 | undefined }) {
  const { donnees } = useVisibilityV3();
  const variation = variationScore(score, donnees.historique);
  if (variation === null) return <p className="mt-2 text-xs text-tertiary">Aucun point précédent pour calculer la variation.</p>;
  const Icone = variation > 0 ? ArrowUpRight : variation < 0 ? ArrowDownRight : Minus;
  return <p className="num mt-2 flex items-center gap-1.5 text-sm text-muted-foreground"><Icone className="size-4" aria-hidden="true" />{variation > 0 ? "+" : ""}{String(variation).replace(".", ",")} point{Math.abs(variation) > 1 ? "s" : ""} depuis le point précédent</p>;
}

function Composantes({ score, subject }: { score: ScoreV3 | undefined; subject: string }) {
  const { connecte } = useVisibilityV3();
  return <div>
    {COMPOSANTES_SCORE.map((composante) => {
      const valeur = valeurComposante(score, composante.id);
      const manquante = valeur === null;
      return <div key={composante.id} className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(10rem,1fr)_minmax(8rem,1fr)_auto] sm:items-center sm:gap-4">
        <div><p className="text-sm">{composante.label}</p><p className="text-xs text-tertiary">Poids {composante.poids} %</p></div>
        {manquante ? <span className="block h-4 rounded-sm bg-track" aria-label={`${composante.label} non mesurée`} /> : <BarreColoree label={composante.label} largeur={valeur ?? 0} detail={`${valeur} sur 100 · poids ${composante.poids} %`} couleur={couleurScore(valeur)} />}
        <div className="sm:min-w-32 sm:text-right">{manquante ? <div><span className="text-xs text-muted-foreground">Non mesurée</span>{connecte && (composante.mesure === "ia" ? <Button asChild variant="link" className="mt-1 h-auto min-h-11 px-0 text-xs"><Link to="/sites/$slug" params={{ slug: subject }}>Préparer la mesure IA</Link></Button> : <BoutonAnalyse subject={subject} compact />)}</div> : <span className="num text-sm">{valeur} / 100</span>}</div>
      </div>;
    })}
  </div>;
}

function TopActions({ subject, limite = 3 }: { subject: string; limite?: number }) {
  const { donnees } = useVisibilityV3();
  const actions = actionsPrioritaires(donnees.constats, subject, limite);
  if (!actions.length) return <p className="text-sm text-muted-foreground">Aucun constat ouvert. Lancez une analyse ou consultez les constats résolus.</p>;
  return <ol>{actions.map((action, index) => <li key={action.id ?? action.cle} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-border py-4 last:border-0">
    <span className="num text-sm text-tertiary">{String(index + 1).padStart(2, "0")}</span>
    <div><h4 className="text-sm">{action.titre}</h4><p className="mt-1 text-sm text-muted-foreground">{action.explication}</p><p className="mt-2 text-xs text-tertiary">{action.impact ? `Gain attendu : ${action.impact}` : "Gain attendu non chiffré"} · Effort {action.effort ?? "non fourni"} · {action.qui === "equipe" ? "Équipe" : "Client"}</p></div>
  </li>)}</ol>;
}

const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

function CourbeScore({ subject }: { subject: string }) {
  const { donnees } = useVisibilityV3();
  const { recommandationsV2 } = useVisibilityDonnees();
  const [serie, setSerie] = useState<"score" | ComposanteScore>("score");
  const points = historiqueParJour(donnees.historique, subject).map((point) => {
    const actions = (recommandationsV2 ?? []).filter((r) => r.execute_le?.slice(0, 10) === point.jour).map((r) => r.titre).filter(Boolean);
    return { ...point, actions: actions.join(" · ") };
  });
  const annotations = points.filter((p) => p["actions"]);
  const libelle = serie === "score" ? "Score global" : COMPOSANTES_SCORE.find((c) => c.id === serie)?.label ?? serie;
  return <Section titre="Évolution du score et de ses composantes" aside={<select aria-label="Composante de la courbe" className={`${menuVisibility} max-w-64`} value={serie} onChange={(e) => setSerie(e.target.value as "score" | ComposanteScore)}><option value="score">Score global</option>{COMPOSANTES_SCORE.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>}>
    <p className="mb-4 text-sm text-muted-foreground">Repérez les changements après chaque correction, sans reporter une mesure absente sur les dates suivantes.</p>
    {points.length === 0 ? <p className="text-sm text-muted-foreground">Aucun historique pour ce site.</p> : <>
      <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><LineChart data={points} accessibilityLayer margin={{ top: 12, right: 12, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="jour" tickFormatter={(v: string) => dateCourte.format(new Date(`${v}T00:00:00Z`))} tick={{ fill: "var(--tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} width={36} tick={{ fill: "var(--tertiary)", fontSize: 11 }} axisLine={false} tickLine={false} />
        <Tooltip content={({ active, payload, label }) => {
          if (!active || !payload?.length) return null;
          const point = payload[0]?.payload as Record<string, string | number | null>;
          const valeur = point[serie];
          return <div role="status" className="max-w-xs rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground shadow-card"><p>{dateCourte.format(new Date(`${label}T00:00:00Z`))}</p><p className="num mt-2">{libelle} : {typeof valeur === "number" ? `${valeur} / 100` : "Non mesurée"}</p><p className="mt-1 text-tertiary">Origine : {String(point[`${serie}_origine`] ?? "non fournie")} · référence {String(point[`${serie}_reference`] ?? "non fournie")}</p>{point["actions"] && <p className="mt-2">Correction exécutée : {point["actions"]}</p>}</div>;
        }} />
        {annotations.map((p) => <ReferenceLine key={String(p.jour)} x={String(p.jour)} stroke="var(--warn)" strokeDasharray="3 3" />)}
        <Line type="linear" dataKey={serie} name={libelle} stroke="var(--module-visibility)" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={false} />
      </LineChart></ResponsiveContainer></div>
      {annotations.length > 0 && <ul className="mt-3 space-y-1 text-xs text-tertiary">{annotations.map((p) => <li key={String(p.jour)}><span className="text-foreground">{dateCourte.format(new Date(`${p.jour}T00:00:00Z`))}</span> : correction exécutée, {p.actions}</li>)}</ul>}
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

function ChiffresCles({ score }: { score: ScoreV3 | undefined }) {
  const valeurs = [
    ["Visibilité IA", score?.visibilite_ia, "/ 100"],
    ["Notoriété IA", score?.notoriete_ia, "/ 100"],
    ["Constats ouverts", score?.constats_ouverts, ""],
  ] as const;
  return <dl className="grid gap-4 sm:grid-cols-3">{valeurs.map(([label, valeur, suffixe]) => <div key={label}><dt className="text-xs text-tertiary">{label}</dt><dd className="num mt-1 text-2xl">{valeur ?? "Non mesuré"}{typeof valeur === "number" && <span className="ml-1 text-xs text-tertiary">{suffixe}</span>}</dd></div>)}</dl>;
}

export function ResumeRapportV3({ subject }: { subject: string }) {
  const { donnees } = useVisibilityV3();
  const score = donnees.scores.find((s) => s.subject_id === subject);
  return <EtatVisibilityV3><Section titre="Résumé avant lecture du rapport">
    <p className="mb-5 text-sm text-muted-foreground">Commencez par les trois actions ouvertes les plus urgentes, puis vérifiez leur effet à la prochaine mesure.</p>
    <div className="grid gap-6 lg:grid-cols-[10rem_1fr] lg:items-center"><div><JaugeScore score={score?.score} petite /><Variation score={score} /></div><ChiffresCles score={score} /></div>
    <h3 className="mb-2 mt-6 text-sm">Les 3 actions prioritaires</h3><TopActions subject={subject} />
  </Section></EtatVisibilityV3>;
}

export function ScoreSite({ subject }: { subject: string }) {
  const { donnees, connecte } = useVisibilityV3();
  const score = donnees.scores.find((s) => s.subject_id === subject);
  const nom = useNomSite(subject);
  return <article className="grid gap-6" aria-label={`Score et actions de ${nom}`}>
    <div className="mb-4 sm:hidden"><BoutonAnalyse subject={subject} /></div><Section titre={`Score de ${nom}`} aside={<div className="hidden sm:block"><BoutonAnalyse subject={subject} /></div>}>
      <p className="mb-5 text-sm text-muted-foreground">Le score ne compte que les composantes mesurées. Corrigez d'abord les constats critiques et peu coûteux.</p>
      <div className="grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <div><div className="flex items-center gap-5"><JaugeScore score={score?.score} /><div><p className="text-sm text-tertiary">Score global</p><Variation score={score} /><p className="num mt-4 text-sm">{score?.constats_ouverts ?? "Non mesuré"} ouverts · {score?.constats_critiques ?? "non mesuré"} critiques</p></div></div>{score?.analyse_le && <p className="num mt-4 text-xs text-tertiary">Analyse du {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(score.analyse_le))}</p>}</div>
        <Composantes score={score} subject={subject} />
      </div>
      {!connecte && <p className="mt-4 text-xs text-tertiary">Exemple fictif. Les boutons d'analyse réelle sont réservés aux comptes connectés.</p>}
    </Section>
    <div className="grid gap-6 xl:grid-cols-2"><Section titre="Les 3 actions qui feront monter le score"><p className="mb-3 text-sm text-muted-foreground">La gravité passe avant l'effort, pour traiter d'abord les blocages réels.</p><TopActions subject={subject} /><Button asChild variant="outline" className="mt-4 min-h-11"><Link to="/visibility/$onglet" params={{ onglet: "opportunites" }}>Voir tous les constats</Link></Button></Section><CourbeScore subject={subject} /></div>
  </article>;
}

export function ScoreSitesVisibility() {
  const { donnees, connecte } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const { global } = useVisibilityPilotage();
  const ids = [...new Set([
    ...donnees.scores.map((s) => s.subject_id).filter((id): id is string => Boolean(id)),
    ...(connecte ? selection.sujets.map((s) => s.id) : []),
    ...(connecte ? (global?.portefeuille ?? []).map((s) => s.subject_id).filter((id): id is string => Boolean(id)) : []),
  ])];
  return <EtatVisibilityV3>{ids.length === 0 ? <Section titre="Score Visibility"><p className="text-sm text-muted-foreground">Aucun site à analyser.</p></Section> : <div className="mb-8 grid gap-8">{ids.map((id) => <ScoreSite key={id} subject={id} />)}</div>}</EtatVisibilityV3>;
}
