import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Statut } from "@/components/oia/ui";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { VuePilotagePlan } from "@/components/oia/visibility-chantiers";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { EtatVisibilityV3 } from "@/components/oia/visibility-score";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { documentationConstat } from "@/lib/donnees/visibility-v3";
import { objet, tableau, texte } from "@/lib/donnees/visibility-pilotage";
import {
  badgeOrigine, compteurPlan, enteteHorizon, ETATS_PLAN, filtrerPlan, filtresPlanVides, groupesHorizon, libelleCategorie,
  libelleEffort, libelleEtatPlan, libelleImpact, libelleOrigine, libelleQui, premieresActions, regrouperPlan,
  type CartePlan, type FiltresPlan,
} from "@/lib/donnees/visibility-plan";

function useSujetPlan() {
  const { donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  return selection.sujetId ?? donnees.planAction[0]?.subject_id ?? donnees.scores[0]?.subject_id ?? "";
}

function Badge({ children, fort = false }: { children: React.ReactNode; fort?: boolean }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${fort ? "border-module-visibility text-module-visibility" : "border-border text-tertiary"}`}>{children}</span>;
}

function DetailConstat({ carte }: { carte: CartePlan }) {
  const { donnees } = useVisibilityV3();
  const ref = carte.action.origine_ref ?? carte.action.id;
  const constat = donnees.constats.find((c) => c.id === ref || c.cle === ref || c.id === carte.action.id);
  if (!constat) return <p className="mt-3 text-xs text-tertiary">Preuve non fournie par la base{carte.action.reference ? ` · référence ${carte.action.reference}` : ""}.</p>;
  const preuve = objet(constat.preuve);
  const pages = tableau<string>(preuve["pages"] ?? null).filter((p) => typeof p === "string");
  const doc = documentationConstat(constat);
  return <div className="mt-3 grid gap-2 rounded-md bg-muted p-4 text-sm">
    {constat.explication && <p>{constat.explication}</p>}
    {constat.correction && <p><span className="text-tertiary">Correction : </span>{constat.correction}</p>}
    {constat.valeur && <p className="num text-xs text-tertiary">Valeur relevée : {constat.valeur}</p>}
    {pages.length > 0 && <ul className="text-xs">{pages.map((p) => <li key={p} className="break-all">{p}</li>)}</ul>}
    {texte(preuve["citation"]) && <p className="text-xs">« {texte(preuve["citation"])} »</p>}
    {doc && <a className="text-xs underline underline-offset-4" href={doc} target="_blank" rel="noreferrer">Documentation</a>}
  </div>;
}

function CarteAction({ carte }: { carte: CartePlan }) {
  const geste = useGesteVisibility();
  const { connecte } = useVisibilityV3();
  const [detail, setDetail] = useState(false);
  const a = carte.action;
  const recommandation = a.nature === "recommandation";
  return <li className="rounded-md border border-border p-4 sm:p-5">
    <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><span className="num text-xs font-medium text-module-visibility">{a.priorite ?? "P?"}</span><h3 className="text-base font-semibold">{a.titre ?? "Action sans titre"}</h3></div>
        <p className="mt-2 text-sm"><span className="text-tertiary">Quoi faire : </span>{a.quoi_faire ?? "Non fourni"}</p>
        <p className="mt-1 text-sm text-muted-foreground"><span className="text-tertiary">Pourquoi : </span>{a.pourquoi ?? "Non fourni"}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <Badge fort>{badgeOrigine(a)}</Badge>
          {carte.mobileEtOrdinateur && <Badge>mobile et ordinateur</Badge>}
          <Badge>Effort : {libelleEffort(a.effort)}</Badge>
          <Badge>Impact {libelleImpact(a.impact)}</Badge>
          <Badge>{libelleQui(a.qui)}</Badge>
          <Badge>{libelleCategorie(a.categorie)}</Badge>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch">
        <Statut etat={a.etat === "refuse" ? "bloquant" : a.etat === "a_valider" ? "verifier" : "conforme"} label={libelleEtatPlan(a.etat)} />
        {recommandation && a.etat === "a_valider" && a.id && <>
          <Button variant="outline" className="min-h-11" disabled={!connecte || geste.enCours} onClick={async () => { try { await geste.executer("vis_valider_recommandation", { p_recommandation: a.id! }); } catch { /* erreur affichée */ } }}>Valider</Button>
          <Button variant="ghost" className="min-h-11" disabled={!connecte || geste.enCours} onClick={async () => { const motif = window.prompt("Motif du refus"); if (!motif) return; try { await geste.executer("vis_rejeter_recommandation", { p_recommandation: a.id!, p_motif: motif }); } catch { /* erreur affichée */ } }}>Refuser</Button>
        </>}
        {!recommandation && <Button variant="outline" className="min-h-11" aria-expanded={detail} onClick={() => setDetail((v) => !v)}>{detail ? "Masquer le détail" : "Voir le détail"}</Button>}
      </div>
    </div>
    {detail && <DetailConstat carte={carte} />}
    <ErreurGeste erreur={geste.erreur} />
  </li>;
}

export function VuePlanAction() { return <VuePilotagePlan />; }

/** Ancienne vue par horizon, conservée pour référence. */
export function VuePlanActionHorizons() {
  const { donnees } = useVisibilityV3();
  const subject = useSujetPlan();
  const [f, setF] = useState<FiltresPlan>(filtresPlanVides);
  const duSite = useMemo(() => donnees.planAction.filter((a) => a.subject_id === subject), [donnees.planAction, subject]);
  const cartes = regrouperPlan(filtrerPlan(duSite, f));
  const options = (valeurs: (string | null | undefined)[]) => [...new Set(valeurs.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b, "fr"));
  const filtre = (cle: keyof FiltresPlan, label: string, valeurs: string[], lib: (v: string) => string) => <label className="grid gap-1.5 text-xs text-tertiary">{label}<FiltreSelect aria-label={label} value={f[cle]} onChange={(e) => setF((x) => ({ ...x, [cle]: e.target.value }))}><option value="">Toutes</option>{valeurs.map((v) => <option key={v} value={v}>{lib(v)}</option>)}</FiltreSelect></label>;
  return <EtatVisibilityV3><Section titre="Plan d'action" aside={<span className="num text-sm text-tertiary">{compteurPlan(cartes)}</span>}>
    <p className="mb-5 text-sm text-muted-foreground">Toutes les actions du site au même endroit : recommandations à valider et constats à corriger, classés par horizon.</p>
    <div className="mb-6 flex flex-wrap items-end gap-3">
      {filtre("origine", "Origine", options(duSite.map(libelleOrigine)), (v) => v)}
      {filtre("categorie", "Catégorie", options(duSite.map((a) => a.categorie)), libelleCategorie)}
      {filtre("etat", "État", options(duSite.map((a) => a.etat)), (v) => ETATS_PLAN[v] ?? v)}
      {filtre("qui", "Qui", options(duSite.map((a) => a.qui)), libelleQui)}
    </div>
    {cartes.length === 0 ? <p className="text-sm text-muted-foreground">{duSite.length ? "Aucune action pour ces filtres." : "Aucune action dans le plan de ce site."}</p>
      : <div className="grid gap-8">{groupesHorizon(cartes).map((g) => <section key={g.horizon} aria-label={g.horizon}><h2 className="mb-3 flex items-center gap-2 text-lg font-medium"><ListChecks className="size-4 text-module-visibility" aria-hidden="true" />{enteteHorizon(g.horizon, g.cartes.length)}</h2><ol className="grid gap-3">{g.cartes.map((c) => <CarteAction key={c.ids.join("+")} carte={c} />)}</ol></section>)}</div>}
  </Section></EtatVisibilityV3>;
}

export function LienPlan({ label = "Voir tout le plan d'action" }: { label?: string }) {
  return <Button asChild variant="outline" className="min-h-11"><Link to="/visibility/$onglet" params={{ onglet: "plan" }}>{label}</Link></Button>;
}

export function ApercuPlan({ subject, limite = 5 }: { subject: string; limite?: number }) {
  const { donnees } = useVisibilityV3();
  const cartes = premieresActions(donnees.planAction, subject, limite);
  return <Section titre={`Les ${limite} premières actions`} aside={<LienPlan />}>
    {cartes.length === 0 ? <p className="text-sm text-muted-foreground">Aucune action ouverte dans le plan.</p> : <ol>{cartes.map((c, i) => <li key={c.ids.join("+")} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 border-b border-border py-3 last:border-0"><span className="num text-sm text-tertiary">{String(i + 1).padStart(2, "0")}</span><div className="min-w-0"><p className="text-sm font-semibold">{c.action.titre}</p><p className="mt-1 text-sm text-muted-foreground">{c.action.quoi_faire}</p><div className="mt-2 flex flex-wrap gap-1.5"><Badge fort>{badgeOrigine(c.action)}</Badge><Badge>{c.action.horizon ?? "Ensuite"}</Badge>{c.mobileEtOrdinateur && <Badge>mobile et ordinateur</Badge>}</div></div></li>)}</ol>}
  </Section>;
}
