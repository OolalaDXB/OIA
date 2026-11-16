import { useState, type FormEvent } from "react";
import { Circle, CircleDashed, Download, Plus, Star, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Section } from "@/components/oia/ui";
import { BarreColoree } from "@/components/oia/graphiques";
import { MarkdownSecurise } from "@/components/oia/visibility-markdown";
import { EtatVisibilityV3, JaugeScore } from "@/components/oia/visibility-score";
import { LogoAssistant } from "@/components/oia/visibility-identites";
import { CarteAuditIaExpress } from "@/components/oia/visibility-audit-ia";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import type { AuditExterneV3 } from "@/lib/donnees/visibility-v3";
import type { Fonctions } from "@/lib/donnees/visibility-pilotage";
import type { Json } from "@/integrations/supabase/types";
import {
  classementConcurrents, domainesCites, lireCsvAudit, matriceDepuisLignes,
  peutImporterAudit, type MatriceAudit,
} from "@/lib/donnees/visibility-audits";
import { auditsExternesAComparer } from "@/lib/donnees/visibility-audit-ia";

const dateAudit = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const texteChamp = "min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";

function PastilleScore({ score }: { score: number }) {
  if (score === 3) return <Star className="size-5 text-ok" fill="currentColor" aria-hidden="true" />;
  if (score === 2) return <Circle className="size-4 text-ok" fill="currentColor" aria-hidden="true" />;
  if (score === 1) return <CircleDashed className="size-5 text-warn" aria-hidden="true" />;
  return <X className="size-5 text-muted-foreground" aria-hidden="true" />;
}

const legendeScore = ["Absent", "Cité ou inexact", "Listé", "Premier choix avec lien"];

export function MatriceQuestions({ moteurs, matrice, prefixe = "audit", compact = false }: { moteurs: string[]; matrice: MatriceAudit[]; prefixe?: string; compact?: boolean }) {
  const [selection, setSelection] = useState<{ question: MatriceAudit; moteur: string } | null>(null);
  if (!matrice.length) return <p className="text-sm text-muted-foreground">Aucune ligne de question pour cet audit.</p>;
  const detail = selection ? {
    concurrents: selection.question.concurrents[selection.moteur] ?? [],
    domaines: selection.question.domaines[selection.moteur] ?? [],
  } : null;
  return <div>
    <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-tertiary" aria-label="Légende des scores">
      {[3, 2, 1, 0].map((score) => <span key={score} className="inline-flex items-center gap-1.5"><PastilleScore score={score} />{legendeScore[score]}</span>)}
    </div>
    <div className="max-w-full overflow-x-auto">
      <table className={`w-full border-collapse text-sm ${compact ? "min-w-[20rem]" : "min-w-[44rem]"}`}>
        <thead><tr className="border-b border-border text-left text-xs text-tertiary"><th className={`${compact ? "min-w-40" : "min-w-64"} py-2 pr-4 font-normal`}>Question</th>{moteurs.map((moteur) => <th key={moteur} className={`${compact ? "min-w-20" : "min-w-32"} px-2 py-2 text-center font-normal`}><span className="inline-flex items-center gap-1.5"><LogoAssistant nom={moteur} petite />{moteur}</span></th>)}</tr></thead>
        <tbody>{matrice.map((question) => <tr key={question.id} className="border-b border-border last:border-0">
          <th scope="row" className="py-2 pr-4 text-left font-normal"><span title={question.question} className="block cursor-help truncate">{question.id} · {question.sujet}</span><span className="sr-only">{question.question}</span></th>
          {moteurs.map((moteur) => {
            const score = question.scores[moteur] ?? 0;
            const actif = selection?.question.id === question.id && selection.moteur === moteur;
            return <td key={moteur} className="p-1 text-center"><button type="button" className={`inline-flex size-11 items-center justify-center rounded-md border ${actif ? "border-module-visibility bg-track" : "border-transparent"}`} aria-label={`${prefixe}, ${question.id}, ${moteur}, score ${score} sur 3 : ${legendeScore[score]}`} aria-pressed={actif} title={`${question.question} · ${legendeScore[score]}`} onClick={() => setSelection({ question, moteur })}><PastilleScore score={score} /></button></td>;
          })}
        </tr>)}</tbody>
      </table>
    </div>
    {selection && detail && <div role="status" className="mt-4 rounded-md border border-border bg-muted p-4 text-sm">
      <p>{selection.question.id} · {selection.moteur}</p><p className="mt-1 text-muted-foreground">{selection.question.question}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><p><span className="block text-xs text-tertiary">Concurrents cités à la place</span>{detail.concurrents.length ? detail.concurrents.join(", ") : "Aucun concurrent cité"}</p><p><span className="block text-xs text-tertiary">Domaines cités</span>{detail.domaines.length ? detail.domaines.join(", ") : "Aucun domaine cité"}</p></div>
    </div>}
  </div>;
}

function telechargerRapport(audit: AuditExterneV3) {
  const blob = new Blob([audit.rapport_md ?? ""], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const lien = document.createElement("a");
  lien.href = url;
  lien.download = `audit-${audit.outil ?? "externe"}-${audit.realise_le ?? "date"}.md`.toLocaleLowerCase("fr-FR").replace(/[^a-z0-9._-]+/g, "-");
  lien.click();
  URL.revokeObjectURL(url);
}

function CarteAudit({ audit }: { audit: AuditExterneV3 }) {
  const { donnees } = useVisibilityV3();
  const lignes = donnees.auditLignes.filter((l) => l.audit_id === audit.id);
  const moteurs = audit.moteurs ?? [...new Set(lignes.map((l) => l.moteur).filter((m): m is string => Boolean(m)))];
  const matrice = matriceDepuisLignes(lignes, moteurs);
  const concurrents = classementConcurrents(matrice);
  const domaines = domainesCites(matrice);
  const maxDomaines = Math.max(1, ...domaines.map((d) => d.citations));
  const scoreOia = donnees.scores.find((s) => s.subject_id === audit.subject_id);
  const titre = audit.outil ?? "Audit externe";
  return <article id={audit.id ? `audit-${audit.id}` : undefined} className="grid scroll-mt-6 gap-6" aria-label={`${titre} du ${audit.realise_le ?? "jour non fourni"}`}>
    <Section titre={titre} aside={<span className="text-xs text-tertiary">Complément aux mesures OIA</span>}>
      <div className="grid gap-6 lg:grid-cols-[12rem_minmax(0,1fr)] lg:items-start">
        <div><JaugeScore score={audit.score} petite /><p className="mt-2 max-w-40 text-xs text-tertiary">score de l'outil, méthode différente</p></div>
        <div><p className="text-sm text-tertiary">Réalisé le {audit.realise_le ? dateAudit.format(new Date(`${audit.realise_le.slice(0, 10)}T00:00:00Z`)) : "à une date non fournie"} · {audit.questions ?? matrice.length} questions · {moteurs.length} moteurs</p><p className="mt-3 max-w-4xl text-sm leading-relaxed text-muted-foreground">{audit.resume || "Aucun résumé fourni."}</p></div>
      </div>
      <div className="mt-5 rounded-md border border-border bg-muted p-4"><h3 className="text-sm">Méthode et limites</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">{audit.methode || "Méthode non fournie."}</p></div>
    </Section>
    {scoreOia && <Section titre="Deux mesures du même site">
      <p className="mb-5 text-sm text-muted-foreground">méthodes différentes : ne pas comparer les chiffres, comparer les tendances</p>
      <div className="flex flex-wrap items-start gap-8"><div><JaugeScore score={scoreOia.score} /><p className="mt-2 text-sm">Score OIA</p></div><div><JaugeScore score={audit.score} petite /><p className="mt-2 text-sm">{titre}</p><p className="mt-1 max-w-40 text-xs text-tertiary">score de l'outil, méthode différente</p></div></div>
    </Section>}
    <Section titre="Matrice des questions et des moteurs"><p className="mb-4 text-sm text-muted-foreground">Cliquez sur une case pour voir les concurrents et les domaines cités.</p><MatriceQuestions moteurs={moteurs} matrice={matrice} prefixe={titre} /></Section>
    <div className="grid gap-6 xl:grid-cols-2">
      <Section titre="Classement des concurrents"><p className="mb-4 text-sm text-muted-foreground">Nombre de réponses où chaque nom apparaît et nombre de moteurs concernés.</p>{concurrents.length === 0 ? <p className="text-sm text-muted-foreground">Aucun concurrent cité.</p> : <ol>{concurrents.map((c, index) => <li key={c.nom} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-3 text-sm last:border-0"><span className="num text-tertiary">{index + 1}</span><span>{c.nom}</span><span className="num text-right">{c.reponses} réponse{c.reponses > 1 ? "s" : ""}<span className="block text-xs text-tertiary">{c.moteurs} moteur{c.moteurs > 1 ? "s" : ""}</span></span></li>)}</ol>}</Section>
      <Section titre="Domaines les plus cités par les moteurs"><p className="mb-4 text-sm text-muted-foreground">Ces domaines sont les cibles prioritaires pour obtenir des fiches.</p>{domaines[0] && <p className="carte-chiffre mb-4 text-sm" style={{ "--carte-couleur": "var(--chart-2)" } as React.CSSProperties}><strong className="num mr-2 text-xl">{domaines[0].citations}</strong>citations pour {domaines[0].nom}, le domaine à traiter en premier.</p>}{domaines.length === 0 ? <p className="text-sm text-muted-foreground">Aucun domaine cité.</p> : <div>{domaines.map((d) => <div key={d.nom} className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-3 border-b border-border py-3 text-sm last:border-0"><span className="break-all">{d.nom}</span><BarreColoree label={d.nom} largeur={d.citations / maxDomaines * 100} detail={`${d.citations} citations dans cet audit externe`} /><span className="num">{d.citations}</span></div>)}</div>}</Section>
    </div>
    <Section titre="Rapport complet" aside={<Button variant="outline" className="min-h-11" disabled={!audit.rapport_md} onClick={() => telechargerRapport(audit)}><Download aria-hidden="true" />Télécharger</Button>}>
      {audit.rapport_md ? <details><summary className="min-h-11 cursor-pointer py-2 text-sm">Lire le rapport complet</summary><div className="mt-3 max-w-4xl border-t border-border pt-4 text-sm"><MarkdownSecurise texte={audit.rapport_md} /></div></details> : <p className="text-sm text-muted-foreground">Aucun rapport Markdown fourni.</p>}
    </Section>
  </article>;
}

function ComparaisonAuditsExternes({ audits, subject }: { audits: AuditExterneV3[]; subject: string }) {
  const { donnees } = useVisibilityV3();
  const paire = auditsExternesAComparer(audits, subject);
  if (!paire) return null;
  const construire = (audit: AuditExterneV3) => {
    const lignes = donnees.auditLignes.filter((ligne) => ligne.audit_id === audit.id);
    const moteurs = audit.moteurs ?? [...new Set(lignes.map((ligne) => ligne.moteur).filter((moteur): moteur is string => Boolean(moteur)))];
    return { moteurs, matrice: matriceDepuisLignes(lignes, moteurs) };
  };
  const oia = construire(paire.oia);
  const perplexity = construire(paire.perplexity);
  const sujets = [...new Set([...oia.matrice.map((ligne) => ligne.sujet), ...perplexity.matrice.map((ligne) => ligne.sujet)])];
  return <Section titre="Perplexity et OIA, matrices côte à côte">
    <p className="mb-5 text-sm text-muted-foreground">méthodes différentes : comparer les tendances, pas les chiffres</p>
    <div className="grid gap-8">{sujets.map((sujet) => <section key={sujet} aria-label={`Comparaison pour ${sujet}`}><h3 className="mb-4 text-base font-medium">{sujet}</h3><div className="grid gap-6 xl:grid-cols-2">
      {([{ titre: "Perplexity Computer", donnees: perplexity }, { titre: "OIA · Audit IA express", donnees: oia }] as const).map(({ titre, donnees: audit }) => <div key={titre} className="min-w-0 rounded-md border border-border p-4"><h4 className="mb-3 text-sm">{titre}</h4><MatriceQuestions moteurs={audit.moteurs} matrice={audit.matrice.filter((ligne) => ligne.sujet === sujet)} prefixe={`${titre}, ${sujet}`} compact /></div>)}
    </div></section>)}</div>
  </Section>;
}

type ParametresImport = Fonctions["vis_importer_audit_externe"]["Args"];

function FormulaireImport({ subject, onFerme }: { subject: string; onFerme: () => void }) {
  const geste = useGesteVisibility();
  const [apercu, setApercu] = useState<ParametresImport | null>(null);
  const [matrice, setMatrice] = useState<MatriceAudit[]>([]);
  const [erreur, setErreur] = useState<string | null>(null);
  const [importe, setImporte] = useState<string | null>(null);
  async function preparer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErreur(null); setImporte(null);
    const formulaire = new FormData(e.currentTarget);
    const csv = formulaire.get("csv");
    if (!(csv instanceof File) || !csv.size) { setErreur("Sélectionnez un fichier CSV."); return; }
    try {
      const { moteurs, matrice: prochainesLignes } = lireCsvAudit(await csv.text());
      const rapport = formulaire.get("rapport");
      const rapportMd = rapport instanceof File && rapport.size ? await rapport.text() : "";
      setMatrice(prochainesLignes);
      setApercu({
        p_subject: subject,
        p_outil: String(formulaire.get("outil") ?? "").trim(),
        p_realise_le: String(formulaire.get("date") ?? ""),
        p_methode: String(formulaire.get("methode") ?? "").trim(),
        p_moteurs: moteurs,
        p_score: Number(formulaire.get("score")),
        p_resume: String(formulaire.get("resume") ?? "").trim(),
        p_rapport_md: rapportMd,
        p_matrice: prochainesLignes as unknown as Json,
      });
    } catch (e) {
      setApercu(null); setMatrice([]);
      setErreur(e instanceof Error ? e.message : "Le fichier ne peut pas être lu.");
    }
  }
  async function importer() {
    if (!apercu) return;
    setErreur(null);
    try {
      const id = await geste.executer("vis_importer_audit_externe", apercu);
      setImporte(id); setApercu(null); setMatrice([]);
    } catch { /* l'erreur RPC est reprise mot pour mot sous le formulaire */ }
  }
  return <form className="mb-8 grid gap-5 rounded-md border border-border p-5" onSubmit={preparer}>
    <div><h2 className="text-base">Importer un audit externe</h2><p className="mt-1 text-xs text-tertiary">L'import reste séparé des mesures et du score OIA. Le même audit réimporté conserve la même ligne.</p></div>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-xs text-tertiary">Outil<Input name="outil" className="min-h-11" placeholder="Perplexity Computer" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Date de réalisation<Input name="date" type="date" className="min-h-11" defaultValue={new Date().toISOString().slice(0, 10)} required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Score de l'outil, sur 100<Input name="score" type="number" min="0" max="100" step="0.01" className="min-h-11" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Moteurs<Input aria-label="Moteurs déduits du CSV" value={apercu?.p_moteurs.join(", ") ?? ""} placeholder="Déduits des colonnes _score du CSV" readOnly className="min-h-11" /></label>
    </div>
    <label className="grid gap-1.5 text-xs text-tertiary">Méthode<textarea name="methode" className={texteChamp} required /></label>
    <label className="grid gap-1.5 text-xs text-tertiary">Résumé<textarea name="resume" className={texteChamp} required /></label>
    <div className="grid gap-4 md:grid-cols-2">
      <label className="grid gap-1.5 text-xs text-tertiary">Matrice CSV<Input name="csv" type="file" accept=".csv,text/csv" className="min-h-11 py-2" required /></label>
      <label className="grid gap-1.5 text-xs text-tertiary">Rapport Markdown, facultatif<Input name="rapport" type="file" accept=".md,text/markdown,text/plain" className="min-h-11 py-2" /></label>
    </div>
    <p className="text-xs leading-relaxed text-tertiary">Colonnes : id, topic, prompt, &lt;moteur&gt;_score, &lt;moteur&gt;_competitors, &lt;moteur&gt;_cited_domains. Concurrents séparés par ;, domaines par virgules, — pour une cellule vide.</p>
    {erreur && <p role="alert" className="text-sm text-block">{erreur}</p>}
    {apercu && <div className="border-t border-border pt-5"><h3 className="text-sm">Aperçu avant envoi</h3><p className="mb-4 mt-1 text-xs text-tertiary">{matrice.length} questions · {apercu.p_moteurs.length} moteurs · score {apercu.p_score} / 100</p><MatriceQuestions moteurs={apercu.p_moteurs} matrice={matrice} prefixe="Aperçu" /><div className="mt-5 flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={geste.enCours} onClick={() => void importer()}>{geste.enCours ? "Import en cours…" : "Importer cet audit"}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => { setApercu(null); setMatrice([]); }}>Modifier</Button></div></div>}
    {importe && <p role="status" className="text-sm text-ok">Audit importé. Identifiant : {importe}</p>}
    <div className="flex flex-wrap gap-2"><Button type="submit" variant="outline" className="min-h-11">Prévisualiser la matrice</Button><Button type="button" variant="ghost" className="min-h-11" onClick={onFerme}>Fermer</Button></div>
    <p role="alert" className="text-sm text-block">{geste.erreur}</p>
  </form>;
}

export function VueAuditsExternes() {
  const { donnees, connecte } = useVisibilityV3();
  const { global, globalQuery } = useVisibilityPilotage();
  const selection = useSelectionVisibility();
  const [importOuvert, setImportOuvert] = useState(false);
  const subject = selection.sujetId ?? donnees.audits[0]?.subject_id ?? donnees.estimationsAuditIa[0]?.subject_id ?? donnees.scores[0]?.subject_id ?? "";
  const audits = donnees.audits.filter((a) => a.subject_id === subject).sort((a, b) => Number(b.dernier) - Number(a.dernier) || (b.realise_le ?? "").localeCompare(a.realise_le ?? ""));
  const role = global?.portefeuille.find((p) => p.subject_id === subject)?.mon_role;
  const autorise = connecte && peutImporterAudit(role);
  return <EtatVisibilityV3>
    <div className="mb-6"><CarteAuditIaExpress subject={subject} /></div>
    <div className="mb-6"><ComparaisonAuditsExternes audits={audits} subject={subject} /></div>
    <div className="mb-6 flex flex-wrap items-end justify-end gap-3">{autorise && <Button className="min-h-11" onClick={() => setImportOuvert((v) => !v)}><Plus aria-hidden="true" />Importer un audit externe</Button>}</div>
    {connecte && globalQuery.isPending && <p role="status" className="mb-6 text-xs text-tertiary">Vérification du rôle…</p>}
    {connecte && globalQuery.error && <div role="alert" className="mb-6"><p className="text-sm text-block">{globalQuery.error.message}</p><Button variant="outline" className="mt-2 min-h-11" onClick={() => void globalQuery.refetch()}>Réessayer</Button></div>}
    {connecte && !globalQuery.isPending && !globalQuery.error && !autorise && <p className="mb-6 text-xs text-tertiary">L'import est réservé aux propriétaires et approbateurs.</p>}
    {importOuvert && autorise && <FormulaireImport subject={subject} onFerme={() => setImportOuvert(false)} />}
    {audits.length === 0 ? <Section titre="Audits externes"><p className="text-sm text-muted-foreground">Aucun audit externe pour ce site. Les audits importés resteront séparés du score OIA.</p></Section> : <div className="grid gap-10">{audits.map((audit) => <CarteAudit key={audit.id ?? `${audit.outil}-${audit.realise_le}`} audit={audit} />)}</div>}
  </EtatVisibilityV3>;
}
