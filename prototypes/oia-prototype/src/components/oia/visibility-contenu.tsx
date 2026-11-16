import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Minus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Section, Statut } from "@/components/oia/ui";
import { EtatVisibilityV3, JaugeScore } from "@/components/oia/visibility-score";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { libelleVisibility } from "@/components/oia/visibility-ui";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { dollars } from "@/lib/donnees/visibility-pilotage";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  AXES_CONTENU, budgetRestantNoteContenu, constatsContenuOuverts, criteresContenu, delaiSuiviNoteContenu, depotLuContenu,
  etatCritereContenu, libelleSourceCritere, noteContenuActive, noteContenuResultat, notesContenuPourSujet,
  preuveCritere, raisonEtatNoteContenu, type CritereContenu,
} from "@/lib/donnees/visibility-contenu";

const dateContenu = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const date = (valeur: string | null | undefined) => valeur ? dateContenu.format(new Date(valeur)) : "Date non fournie";

function Critere({ critere }: { critere: CritereContenu }) {
  const etat = etatCritereContenu(critere);
  const preuve = preuveCritere(critere);
  const Icone = critere.ok === true ? Check : critere.ok === false ? X : Minus;
  return <details className="border-b border-border py-3 last:border-0">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${critere.ok === true ? "bg-ok/15 text-ok" : critere.ok === false ? "bg-block/15 text-block" : "bg-muted text-muted-foreground"}`}><Icone className="size-4" aria-hidden="true" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm">{critere.titre}</span><span className="mt-1 block text-xs text-tertiary">{critere.valeur ?? "Valeur non fournie"} · {libelleSourceCritere(critere.source)}{critere.points !== null ? ` · ${critere.points} points` : ""}</span></span>
      <span className={`text-xs ${etat === "conforme" ? "text-ok" : etat === "à corriger" ? "text-block" : "text-muted-foreground"}`}>{etat === "conforme" ? "✓ conforme" : etat === "à corriger" ? "✗ à corriger" : etat}</span>
    </summary>
    <div className="ml-0 mt-3 grid gap-3 rounded-md bg-muted p-4 text-sm sm:ml-10">
      <h4 className="text-xs text-tertiary">Preuve</h4>
      {preuve.pages.length > 0 && <div><p className="text-xs text-tertiary">Pages en cause</p><ul className="mt-1 grid gap-1">{preuve.pages.map((page) => <li key={page} className="break-all">{page}</li>)}</ul></div>}
      {preuve.fichiers.length > 0 && <div><p className="text-xs text-tertiary">Fichiers</p><ul className="mt-1 grid gap-1">{preuve.fichiers.map((fichier) => <li key={fichier} className="break-all font-mono text-xs">{fichier}</li>)}</ul></div>}
      {critere.source === "modele" && (preuve.citation ? <blockquote className="border-l-2 border-module-visibility pl-3 leading-relaxed">« {preuve.citation} »</blockquote> : <p className="text-muted-foreground">Non vérifiable : l’IA n’a pas pu citer le site.</p>)}
      {preuve.texte && <p className="whitespace-pre-wrap leading-relaxed">{preuve.texte}</p>}
      {!preuve.pages.length && !preuve.fichiers.length && !preuve.citation && !preuve.texte && critere.source !== "modele" && <p className="text-muted-foreground">Preuve non fournie.</p>}
    </div>
  </details>;
}

export function CarteLancerNoteContenu({ subject }: { subject: string }) {
  const { donnees, connecte, query } = useVisibilityV3();
  const geste = useGesteVisibility();
  const refetch = useRef(query.refetch);
  refetch.current = query.refetch;
  const [confirmation, setConfirmation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const estimation = donnees.estimationsNotesContenu.find((item) => item.subject_id === subject);
  const historique = notesContenuPourSujet(donnees.notesContenu, subject);
  const actif = noteContenuActive(donnees.notesContenu, subject);
  const delai = delaiSuiviNoteContenu(actif);
  const recent = historique[0];
  const restant = budgetRestantNoteContenu(estimation);
  const raisonBudget = raisonEtatNoteContenu(estimation?.etat);
  const coutValide = typeof estimation?.cout_max_usd === "number" && Number.isFinite(estimation.cout_max_usd);
  const blocage = !connecte ? "Connexion requise pour lancer une note réelle." : actif ? "Une note du contenu est déjà en cours pour ce site." : raisonBudget ?? (!coutValide ? "Le coût maximal n'est pas fourni." : null);

  useEffect(() => {
    if (!connecte || delai === false) return;
    const minuteur = window.setInterval(() => { void refetch.current(); }, delai);
    return () => window.clearInterval(minuteur);
  }, [connecte, delai]);

  async function lancer() {
    if (!estimation || !coutValide || blocage) return;
    setMessage(null);
    try {
      await geste.executer("vis_lancer_note_contenu", { p_subject: subject, p_cout_vu_usd: estimation.cout_max_usd! });
      setConfirmation(false);
    } catch (erreur) {
      if (erreur instanceof Error && erreur.message.includes("estimation changée")) {
        await geste.recharger();
        setConfirmation(false);
        setMessage("Estimation rechargée. Vérifiez le nouveau montant avant de confirmer à nouveau.");
      }
    }
  }

  return <Section titre="Lancer la note du contenu">
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,1fr)]">
      <div><p className="text-sm leading-relaxed text-muted-foreground">Analyse technique, fonctionnelle et commerciale des pages, complétée par la lecture du dépôt lié lorsqu’il existe.</p><p className="num mt-5 text-xl"><span className="text-sm font-normal">environ </span>{dollars(estimation?.cout_habituel_usd)}<span className="mx-2 text-muted-foreground">·</span><span className="text-sm font-normal">au plus </span>{dollars(estimation?.cout_max_usd)}</p><p className="num mt-2 text-sm text-muted-foreground">Budget du mois restant : {restant === null ? "non fixé" : dollars(restant)}</p><p className="mt-2 break-all text-xs text-tertiary">Dépôt : {estimation?.depot ?? "aucun dépôt lié"}</p></div>
      <div className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        {actif && <div role="status" className="mb-5 rounded-md border border-border bg-muted p-4"><div className="flex flex-wrap items-center justify-between gap-2"><Statut etat="verifier" label={`Note en cours · ${libelleVisibility(actif.statut)}`} /><span className="text-xs text-tertiary">actualisation toutes les 30 s</span></div><div className="mt-3 h-3 overflow-hidden rounded-sm bg-track" role="progressbar" aria-label="Note du contenu en cours"><div className="h-full w-2/3 animate-pulse bg-module-visibility motion-reduce:animate-none" /></div></div>}
        {!actif && recent?.statut === "FAILED" && <div role="alert" className="mb-5 rounded-md border border-border p-4"><Statut etat="bloquant" label="Échec de la note" /><p className="mt-2 whitespace-pre-wrap text-sm text-block">{recent.erreur || "Erreur non fournie."}</p></div>}
        {!actif && recent?.statut === "DONE" && <p className="num mb-4 text-sm text-muted-foreground">Dernière note terminée · coût réel {dollars(recent.cout_reel_usd)}</p>}
        {!confirmation ? <Button type="button" className="min-h-11" disabled={Boolean(blocage) || geste.enCours} onClick={() => { setMessage(null); setConfirmation(true); }}>Lancer la note du contenu</Button> : <div className="rounded-md border border-border p-4"><p className="text-sm">Confirmez le lancement pour un montant maximal de <strong className="num">{dollars(estimation?.cout_max_usd)}</strong>.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={geste.enCours} onClick={() => void lancer()}>{geste.enCours ? "Lancement en cours…" : `Confirmer pour ${dollars(estimation?.cout_max_usd)}`}</Button><Button type="button" variant="ghost" className="min-h-11" disabled={geste.enCours} onClick={() => setConfirmation(false)}>Revenir</Button></div></div>}
        {blocage && <p role="alert" className="mt-3 text-sm text-muted-foreground">{blocage}</p>}
        {connecte && raisonBudget && <Button asChild variant="link" className="mt-1 min-h-11 px-0"><Link to="/visibility/$onglet" params={{ onglet: "reglages" }} search={{ site: subject, reglage: "budget" }} hash="budget">Réglages › Budget</Link></Button>}
        <ErreurGeste erreur={geste.erreur} />
        {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
      </div>
    </div>
  </Section>;
}

export function VueQualiteContenu() {
  const { donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const subject = selection.sujetId ?? donnees.notesContenu[0]?.subject_id ?? donnees.scores[0]?.subject_id ?? "studio-ardoise";
  const note = noteContenuResultat(donnees.notesContenu, subject);
  const criteres = criteresContenu(note);
  const depot = depotLuContenu(note);
  const constats = constatsContenuOuverts(donnees.constats, subject);
  return <EtatVisibilityV3><div className="grid gap-6">
    <Section titre="Qualité du contenu" aside={<span className="text-xs text-tertiary">{date(note?.terminee_le ?? note?.le)}</span>}>
      {(depot.sensibles ?? 0) > 0 && <div role="alert" className="mb-5 rounded-md border border-block bg-block/10 p-4 text-sm text-block">Fichiers secrets versionnés dans le dépôt : changer les clés et les retirer</div>}
      <div className="grid gap-5 sm:grid-cols-3">{AXES_CONTENU.map((axe) => <div key={axe.id} className="flex flex-col items-center rounded-md border-t-4 bg-muted/40 p-5 text-center" style={{ borderTopColor: axe.couleur }}><h3 className="text-sm font-medium">{axe.label}</h3><div className="mt-4"><JaugeScore score={note?.[axe.note]} petite /></div></div>)}</div>
      <dl className="mt-6 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-3"><div><dt className="text-xs text-tertiary">Dépôt lu</dt><dd className="mt-1 break-all">{depot.depot ?? "Aucun dépôt"}</dd></div><div><dt className="text-xs text-tertiary">Commit</dt><dd className="num mt-1">{depot.sha ? depot.sha.slice(0, 7) : "Non fourni"}{depot.branche ? <span className="ml-2 text-xs text-tertiary">· {depot.branche}</span> : null}</dd></div><div><dt className="text-xs text-tertiary">Fichiers lus</dt><dd className="num mt-1">{depot.fichiers ?? "Non mesuré"}</dd></div></dl>
      {depot.erreur && <p role="alert" className="mt-4 whitespace-pre-wrap text-sm text-block">{depot.erreur}</p>}
    </Section>
    <Section titre="Critères et preuves"><p className="mb-4 text-sm text-muted-foreground">Chaque critère conserve sa valeur, sa source et sa preuve. Une absence de citation ne devient jamais un échec mesuré.</p>{criteres.length === 0 ? <p className="text-sm text-muted-foreground">Aucun critère mesuré pour ce site.</p> : <div className="grid gap-6">{AXES_CONTENU.map((axe) => { const lignes = criteres.filter((critere) => critere.axe === axe.id); return <section key={axe.id}><h3 className="border-l-4 pl-3 text-sm font-medium" style={{ borderLeftColor: axe.couleur }}>{axe.label}<span className="num ml-2 text-xs font-normal text-tertiary">{lignes.length} critère{lignes.length > 1 ? "s" : ""}</span></h3><div className="mt-2">{lignes.length ? lignes.map((critere) => <Critere key={critere.id} critere={critere} />) : <p className="py-3 text-sm text-muted-foreground">Aucun critère sur cet axe.</p>}</div></section>; })}</div>}</Section>
    <Section titre="Synthèse">{note?.synthese ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{note.synthese}</p> : <p className="text-sm text-muted-foreground">Synthèse non disponible. Lancez une note du contenu pour l’établir.</p>}</Section>
    <Section titre="Constats de contenu ouverts" aside={<Button asChild variant="outline" className="min-h-11"><Link to="/visibility/$onglet" params={{ onglet: "opportunites" }} search={{ site: subject }}>Ouvrir À corriger</Link></Button>}>{constats.length === 0 ? <p className="text-sm text-muted-foreground">Aucun constat de contenu ouvert.</p> : <ol>{constats.map((constat) => <li key={constat.id ?? constat.cle} className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-4 text-sm last:border-0"><div><p>{constat.titre ?? "Constat sans titre"}</p><p className="mt-1 text-xs text-tertiary">{libelleVisibility(constat.categorie)} · {constat.correction ?? "Correction non fournie"}</p></div><Statut etat={constat.gravite === "critique" ? "bloquant" : constat.gravite === "important" ? "verifier" : "conforme"} label={libelleVisibility(constat.gravite, "À examiner")} /></li>)}</ol>}</Section>
    <CarteLancerNoteContenu subject={subject} />
  </div></EtatVisibilityV3>;
}
