import { useEffect, useState, type FormEvent } from "react";
import { FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Statut } from "@/components/oia/ui";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { libelleVisibility } from "@/components/oia/visibility-ui";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { dollars } from "@/lib/donnees/visibility-pilotage";
import {
  COUT_EXTRACTION_HABITUEL_USD, COUT_EXTRACTION_MAX_USD, demandeExtraction, erreurTexteRapport, lireFichierRapport,
  RAPPORT_MAX, type ChargeurPdf,
} from "@/lib/donnees/visibility-plan";

export const AIDE_RAPPORT_EXTERNE = "Les rapports externes servent aussi de contexte à l'audit IA express.";
const champ = "min-h-40 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";

export function FormulaireRapportExterne({ subject, onImporte, onFerme, chargeurPdf }: { subject: string; onImporte?: (id: string) => void; onFerme: () => void; chargeurPdf?: ChargeurPdf }) {
  const geste = useGesteVisibility();
  const [texte, setTexte] = useState("");
  const [lecture, setLecture] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [importe, setImporte] = useState<string | null>(null);
  async function lireFichier(fichier: File | undefined) {
    if (!fichier) return;
    setErreur(null); setLecture(`Lecture de ${fichier.name}…`);
    try { setTexte(await lireFichierRapport(fichier, chargeurPdf)); setLecture(`Texte extrait de ${fichier.name}, dans votre navigateur.`); }
    catch (e) { setLecture(null); setErreur(e instanceof Error ? e.message : "Le fichier ne peut pas être lu."); }
  }
  async function envoyer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setErreur(null);
    const f = new FormData(e.currentTarget);
    const probleme = erreurTexteRapport(texte);
    if (probleme) { setErreur(probleme); return; }
    try {
      const id = await geste.executer("vis_importer_rapport_externe", {
        p_subject: subject, p_outil: String(f.get("outil") ?? "").trim(), p_realise_le: String(f.get("date") ?? ""),
        p_titre: String(f.get("titre") ?? "").trim(), p_rapport_md: texte.trim(),
      });
      setImporte(id); onImporte?.(id);
    } catch { /* erreur RPC affichée telle quelle */ }
  }
  return <form className="mb-8 grid gap-4 rounded-md border border-border p-5" onSubmit={envoyer} aria-label="Ajouter un rapport externe">
    <div><h2 className="text-base">Ajouter un rapport externe</h2><p className="mt-1 text-xs text-tertiary">{AIDE_RAPPORT_EXTERNE} Pour un PDF, seul le texte extrait dans le navigateur est envoyé.</p></div>
    <div className="grid gap-4 md:grid-cols-3">
      <label className="grid gap-1.5 text-xs text-tertiary">Outil<Input name="outil" className="min-h-11" placeholder="Semrush, Perplexity, Agence X…" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Date<Input name="date" type="date" className="min-h-11" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Titre<Input name="titre" className="min-h-11" required maxLength={200} /></label>
    </div>
    <label className="grid gap-1.5 text-xs text-tertiary">Fichier .md, .txt ou .pdf<Input type="file" accept=".md,.txt,.pdf,text/markdown,text/plain,application/pdf" className="min-h-11 py-2" onChange={(e) => void lireFichier(e.target.files?.[0])} /></label>
    {lecture && <p role="status" className="text-xs text-tertiary">{lecture}</p>}
    <label className="grid gap-1.5 text-xs text-tertiary">Ou coller le texte<textarea aria-label="Texte du rapport" className={champ} value={texte} onChange={(e) => setTexte(e.target.value)} /></label>
    <p className="num text-xs text-tertiary">{texte.trim().length.toLocaleString("fr-FR")} caractères · entre 200 et {RAPPORT_MAX.toLocaleString("fr-FR")}</p>
    {erreur && <p role="alert" className="text-sm text-block">{erreur}</p>}
    {importe && <p role="status" className="text-sm text-ok">Rapport ajouté. Vous pouvez maintenant en tirer le plan d'action.</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" className="min-h-11" disabled={geste.enCours}>{geste.enCours ? "Envoi en cours…" : "Envoyer le rapport"}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={onFerme}>Fermer</Button></div>
    <ErreurGeste erreur={geste.erreur} />
    {importe && <CarteExtrairePlan audit={importe} />}
  </form>;
}

export const DELAI_SUIVI_EXTRACTION = 30_000;
export function CarteExtrairePlan({ audit }: { audit: string }) {
  const geste = useGesteVisibility();
  const { connecte, global, globalQuery } = useVisibilityPilotage();
  const [confirmation, setConfirmation] = useState(false);
  const [demandeId, setDemandeId] = useState<string | null>(null);
  const demande = demandeExtraction(global?.demandes ?? [], audit, demandeId);
  const actif = demande?.statut === "QUEUED" || demande?.statut === "RUNNING";
  useEffect(() => {
    if (!actif) return;
    const t = window.setInterval(() => void globalQuery.refetch(), DELAI_SUIVI_EXTRACTION);
    return () => window.clearInterval(t);
  }, [actif, globalQuery]);
  return <div className="mt-4 rounded-md border border-border p-4" aria-label="Tirer le plan d'action de ce rapport">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-sm font-medium">Tirer le plan d'action de ce rapport</h3><p className="num mt-1 text-xs text-tertiary">environ {dollars(COUT_EXTRACTION_HABITUEL_USD)} · au plus {dollars(COUT_EXTRACTION_MAX_USD)}</p></div>
      {demande && <Statut etat={demande.statut === "FAILED" ? "bloquant" : actif ? "verifier" : "conforme"} label={`Extraction · ${libelleVisibility(demande.statut)}`} />}</div>
    {demande?.statut === "FAILED" && demande.erreur && <p role="alert" className="mt-2 text-sm text-block">{demande.erreur}</p>}
    {demande?.statut === "DONE" && <p className="mt-2 text-xs text-tertiary">Les actions sont arrivées dans le plan, origine « Rapport externe ».</p>}
    {actif && <p role="status" className="mt-2 text-xs text-tertiary">Extraction en cours, actualisation toutes les 30 s.</p>}
    {!actif && (confirmation
      ? <div className="mt-3 flex flex-wrap items-center gap-2"><p className="text-sm">Confirmer une dépense d'au plus {dollars(COUT_EXTRACTION_MAX_USD)} ?</p><Button className="min-h-11" disabled={geste.enCours} onClick={async () => { try { const id = await geste.executer("vis_extraire_plan", { p_audit_externe: audit, p_cout_vu_usd: COUT_EXTRACTION_MAX_USD }); setDemandeId(id); setConfirmation(false); } catch { /* erreur affichée */ } }}>Confirmer</Button><Button variant="ghost" className="min-h-11" onClick={() => setConfirmation(false)}>Annuler</Button></div>
      : <Button variant="outline" className="mt-3 min-h-11" disabled={!connecte || geste.enCours} onClick={() => setConfirmation(true)}>Tirer le plan d'action</Button>)}
    {!connecte && <p className="mt-2 text-xs text-tertiary">Connexion requise.</p>}
    <ErreurGeste erreur={geste.erreur} />
  </div>;
}

export function BoutonRapportExterne({ subject }: { subject: string }) {
  const [ouvert, setOuvert] = useState(false);
  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-tertiary">{AIDE_RAPPORT_EXTERNE}</p><Button variant="outline" className="min-h-11" onClick={() => setOuvert((v) => !v)}><FileUp aria-hidden="true" />Ajouter un rapport externe</Button></div>
    {ouvert && <FormulaireRapportExterne subject={subject} onFerme={() => setOuvert(false)} />}
  </>;
}
