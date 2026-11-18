import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, Copy, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Section } from "@/components/oia/ui";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { EtatVisibilityV3 } from "@/components/oia/visibility-score";
import { useOiaAuth } from "@/lib/oia-auth";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { libelleEffort, libelleImpact, libelleQui } from "@/lib/donnees/visibility-plan";
import {
  chantiers, compteurSuivi, consolideDemo, deltasEffet, demandeConsolidationActive, DELAI_SUIVI_CONSOLIDATION, enteteConsolidation, ETATS_GESTE, ETATS_SUIVI,
  filtrerSuivi, filtresSuiviVides, libelleOrigineSuivi, libelleSuivi, lirePlanConsolide, lireSuiviPlan, mentionSources, resumePilotage, suiviDemo, texteResumePilotage,
  trierSuivi, verificationDe, type Chantier, type EtatGeste, type FiltresSuivi, type SuiviActionV3, type TonVerification,
} from "@/lib/donnees/visibility-suivi";

const dateCourte = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const date = (v: string | null | undefined) => { if (!v) return null; const d = new Date(v.length === 10 ? `${v}T00:00:00Z` : v); return Number.isNaN(d.getTime()) ? v : dateCourte.format(d); };
export const MENTION_PROMPT = "à coller dans Lovable ou Claude Code";
export const MENTION_CAUSE = "Une variation ne prouve pas la cause.";

/** Lecture du suivi et de la consolidation ; tous les sites quand subject est absent. */
export function useSuiviVisibility(subject?: string) {
  const { connecte } = useVisibilityV3();
  const auth = useOiaAuth();
  const userId = auth.user?.id ?? "";
  const options = { enabled: connecte && Boolean(userId) && !auth.loading, retry: false, refetchOnWindowFocus: false } as const;
  const suivi = useQuery({ queryKey: ["visibility-plan-suivi", userId, subject ?? "tous"], queryFn: () => lireSuiviPlan(subject), ...options });
  const consolide = useQuery({ queryKey: ["visibility-plan-consolide", userId, subject ?? "tous"], queryFn: () => lirePlanConsolide(subject), ...options });
  const filtre = <T extends { subject_id: string | null }>(l: T[]) => subject ? l.filter((x) => x.subject_id === subject) : l;
  return { connecte, suivi, consolide, actions: connecte ? suivi.data ?? [] : filtre(suiviDemo), plans: connecte ? consolide.data ?? [] : filtre(consolideDemo) };
}

export function useResumePilotage() {
  const { actions, plans } = useSuiviVisibility();
  return (subject: string) => resumePilotage(plans, actions, subject);
}
export function ResumePilotageCarte({ chantiers: c, retard }: { chantiers: number; retard: number }) {
  return <p className="num mt-3 text-sm text-muted-foreground">{texteResumePilotage({ chantiers: c, retard }).split(" · ").map((t, i) => <span key={t} className={i === 1 && retard > 0 ? "text-block" : ""}>{i ? " · " : ""}{t}</span>)}</p>;
}

function Badge({ children, fort = false }: { children: React.ReactNode; fort?: boolean }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs ${fort ? "border-module-visibility text-module-visibility" : "border-border text-tertiary"}`}>{children}</span>;
}
const tons: Record<TonVerification, string> = { ok: "border-ok text-ok", attention: "border-warn text-warn", neutre: "border-border text-muted-foreground", mesure: "border-module-visibility text-module-visibility" };
export function BadgeVerification({ verification }: { verification: string | null | undefined }) {
  const v = verificationDe(verification);
  return v ? <span className={`rounded-md border px-2 py-0.5 text-xs ${tons[v.ton]}`}>{v.label}</span> : null;
}

function useSujet() {
  const selection = useSelectionVisibility();
  const { connecte } = useVisibilityV3();
  return selection.sujetId ?? (connecte ? "" : suiviDemo[0]?.subject_id ?? "");
}

export function VuePilotagePlan() {
  const subject = useSujet();
  const [onglet, setOnglet] = useState("chantiers");
  const [cible, setCible] = useState<string | null>(null);
  const voirAction = (cle: string) => { setCible(cle); setOnglet("actions"); };
  return <EtatVisibilityV3><Tabs value={onglet} onValueChange={setOnglet}>
    <TabsList className="mb-5"><TabsTrigger value="chantiers" className="min-h-11">Chantiers</TabsTrigger><TabsTrigger value="actions" className="min-h-11">Actions</TabsTrigger></TabsList>
    <TabsContent value="chantiers"><OngletChantiers subject={subject} voirAction={voirAction} /></TabsContent>
    <TabsContent value="actions"><OngletActions subject={subject} cible={cible} /></TabsContent>
  </Tabs></EtatVisibilityV3>;
}

export function OngletChantiers({ subject, voirAction }: { subject: string; voirAction: (cle: string) => void }) {
  const { connecte, consolide, plans, actions } = useSuiviVisibility(subject);
  const { global, globalQuery } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const [message, setMessage] = useState<string | null>(null);
  const plan = [...plans].sort((a, b) => (b.le ?? "").localeCompare(a.le ?? ""))[0];
  const liste = chantiers(plan);
  const active = demandeConsolidationActive(global?.demandes ?? [], subject);
  const refetch = useRef(() => { void consolide.refetch(); void globalQuery.refetch(); });
  refetch.current = () => { void consolide.refetch(); void globalQuery.refetch(); };
  useEffect(() => {
    if (!connecte || !active) return;
    const t = window.setInterval(() => refetch.current(), DELAI_SUIVI_CONSOLIDATION);
    return () => window.clearInterval(t);
  }, [connecte, active]);
  async function croiser() {
    if (!connecte || !subject || active) return;
    setMessage(null);
    try { await geste.executer("vis_demander_consolidation", { p_subject: subject }); setMessage("Croisement demandé. Le plan consolidé sera relu automatiquement."); } catch { /* erreur affichée */ }
  }
  const bouton = <Button className="min-h-11" variant={plan ? "outline" : "default"} disabled={!connecte || !subject || geste.enCours || Boolean(active)} title={connecte ? "Gratuit" : "Connectez-vous pour croiser le plan réel"} onClick={() => void croiser()}>
    {active?.statut === "RUNNING" ? "Croisement en cours" : active?.statut === "QUEUED" ? "Croisement en file" : plan ? "Recroiser maintenant" : "Croiser maintenant"}</Button>;
  return <div className="grid gap-5">
    <Section titre="Plan consolidé" aside={plan?.le ? <span className="text-xs text-tertiary">{date(plan.le)}</span> : undefined}>
      {connecte && consolide.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement du plan consolidé…</p>
        : connecte && consolide.error ? <div role="alert" className="text-sm text-block">{consolide.error.message}<Button variant="outline" className="ml-3 min-h-11" onClick={() => void consolide.refetch()}>Réessayer</Button></div>
        : plan ? <><p className="max-w-3xl text-sm">{plan.resume ?? "Résumé non fourni."}</p><p className="num mt-2 text-sm text-muted-foreground">{enteteConsolidation(plan)}</p></>
        : <p className="text-sm text-muted-foreground">Aucun plan consolidé pour ce site. Le croisement regroupe les actions de toutes les sources en chantiers.</p>}
      <div className="mt-4 flex flex-wrap items-center gap-3">{bouton}<span className="text-xs text-tertiary">Gratuit</span></div>
      {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}<ErreurGeste erreur={geste.erreur} />
    </Section>
    {liste.map((c, i) => <CarteChantier key={`${i}-${c.titre}`} chantier={c} subject={subject} connecte={connecte} actions={actions} voirAction={voirAction} />)}
  </div>;
}

export function CarteChantier({ chantier: c, subject, connecte, actions, voirAction }: { chantier: Chantier; subject: string; connecte: boolean; actions: SuiviActionV3[]; voirAction: (cle: string) => void }) {
  const geste = useGesteVisibility();
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [preuve, setPreuve] = useState("");
  const [copie, setCopie] = useState<string | null>(null);
  const [fini, setFini] = useState<string | null>(null);
  async function marquerFait() {
    if (!connecte || !subject || !c.actions.length) return;
    setFini(null);
    try {
      for (const cle of c.actions) await geste.executer("vis_suivre_action", { p_subject: subject, p_action_cle: cle, p_etat: "fait", ...(preuve.trim() ? { p_preuve: preuve.trim() } : {}) });
      setFini(`${c.actions.length} action${c.actions.length > 1 ? "s" : ""} marquée${c.actions.length > 1 ? "s" : ""} faite${c.actions.length > 1 ? "s" : ""}. Le contrôle gratuit vérifiera les corrections.`);
    } catch { /* erreur affichée */ }
  }
  async function copier() {
    if (!c.prompt) return;
    try { await navigator.clipboard.writeText(c.prompt); setCopie("Prompt copié"); } catch { setCopie("Copie impossible, sélectionnez le texte"); }
  }
  const titreAction = (cle: string) => actions.find((a) => a.action_cle === cle)?.titre ?? cle;
  return <section aria-label={c.titre} className="rounded-md border border-border bg-card p-5">
    <h3 className="text-lg font-medium">{c.titre}</h3>
    {c.pourquoi && <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{c.pourquoi}</p>}
    <div className="mt-3 flex flex-wrap gap-1.5">
      <Badge fort>{c.priorite ?? "Priorité non fournie"}</Badge><Badge>Impact {libelleImpact(c.impact)}</Badge><Badge>Effort {libelleEffort(c.effort)}</Badge><Badge>{libelleQui(c.qui)}</Badge>
    </div>
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs"><span className={c.sources.length > 1 ? "font-medium text-module-visibility" : "text-tertiary"}>{mentionSources(c.sources.length)}</span>{c.sources.map((s) => <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{s}</span>)}</div>
    {c.etapes.length > 0 && <div className="mt-4"><h4 className="text-xs text-tertiary">Étapes (aide-mémoire, non enregistré)</h4><ul className="mt-1 grid gap-1">{c.etapes.map((e, i) => <li key={i}><label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" className="size-4" checked={coches.has(i)} onChange={() => setCoches((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n; })} /><span className={coches.has(i) ? "text-muted-foreground line-through" : ""}>{e}</span></label></li>)}</ul></div>}
    <p className="mt-3 text-sm"><span className="text-tertiary">Critère de réussite : </span>{c.critere ?? "Non fourni"}</p>
    {c.prompt && <div className="mt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xs text-tertiary">Prompt d'exécution · {MENTION_PROMPT}</h4><Button variant="outline" size="sm" className="min-h-11" onClick={() => void copier()}><Copy aria-hidden="true" />Copier le prompt</Button></div><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted p-3 text-xs">{c.prompt}</pre>{copie && <p role="status" className="mt-1 text-xs text-muted-foreground">{copie}</p>}</div>}
    {c.suivi.length > 0 && <div className="mt-4"><h4 className="text-xs text-tertiary">Actions d'origine</h4><ul className="mt-1 grid gap-1">{c.suivi.map((s) => <li key={s.cle} className="flex flex-wrap items-center gap-2 text-sm"><button type="button" className="min-h-11 text-left underline-offset-2 hover:underline" onClick={() => voirAction(s.cle)}>{titreAction(s.cle)}</button><Badge>{libelleSuivi(s.suivi)}</Badge><BadgeVerification verification={s.verification} /></li>)}</ul></div>}
    <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-border pt-4">
      <label className="grid min-w-56 flex-1 gap-1.5 text-xs text-tertiary">Preuve (lien, commit)<input value={preuve} onChange={(e) => setPreuve(e.target.value)} className="min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground" /></label>
      <Button className="min-h-11" disabled={!connecte || geste.enCours || !c.actions.length} title={connecte ? undefined : "Connectez-vous pour suivre le plan réel"} onClick={() => void marquerFait()}><Check aria-hidden="true" />Marquer fait</Button>
    </div>
    {fini && <p role="status" className="mt-2 text-sm text-muted-foreground">{fini}</p>}<ErreurGeste erreur={geste.erreur} />
  </section>;
}

function Fleche({ valeur }: { valeur: number | null }) {
  if (valeur === null) return <span className="text-tertiary">non mesuré</span>;
  const I = valeur > 0 ? ArrowUp : valeur < 0 ? ArrowDown : Minus;
  return <span className={`num inline-flex items-center gap-0.5 ${valeur > 0 ? "text-ok" : valeur < 0 ? "text-block" : "text-muted-foreground"}`}><I className="size-3" aria-hidden="true" />{valeur > 0 ? "+" : ""}{valeur.toLocaleString("fr-FR")}</span>;
}
export function EffetAction({ action: a }: { action: SuiviActionV3 }) {
  if (a.effet === "trop_tot") return <p className="text-xs text-tertiary">Effet : trop tôt (14 jours au moins)</p>;
  if (a.effet !== "mesure") return null;
  return <div className="text-xs"><p className="text-tertiary">Effet{a.avant_le && a.apres_le ? ` du ${date(a.avant_le)} au ${date(a.apres_le)}` : ""} :</p>
    <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{deltasEffet(a).map((d) => <li key={d.cle}>{d.label} <Fleche valeur={d.valeur} /></li>)}</ul>
    <p className="mt-1 text-tertiary">{MENTION_CAUSE}</p></div>;
}

export function LigneSuivi({ action: a, subject, connecte, surlignee }: { action: SuiviActionV3; subject: string; connecte: boolean; surlignee: boolean }) {
  const geste = useGesteVisibility();
  const [responsable, setResponsable] = useState(a.responsable ?? "");
  useEffect(() => setResponsable(a.responsable ?? ""), [a.responsable]);
  const ref = useRef<HTMLLIElement>(null);
  useEffect(() => { if (surlignee) ref.current?.scrollIntoView?.({ block: "center" }); }, [surlignee]);
  const fait = a.suivi === "fait";
  const suivre = async (etat: EtatGeste, extra: { p_responsable?: string; p_echeance?: string } = {}) => {
    if (!connecte || !subject || !a.action_cle) return;
    try {
      await geste.executer("vis_suivre_action", { p_subject: subject, p_action_cle: a.action_cle, p_etat: etat,
        ...(a.responsable ? { p_responsable: a.responsable } : {}), ...(a.echeance && !a.echeance_proposee ? { p_echeance: a.echeance } : {}), ...extra });
    } catch { /* erreur affichée */ }
  };
  const etatCourant: EtatGeste = (ETATS_GESTE as readonly string[]).includes(a.suivi ?? "") ? a.suivi as EtatGeste : "planifie";
  const desactive = !connecte || geste.enCours;
  return <li ref={ref} className={`border-b border-border py-4 last:border-0 ${surlignee ? "rounded-md bg-muted px-3" : ""}`}>
    <div className="flex items-start gap-3">
      <input type="checkbox" aria-label={`${fait ? "Remettre à faire" : "Marquer fait"} : ${a.titre ?? a.action_cle}`} className="mt-1 size-5 shrink-0" checked={fait} disabled={desactive} onChange={() => void suivre(fait ? "planifie" : "fait")} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2"><h3 className={`text-sm ${fait ? "text-muted-foreground line-through" : ""}`}>{a.titre ?? "Action sans titre"}</h3>{a.priorite && <Badge fort>{a.priorite}</Badge>}<Badge>{libelleOrigineSuivi(a)}</Badge>{a.en_retard && <span className="rounded-md bg-block px-2 py-0.5 text-xs text-primary-foreground">En retard</span>}</div>
        {a.quoi_faire && <p className="mt-1 text-sm text-muted-foreground">{a.quoi_faire}</p>}
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="grid gap-1 text-xs text-tertiary">État<FiltreSelect aria-label={`État : ${a.titre ?? a.action_cle}`} value={a.suivi === "a_planifier" || !a.suivi ? "" : etatCourant} disabled={desactive} onChange={(e) => e.target.value && void suivre(e.target.value as EtatGeste)}>
            <option value="" disabled>À planifier</option>{ETATS_GESTE.map((e) => <option key={e} value={e}>{ETATS_SUIVI[e]}</option>)}</FiltreSelect></label>
          <label className="grid gap-1 text-xs text-tertiary">Responsable<input aria-label={`Responsable : ${a.titre ?? a.action_cle}`} value={responsable} disabled={desactive} onChange={(e) => setResponsable(e.target.value)} onBlur={() => { if (responsable.trim() !== (a.responsable ?? "")) void suivre(etatCourant, { p_responsable: responsable.trim() }); }} className="min-h-11 w-40 rounded-md border border-border bg-background px-3 text-sm text-foreground" /></label>
          <label className="grid gap-1 text-xs text-tertiary">Échéance{a.echeance_proposee && a.echeance ? " (proposée)" : ""}<input type="date" aria-label={`Échéance : ${a.titre ?? a.action_cle}`} value={a.echeance?.slice(0, 10) ?? ""} disabled={desactive} onChange={(e) => e.target.value && void suivre(etatCourant, { p_echeance: e.target.value })} className="min-h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground" /></label>
        </div>
        {fait && <div className="mt-3 grid gap-2"><div className="flex flex-wrap items-center gap-2 text-xs"><BadgeVerification verification={a.verification} />{a.fait_le && <span className="text-tertiary">Fait le {date(a.fait_le)}</span>}{a.verifie_le && <span className="text-tertiary">· vérifié le {date(a.verifie_le)}</span>}{a.preuve && <span className="break-all text-tertiary">· preuve {a.preuve}</span>}</div><EffetAction action={a} /></div>}
        <ErreurGeste erreur={geste.erreur} />
      </div>
    </div>
  </li>;
}

export function OngletActions({ subject, cible }: { subject: string; cible: string | null }) {
  const { connecte, suivi, actions } = useSuiviVisibility(subject);
  const [f, setF] = useState<FiltresSuivi>(filtresSuiviVides);
  const liste = useMemo(() => trierSuivi(filtrerSuivi(actions, f)), [actions, f]);
  const options = (v: (string | null | undefined)[]) => [...new Set(v.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, "fr"));
  const filtre = (cle: keyof FiltresSuivi, label: string, valeurs: string[], lib: (v: string) => string, tous = "Tous") => <label className="grid gap-1.5 text-xs text-tertiary">{label}<FiltreSelect aria-label={label} value={f[cle]} onChange={(e) => setF((x) => ({ ...x, [cle]: e.target.value }))}><option value="">{tous}</option>{valeurs.map((v) => <option key={v} value={v}>{lib(v)}</option>)}</FiltreSelect></label>;
  return <Section titre="Actions" aside={<span className="num text-sm text-tertiary">{compteurSuivi(actions)}</span>}>
    <div className="mb-5 flex flex-wrap items-end gap-3">
      {filtre("suivi", "Suivi", Object.keys(ETATS_SUIVI), (v) => ETATS_SUIVI[v] ?? v)}
      {filtre("priorite", "Priorité", options(actions.map((a) => a.priorite)), (v) => v, "Toutes")}
      {filtre("origine", "Origine", options(actions.map(libelleOrigineSuivi)), (v) => v, "Toutes")}
      {filtre("qui", "Qui", options(actions.map((a) => a.qui)), libelleQui)}
      {filtre("retard", "En retard", ["oui", "non"], (v) => v === "oui" ? "En retard" : "À l'heure")}
    </div>
    {connecte && suivi.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des actions…</p>
      : connecte && suivi.error ? <div role="alert" className="text-sm text-block">{suivi.error.message}<Button variant="outline" className="ml-3 min-h-11" onClick={() => void suivi.refetch()}>Réessayer</Button></div>
      : liste.length === 0 ? <p className="text-sm text-muted-foreground">{actions.length ? "Aucune action pour ces filtres." : "Aucune action suivie pour ce site."}</p>
      : <ol>{liste.map((a) => <LigneSuivi key={a.action_cle ?? a.titre ?? ""} action={a} subject={subject} connecte={connecte} surlignee={cible === a.action_cle} />)}</ol>}
  </Section>;
}
