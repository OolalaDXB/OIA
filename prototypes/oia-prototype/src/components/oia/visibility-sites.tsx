import { useState, type CSSProperties } from "react";
import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Statut } from "@/components/oia/ui";
import { FaviconSource } from "@/components/oia/identites";
import { ChargementPilotage, etiquettesEtapes, FormulaireSite } from "@/components/oia/visibility-pilotage";
import { EtatVisibilityV3 } from "@/components/oia/visibility-score";
import { libelleVisibility } from "@/components/oia/visibility-ui";
import { useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { useDonnees } from "@/lib/donnees-visibility";
import { couleurScore, type ScoreV3 } from "@/lib/donnees/visibility-v3";
import { dollars } from "@/lib/donnees/visibility-pilotage";
import { ResumeEfficaciteCarte, useResumeEfficacite } from "@/components/oia/visibility-efficacite";
import { ResumePilotageCarte, useResumePilotage } from "@/components/oia/visibility-chantiers";
import { actionsP0AFaire, type PlanActionV3 } from "@/lib/donnees/visibility-plan";

export type CarteSite = { id: string; nom: string; adresse: string; etape: string | null; prochaineAction: string | null; coutMois: number | null; jour: number | null };
const dateLongue = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });

export function resumeSite(site: CarteSite, scores: ScoreV3[], plan: PlanActionV3[]) {
  const score = scores.find((s) => s.subject_id === site.id);
  return {
    visibilite: typeof score?.score === "number" ? score.score : null,
    sante: typeof score?.score_site === "number" ? score.score_site : null,
    p0: actionsP0AFaire(plan, site.id),
    derniereMesure: score?.analyse_le ? dateLongue.format(new Date(score.analyse_le)) : null,
  };
}

function Score({ label, valeur }: { label: string; valeur: number | null }) {
  return <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(valeur) } as CSSProperties}><p className="text-xs">{label}</p><p className="num mt-1 text-2xl">{valeur ?? "Non mesuré"}{valeur !== null && <span className="text-xs"> / 100</span>}</p></div>;
}

function Carte({ site, resume, pilotage }: { site: CarteSite; resume: ReturnType<ReturnType<typeof useResumeEfficacite>>; pilotage: ReturnType<ReturnType<typeof useResumePilotage>> }) {
  const { donnees } = useVisibilityV3();
  const r = resumeSite(site, donnees.scores, donnees.planAction);
  const etape = site.etape ?? "demande";
  return <li><Link to="/visibility" search={{ site: site.id }} aria-label={`Ouvrir ${site.nom}`} className="block h-full rounded-md border border-border bg-card p-5 transition-colors hover:border-module-visibility focus-visible:outline-2 focus-visible:outline-ring">
    <div className="flex items-start gap-3"><FaviconSource source={site.adresse} /><div className="min-w-0"><h2 className="truncate text-lg font-medium">{site.nom}</h2><p className="truncate text-sm text-muted-foreground">{site.adresse || "Adresse non fournie"}</p></div></div>
    <div className="mt-4 grid grid-cols-2 gap-3"><Score label="Visibilité IA" valeur={r.visibilite} /><Score label="Santé technique" valeur={r.sante} /></div>
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
      <div><dt className="text-xs text-tertiary">Actions P0 à faire</dt><dd className={`num mt-0.5 ${r.p0 > 0 ? "text-block" : ""}`}>{r.p0}</dd></div>
      <div><dt className="text-xs text-tertiary">Dernière mesure</dt><dd className="mt-0.5">{r.derniereMesure ?? "Aucune"}</dd></div>
      <div><dt className="text-xs text-tertiary">Étape</dt><dd className="mt-1"><Statut etat={etape === "bloque" ? "bloquant" : etape.includes("a_valider") ? "verifier" : "conforme"} label={etiquettesEtapes[etape] ?? libelleVisibility(etape)} />{etape === "mesure_en_cours" && site.jour !== null && <span className="num block text-xs text-tertiary">Jour {site.jour} sur 5</span>}</dd></div>
      <div><dt className="text-xs text-tertiary">Coût du mois</dt><dd className="num mt-0.5">{dollars(site.coutMois)}</dd></div>
      <div className="col-span-2"><dt className="text-xs text-tertiary">Prochaine action</dt><dd className="mt-0.5">{site.prochaineAction || "Aucune action"}</dd></div>
    </dl>
    <ResumePilotageCarte {...pilotage} />
    <ResumeEfficaciteCarte {...resume} />
  </Link></li>;
}

function Grille({ sites, ajout }: { sites: CarteSite[]; ajout: React.ReactNode }) {
  const resume = useResumeEfficacite();
  const pilotage = useResumePilotage();
  return <>{ajout}{sites.length === 0 ? <Section titre="Aucun site"><p className="text-sm text-muted-foreground">Aucun site analysé pour l'instant.</p></Section> : <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{sites.map((s) => <Carte key={s.id} site={s} resume={resume(s.id)} pilotage={pilotage(s.id)} />)}</ul>}</>;
}

export function AccueilSitesVisibility() {
  const { connecte, global } = useVisibilityPilotage();
  const vis = useDonnees();
  const [ajout, setAjout] = useState(false);
  const entete = (actif: boolean) => <div className="mb-6 flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl font-medium">Sites analysés</h2><Button id="ajouter-un-site" className="min-h-11 scroll-mt-6" disabled={!actif} title={actif ? undefined : "Connexion requise"} onClick={() => setAjout((v) => !v)}><Plus aria-hidden="true" />Ajouter un site</Button></div>;
  if (!connecte) {
    const demo: CarteSite[] = [...new Map(vis.sites.map((s) => [s.nom, { id: s.slug, nom: s.nom, adresse: s.url, etape: s.ia === null ? "demande" : "actions_en_cours", prochaineAction: s.ia === null ? "Valider le panel de questions" : "Traiter les actions P0", coutMois: null, jour: null }])).values()];
    return <EtatVisibilityV3>{entete(false)}<Grille sites={demo} ajout={null} /></EtatVisibilityV3>;
  }
  const lignes = global?.portefeuille ?? [];
  const clients = [...new Map(lignes.filter((l) => l.client_id).map((l) => [l.client_id!, { id: l.client_id!, nom: l.client_nom || l.client_id! }])).values()];
  const sites: CarteSite[] = lignes.filter((l) => l.subject_id).map((l) => ({ id: l.subject_id!, nom: l.nom || l.subject_id!, adresse: l.site_url ?? "", etape: l.etape, prochaineAction: l.prochaine_action, coutMois: l.cout_mois_usd, jour: l.jour_courant }));
  return <ChargementPilotage><EtatVisibilityV3>{entete(true)}<Grille sites={sites} ajout={ajout ? <FormulaireSite clients={clients} onFerme={() => setAjout(false)} /> : null} /></EtatVisibilityV3></ChargementPilotage>;
}
