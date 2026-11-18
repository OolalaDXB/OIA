import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Section, Statut } from "@/components/oia/ui";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { libelleVisibility } from "@/components/oia/visibility-ui";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { dollars } from "@/lib/donnees/visibility-pilotage";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  auditIaEnCours, auditsIaPourSujet, budgetRestantAuditIa, delaiSuiviAuditIa, moteursEstimationAuditIa,
  raisonEtatAuditIa, DELAI_SUIVI_AUDIT_IA,
} from "@/lib/donnees/visibility-audit-ia";

export const DESCRIPTION_AUDIT_IA = "20 questions tirées de votre site, posées une fois à chaque IA (ChatGPT, Gemini, Perplexity ; Claude en option ; Mistral pour les sites en français) : où vous apparaissez, qui est cité à votre place, plan d'action";

function DetailCout({ subject }: { subject: string }) {
  const { donnees } = useVisibilityV3();
  const estimation = donnees.estimationsAuditIa.find((item) => item.subject_id === subject);
  const moteurs = moteursEstimationAuditIa(estimation);
  const [ouvert, setOuvert] = useState(false);
  return <TooltipProvider delayDuration={100}><Tooltip open={ouvert} onOpenChange={setOuvert}><TooltipTrigger asChild>
    <Button type="button" variant="ghost" size="icon" className="size-11" aria-label="Détail du coût par moteur" aria-expanded={ouvert} onClick={() => setOuvert(true)}><Info aria-hidden="true" /></Button>
  </TooltipTrigger><TooltipContent side="bottom" align="start" className="w-[min(32rem,calc(100vw-2rem))] border border-border bg-popover p-4 text-popover-foreground">
    <p className="mb-2 font-medium">Estimation par moteur</p>
    {moteurs.length === 0 ? <p>Détail non fourni.</p> : <div className="grid gap-2">{moteurs.map((moteur) => <div key={moteur.moteur} className="grid grid-cols-[minmax(6rem,1fr)_auto] gap-x-4 border-b border-border pb-2 text-xs last:border-0"><span>{moteur.moteur}<span className="block text-muted-foreground">{moteur.cible}</span></span><span className="num text-right">{moteur.appels ?? "?"} appel{moteur.appels === 1 ? "" : "s"}<span className="block">environ {dollars(moteur.habituelUsd)} · au plus {dollars(moteur.maxUsd)}</span></span></div>)}</div>}
  </TooltipContent></Tooltip></TooltipProvider>;
}

export function CarteAuditIaExpress({ subject, compact = false }: { subject: string; compact?: boolean }) {
  const { donnees, connecte, query } = useVisibilityV3();
  const geste = useGesteVisibility();
  const refetch = useRef(query.refetch);
  refetch.current = query.refetch;
  const [confirmation, setConfirmation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const estimation = donnees.estimationsAuditIa.find((item) => item.subject_id === subject);
  const historique = auditsIaPourSujet(donnees.auditsIa, subject);
  const actif = auditIaEnCours(donnees.auditsIa, subject);
  const delai = delaiSuiviAuditIa(actif ? [actif] : []);
  const dernier = historique[0];
  const restant = budgetRestantAuditIa(estimation);
  const raisonBudget = raisonEtatAuditIa(estimation?.etat);
  const coutValide = typeof estimation?.cout_max_usd === "number" && Number.isFinite(estimation.cout_max_usd);
  const blocage = !connecte ? "Connexion requise pour lancer un audit réel." : actif ? "Un audit est déjà en cours pour ce site." : raisonBudget ?? (!coutValide ? "Le coût maximal n'est pas fourni." : null);

  useEffect(() => {
    if (!connecte || delai === false) return;
    const minuteur = window.setInterval(() => { void refetch.current(); }, delai);
    return () => window.clearInterval(minuteur);
  }, [connecte, delai]);

  async function lancer() {
    if (!estimation || !coutValide || blocage) return;
    setMessage(null);
    try {
      await geste.executer("vis_lancer_audit_ia", {
        p_subject: subject,
        p_cout_vu_usd: estimation.cout_max_usd!,
        p_questions: estimation.questions ?? 20,
      });
      setConfirmation(false);
    } catch (erreur) {
      if (erreur instanceof Error && erreur.message.includes("estimation changée, recharger")) {
        await geste.recharger();
        setConfirmation(false);
        setMessage("Estimation rechargée. Vérifiez le nouveau montant avant de confirmer à nouveau.");
      }
    }
  }

  return <Section titre="Audit IA express" aside={<span className="inline-flex items-center gap-1.5 rounded-md border border-module-visibility px-2.5 py-1 text-xs text-module-visibility"><Sparkles className="size-3.5" aria-hidden="true" />Premium</span>}>
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(18rem,1fr)]">
      <div>
        <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">{DESCRIPTION_AUDIT_IA}</p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <p className="num text-xl"><span className="text-sm font-normal">environ </span>{dollars(estimation?.cout_habituel_usd)}<span className="mx-2 text-muted-foreground">·</span><span className="text-sm font-normal">au plus </span>{dollars(estimation?.cout_max_usd)}</p>
          <DetailCout subject={subject} />
        </div>
        <p className="num mt-2 text-sm text-muted-foreground">Budget du mois restant : {restant === null ? "non fixé" : dollars(restant)}</p>
        <p className="mt-1 text-xs text-tertiary">{estimation?.questions ?? 20} questions · {estimation?.appels ?? "nombre non fourni"} appels · plafond global {estimation?.plafond_global_usd === null || estimation?.plafond_global_usd === undefined ? "non fixé" : dollars(estimation.plafond_global_usd)}</p>
      </div>
      <div className="border-t border-border pt-5 xl:border-l xl:border-t-0 xl:pl-6 xl:pt-0">
        {actif && <div role="status" className="mb-5 rounded-md border border-border bg-muted p-4"><div className="flex items-center justify-between gap-3"><Statut etat="verifier" label={`Audit en cours · ${libelleVisibility(actif.statut)}`} /><span className="text-xs text-tertiary">actualisation toutes les 30 s</span></div><div className="mt-3 h-3 overflow-hidden rounded-sm bg-track" role="progressbar" aria-label="Audit IA express en cours"><div className="h-full w-2/3 animate-pulse bg-module-visibility motion-reduce:animate-none" /></div><p className="mt-2 text-xs text-tertiary">La vue est relue toutes les {DELAI_SUIVI_AUDIT_IA / 1000} secondes jusqu’au résultat ou à l’échec.</p></div>}
        {!actif && dernier?.statut === "FAILED" && <div role="alert" className="mb-5 rounded-md border border-border p-4"><Statut etat="bloquant" label="Échec de l’audit" /><p className="mt-2 whitespace-pre-wrap text-sm text-block">{dernier.erreur || "Erreur non fournie."}</p></div>}
        {!actif && dernier?.statut === "DONE" && <div className="mb-5 rounded-md border border-border bg-muted p-4"><Statut etat="conforme" label="Audit terminé" /><p className="num mt-2 text-sm">Coût réel : {dollars(dernier.cout_reel_usd)} · Score : {dernier.score ?? "Non mesurable"}{typeof dernier.score === "number" ? " / 100" : ""}</p>{dernier.resultat_id && <Button asChild variant="outline" className="mt-3 min-h-11"><Link to="/visibility/$onglet" params={{ onglet: "audits" }} search={{ site: subject }} hash={`audit-${dernier.resultat_id}`}>Voir le résultat dans les audits</Link></Button>}</div>}
        {!confirmation ? <Button type="button" className="min-h-11" disabled={Boolean(blocage) || geste.enCours} onClick={() => { setMessage(null); setConfirmation(true); }}>Lancer l’audit</Button> : <div className="rounded-md border border-border p-4"><p className="text-sm">Confirmez le lancement pour un montant maximal de <strong className="num">{dollars(estimation?.cout_max_usd)}</strong>.</p><p className="mt-1 text-xs text-tertiary">La base refusera le geste si l’estimation ou le plafond a changé.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={geste.enCours} onClick={() => void lancer()}>{geste.enCours ? "Lancement en cours…" : `Confirmer pour ${dollars(estimation?.cout_max_usd)}`}</Button><Button type="button" variant="ghost" className="min-h-11" disabled={geste.enCours} onClick={() => setConfirmation(false)}>Revenir</Button></div></div>}
        {blocage && <p role="alert" className="mt-3 text-sm text-muted-foreground">{blocage}</p>}
        {connecte && raisonBudget && <Button asChild variant="link" className="mt-1 min-h-11 px-0"><Link to="/visibility/$onglet" params={{ onglet: "reglages" }} search={{ site: subject, reglage: "budget" }} hash="budget">Réglages › Budget</Link></Button>}
        <ErreurGeste erreur={geste.erreur} />
        {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
    {!compact && <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Historique des audits IA express</h3>{historique.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucun audit IA express lancé pour ce site.</p> : <ol>{historique.map((audit) => <li key={audit.id ?? audit.demande_id ?? audit.le} className="grid gap-2 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[minmax(10rem,1fr)_8rem_10rem_auto] sm:items-center"><span>{audit.le ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(audit.le)) : "Date non fournie"}<span className="block text-xs text-tertiary">{audit.questions ?? 20} questions · {audit.moteurs?.length ?? 0} moteurs</span></span><Statut etat={audit.statut === "FAILED" ? "bloquant" : audit.statut === "QUEUED" || audit.statut === "RUNNING" ? "verifier" : "conforme"} label={libelleVisibility(audit.statut, "Inconnu")} /><span className="num text-xs">Coût réel : {dollars(audit.cout_reel_usd)}<span className="block">Score : {audit.score ?? "Non mesurable"}</span></span>{audit.resultat_id ? <a className="inline-flex min-h-11 items-center text-xs underline underline-offset-4" href={`#audit-${audit.resultat_id}`}>Voir le résultat</a> : <span className="text-xs text-tertiary">Résultat en attente</span>}</li>)}</ol>}</div>}
  </Section>;
}
