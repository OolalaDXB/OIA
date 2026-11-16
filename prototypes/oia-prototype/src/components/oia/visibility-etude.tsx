import { useState, type FormEvent } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Section, Statut } from "@/components/oia/ui";
import { ChargementPilotage, ErreurGeste } from "./visibility-pilotage";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { demainIso, dollars, objet, proprietesRapport, raisonGo, tableau, texte, type LignePilotage } from "@/lib/donnees/visibility-pilotage";
import { listeSousOngletsVisibility, menuVisibility, ongletVisibility } from "@/components/oia/visibility-ui";
import type { Json } from "@/integrations/supabase/types";
import { ResumeRapportV3 } from "@/components/oia/visibility-score";
type Proposition = LignePilotage<"vis_propositions_v2">;

function resumeProposition(p: Proposition) {
  const c = objet(p.contenu);
  if (p.nature === "fait") return texte(c["enonce"], "Fait sans énoncé");
  if (p.nature === "question") return texte(c["texte"], "Question sans texte");
  if (p.nature === "concurrent" || p.nature === "homonyme") return texte(c["nom"], "Nom non fourni");
  return `${texte(c["controle"], "Contrôle")} : ${texte(c["detail"], "Détail non fourni")}`;
}
function detailProposition(p: Proposition) {
  const c = objet(p.contenu);
  if (p.nature === "question") return [texte(c["langue"]), texte(c["famille"]), c["marquee"] === true ? "marquée" : "non marquée"].filter(Boolean).join(" · ");
  if (p.nature === "fait") return texte(c["categorie"]);
  if (p.nature === "concurrent") return [texte(c["type"]), Array.isArray(c["domaines"]) ? c["domaines"].join(", ") : ""].filter(Boolean).join(" · ");
  if (p.nature === "homonyme") return texte(c["exemple"]);
  return texte(c["etat"]);
}

function EditerProposition({ p, onFerme }: { p: Proposition; onFerme: () => void }) {
  const geste = useGesteVisibility();
  const [valeur, setValeur] = useState(JSON.stringify(p.contenu ?? {}, null, 2));
  const [locale, setLocale] = useState<string | null>(null);
  async function soumettre(e: FormEvent) {
    e.preventDefault(); setLocale(null);
    let contenu: Json;
    try { contenu = JSON.parse(valeur) as Json; } catch { setLocale("Contenu JSON invalide."); return; }
    try { await geste.executer("vis_modifier_proposition", { p_id: p.id!, p_contenu: contenu }); onFerme(); } catch { /* erreur RPC affichée */ }
  }
  return <form className="mt-3 grid gap-3 rounded-md border border-border p-3" onSubmit={soumettre}><label className="grid gap-1.5 text-xs text-tertiary">Contenu de la proposition<Textarea className="min-h-32 font-mono text-xs" value={valeur} onChange={(e) => setValeur(e.target.value)} required /></label><div className="flex gap-2"><Button type="submit" className="min-h-11" disabled={geste.enCours}>Enregistrer la modification</Button><Button type="button" variant="ghost" className="min-h-11" onClick={onFerme}>Annuler</Button></div><ErreurGeste erreur={locale ?? geste.erreur} /></form>;
}

function AjouterProposition({ subject, nature }: { subject: string; nature: "fait" | "question" | "concurrent" }) {
  const geste = useGesteVisibility();
  const [ouvert, setOuvert] = useState(false);
  const [locale, setLocale] = useState<string | null>(null);
  if (!ouvert) return <Button variant="outline" className="min-h-11" onClick={() => setOuvert(true)}>Ajouter</Button>;
  async function soumettre(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLocale(null);
    const f = new FormData(e.currentTarget);
    let contenu: Json;
    if (nature === "fait") contenu = { enonce: String(f.get("principal") ?? ""), categorie: String(f.get("secondaire") ?? "") };
    else if (nature === "question") contenu = { texte: String(f.get("principal") ?? ""), langue: String(f.get("langue") ?? "fr"), marquee: f.get("marquee") === "on", famille: String(f.get("secondaire") ?? ""), moteurs: String(f.get("moteurs") ?? "").split(",").map((v) => v.trim()).filter(Boolean) };
    else contenu = { nom: String(f.get("principal") ?? ""), type: String(f.get("type") ?? "structure"), domaines: String(f.get("secondaire") ?? "").split(",").map((v) => v.trim()).filter(Boolean), citations: 0 };
    try { await geste.executer("vis_ajouter_proposition", { p_subject: subject, p_nature: nature, p_contenu: contenu }); setOuvert(false); } catch { /* erreur RPC affichée */ }
  }
  return <form className="mt-4 grid gap-3 rounded-md border border-border p-4" onSubmit={soumettre}>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs text-tertiary">{nature === "fait" ? "Énoncé" : nature === "question" ? "Question" : "Nom"}<Input name="principal" className="min-h-11" required /></label><label className="grid gap-1.5 text-xs text-tertiary">{nature === "fait" ? "Catégorie" : nature === "question" ? "Famille" : "Domaines, séparés par des virgules"}<Input name="secondaire" className="min-h-11" required={nature !== "concurrent"} /></label></div>
    {nature === "question" && <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs text-tertiary">Langue<Input name="langue" className="min-h-11" defaultValue="fr" required /></label><label className="grid gap-1.5 text-xs text-tertiary">Moteurs, séparés par des virgules<Input name="moteurs" className="min-h-11" defaultValue="chatgpt, claude" /></label><label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="marquee" className="size-4" />Question marquée</label></div>}
    {nature === "concurrent" && <label className="grid gap-1.5 text-xs text-tertiary">Type<select className={menuVisibility} name="type"><option value="structure">Structure</option><option value="personne">Personne</option><option value="plateforme">Plateforme</option></select></label>}
    <div className="flex gap-2"><Button type="submit" className="min-h-11" disabled={geste.enCours}>Ajouter la proposition</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOuvert(false)}>Annuler</Button></div><ErreurGeste erreur={locale ?? geste.erreur} />
  </form>;
}

function SectionPropositions({ subject, titre, nature, propositions, homonymes = [] }: { subject: string; titre: string; nature: "fait" | "question" | "concurrent" | "homonyme" | "audit"; propositions: Proposition[]; homonymes?: Proposition[] }) {
  const geste = useGesteVisibility();
  const proposees = propositions.filter((p) => p.etat === "propose");
  const [selection, setSelection] = useState<string[]>([]);
  const [homonymesSelectionnes, setHomonymesSelectionnes] = useState<string[]>([]);
  const [edition, setEdition] = useState<string | null>(null);
  const tous = [...propositions, ...homonymes];
  const basculer = (id: string, homonyme = false) => {
    const setter = homonyme ? setHomonymesSelectionnes : setSelection;
    setter((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  };
  async function valider() {
    try {
      if (nature === "fait") await geste.executer("vis_valider_faits", { p_subject: subject, p_ids: selection, p_rejetes: proposees.filter((p) => p.id && !selection.includes(p.id)).map((p) => p.id!) });
      else if (nature === "question") await geste.executer("vis_valider_panel", { p_subject: subject, p_ids: selection });
      else await geste.executer("vis_valider_concurrents", { p_subject: subject, p_ids: selection, p_homonymes: homonymesSelectionnes });
      setSelection([]); setHomonymesSelectionnes([]);
    } catch { /* erreur RPC affichée */ }
  }
  const affiche = (p: Proposition, homonyme = false) => <div key={p.id} className="border-b border-border py-3 last:border-0"><div className="flex flex-wrap items-start gap-3">
    {p.etat === "propose" && p.nature !== "audit" && <Checkbox className="mt-1" aria-label={`Sélectionner ${resumeProposition(p)}`} checked={(homonyme ? homonymesSelectionnes : selection).includes(p.id!)} onCheckedChange={() => basculer(p.id!, homonyme)} />}
    <div className="min-w-0 flex-1"><p className="text-sm">{resumeProposition(p)}</p><p className="mt-1 text-xs text-tertiary">{detailProposition(p)}</p><p className="mt-1 break-all text-xs text-tertiary">Source : {p.source || "non fournie"} · version {p.version ?? "?"} · {p.etat}</p></div>
    {p.etat === "propose" && p.nature !== "audit" && <Button variant="ghost" className="min-h-11" onClick={() => setEdition(edition === p.id ? null : p.id)}>Modifier</Button>}
  </div>{edition === p.id && <EditerProposition p={p} onFerme={() => setEdition(null)} />}</div>;
  return <Section titre={titre} aside={nature !== "audit" && nature !== "homonyme" ? <AjouterProposition subject={subject} nature={nature} /> : undefined}>
    {tous.length === 0 ? <p className="text-sm text-muted-foreground">Aucune proposition dans cette section.</p> : <div>{propositions.map((p) => affiche(p))}{homonymes.map((p) => affiche(p, true))}</div>}
    {nature !== "audit" && nature !== "homonyme" && <div className="mt-4 border-t border-border pt-4"><Button className="min-h-11" disabled={geste.enCours || (nature !== "fait" && selection.length === 0)} onClick={() => void valider()}>{nature === "fait" ? "Valider la sélection" : nature === "question" ? "Valider le panel" : "Valider les concurrents et homonymes"}</Button><p className="mt-2 text-xs text-tertiary">La base confirme la décision avant toute mise à jour de l'écran.</p><ErreurGeste erreur={geste.erreur} /></div>}
  </Section>;
}

function PanelSite({ subject, questions }: { subject: string; questions: Proposition[] }) {
  const geste = useGesteVisibility();
  const [selection, setSelection] = useState<string[]>([]);
  const [edition, setEdition] = useState<string | null>(null);
  const langues = [...new Set(questions.map((q) => texte(objet(q.contenu)["langue"], "inconnue")))];
  const basculer = (id: string) => setSelection((ids) => ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
  const ligne = (q: Proposition) => <div key={q.id} className="border-b border-border py-3 last:border-0"><div className="flex flex-wrap items-start gap-3">{q.etat === "propose" && <Checkbox className="mt-1" aria-label={`Sélectionner ${resumeProposition(q)}`} checked={selection.includes(q.id!)} onCheckedChange={() => basculer(q.id!)} />}<div className="min-w-0 flex-1"><p className="text-sm">{resumeProposition(q)}</p><p className="mt-1 text-xs text-tertiary">{detailProposition(q)}</p><p className="mt-1 break-all text-xs text-tertiary">Source : {q.source || "non fournie"} · version {q.version ?? "?"} · {q.etat}</p></div>{q.etat === "propose" && <Button variant="ghost" className="min-h-11" onClick={() => setEdition(edition === q.id ? null : q.id)}>Modifier</Button>}</div>{edition === q.id && <EditerProposition p={q} onFerme={() => setEdition(null)} />}</div>;
  return <Section titre="Panel" aside={<AjouterProposition subject={subject} nature="question" />}>
    {questions.length === 0 ? <p className="text-sm text-muted-foreground">Aucune question proposée.</p> : langues.map((langue) => <div key={langue} className="mb-5"><h3 className="mb-2 text-sm text-tertiary">{langue}</h3><h4 className="text-xs text-tertiary">Questions non marquées</h4>{questions.filter((q) => texte(objet(q.contenu)["langue"], "inconnue") === langue && objet(q.contenu)["marquee"] !== true).map(ligne)}<h4 className="mt-4 text-xs text-tertiary">Questions marquées</h4>{questions.filter((q) => texte(objet(q.contenu)["langue"], "inconnue") === langue && objet(q.contenu)["marquee"] === true).map(ligne)}</div>)}
    <div className="mt-4 border-t border-border pt-4"><Button className="min-h-11" disabled={geste.enCours || selection.length === 0} onClick={async () => { try { await geste.executer("vis_valider_panel", { p_subject: subject, p_ids: selection }); setSelection([]); } catch { /* erreur RPC affichée */ } }}>Valider le panel complet</Button><p className="mt-2 text-xs text-tertiary">Une seule validation couvre toutes les langues et les questions marquées et non marquées.</p><ErreurGeste erreur={geste.erreur} /></div>
  </Section>;
}

function RevueSite({ subject }: { subject: string }) {
  const { sujet } = useVisibilityPilotage();
  const p = sujet?.propositions ?? [];
  return <div className="grid gap-6"><SectionPropositions subject={subject} titre="Faits" nature="fait" propositions={p.filter((x) => x.nature === "fait")} />
    <PanelSite subject={subject} questions={p.filter((x) => x.nature === "question")} />
    <SectionPropositions subject={subject} titre="Concurrents" nature="concurrent" propositions={p.filter((x) => x.nature === "concurrent")} homonymes={p.filter((x) => x.nature === "homonyme")} />
    <SectionPropositions subject={subject} titre="Homonymes" nature="homonyme" propositions={p.filter((x) => x.nature === "homonyme")} />
    <SectionPropositions subject={subject} titre="Audit, lecture seule" nature="audit" propositions={p.filter((x) => x.nature === "audit")} />
  </div>;
}

function LancerSite({ subject, client }: { subject: string; client: string }) {
  const { sujet, global } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const candidates = (sujet?.fenetres ?? []).filter((f) => f.statut === "proposee");
  const [windowId, setWindowId] = useState("");
  const [confirmation, setConfirmation] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const fenetre = candidates.find((f) => f.window_id === windowId) ?? candidates[0];
  const budget = global?.budgets.find((b) => b.client_id === client);
  const blocage = raisonGo(budget, fenetre?.cout_estime_usd);
  const detail = objet(fenetre?.detail_estimation ?? null);
  const parMoteur = objet((detail["par_moteur"] ?? null) as Json | null);
  async function lancer() {
    if (!fenetre?.window_id || typeof fenetre.cout_estime_usd !== "number") return;
    setMessage(null);
    const reconnaissance = fenetre.nature === "reconnaissance";
    const debut = reconnaissance ? null : String(new FormData(document.getElementById("go-fenetre-form") as HTMLFormElement).get("debut") ?? "");
    try {
      if (reconnaissance) await geste.executer("vis_go_reconnaissance", { p_subject: subject, p_cout_vu_usd: fenetre.cout_estime_usd });
      else await geste.executer("vis_go_fenetre", { p_subject: subject, p_debut: debut!, p_cout_vu_usd: fenetre.cout_estime_usd });
      setConfirmation(false);
    } catch (e) {
      if (e instanceof Error && e.message.includes("estimation changée, recharger")) {
        await geste.recharger(); setConfirmation(false); setMessage("Estimation rechargée. Vérifiez le nouveau montant avant de confirmer à nouveau.");
      }
    }
  }
  return <Section titre="Lancer une étude"><div className="grid gap-6 lg:grid-cols-2"><div>
    {candidates.length === 0 ? <p className="text-sm text-muted-foreground">Aucune étape chiffrée n'attend un GO.</p> : <><label className="grid gap-1.5 text-xs text-tertiary">Étude à lancer<select className={menuVisibility} value={fenetre?.window_id ?? ""} onChange={(e) => { setWindowId(e.target.value); setConfirmation(false); }}>{candidates.map((f) => <option key={f.window_id} value={f.window_id ?? ""}>{f.libelle} · {f.nature}</option>)}</select></label>
      <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2"><div><dt className="text-xs text-tertiary">Estimation</dt><dd className="num mt-1 text-3xl">{dollars(fenetre?.cout_estime_usd)}</dd></div><div><dt className="text-xs text-tertiary">Plafond restant du mois</dt><dd className="num mt-1 text-xl">{budget?.plafond_usd == null ? "Non fixé" : dollars(Math.max(0, budget.plafond_usd - (budget.reel_usd ?? 0) - (budget.engage_usd ?? 0)))}</dd></div></dl>
      <div className="mt-4 text-xs text-tertiary"><p>Détail par moteur</p>{Object.keys(parMoteur).length === 0 ? <p className="mt-1">Détail non fourni.</p> : <pre className="mt-2 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{JSON.stringify(parMoteur, null, 2)}</pre>}</div>
    </>}</div>
    {fenetre && <form id="go-fenetre-form" className="border-t border-border pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0" onSubmit={(e) => { e.preventDefault(); setConfirmation(true); }}>
      {fenetre.nature !== "reconnaissance" && <label className="grid gap-1.5 text-xs text-tertiary">Date de début, au plus tôt demain<Input className="min-h-11" name="debut" type="date" min={demainIso()} defaultValue={demainIso()} required /></label>}
      {blocage && <p role="alert" className="mt-4 text-sm text-block">{blocage}</p>}
      {!confirmation ? <Button type="submit" className="mt-5 min-h-11" disabled={Boolean(blocage)}>{fenetre.nature === "reconnaissance" ? "Préparer la reconnaissance" : "Préparer le lancement"}</Button> : <div className="mt-5 rounded-md border border-border p-4"><p className="text-sm">Confirmez le GO pour un montant de <strong className="num">{dollars(fenetre.cout_estime_usd)}</strong>.</p><p className="mt-1 text-xs text-tertiary">La base refusera le geste si l'estimation ou le plafond a changé.</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" className="min-h-11" disabled={geste.enCours} onClick={() => void lancer()}>{geste.enCours ? "Confirmation en cours…" : "Confirmer le GO"}</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setConfirmation(false)}>Revenir</Button></div></div>}
      <ErreurGeste erreur={geste.erreur} />{message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}
    </form>}
  </div></Section>;
}

function SuiviSite() {
  const { sujet } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const [motifs, setMotifs] = useState<Record<string, string>>({});
  const fenetres = sujet?.fenetres ?? [];
  return <Section titre="Suivi des fenêtres">{fenetres.length === 0 ? <p className="text-sm text-muted-foreground">Aucune fenêtre enregistrée.</p> : fenetres.map((f) => {
    const jours = tableau<{ jour?: number; date?: string; etat?: string }>(f.jours);
    return <div key={f.window_id} className="border-b border-border py-5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm">{f.libelle} · {f.window_id}</h3><p className="mt-1 text-xs text-tertiary">{f.statut} · début {f.debut} · {f.jours_prevus} jour(s){f.heure_utc ? ` · ${f.heure_utc} UTC` : ""}</p></div><span className="num text-sm">Coût réel : {dollars(f.cout_reel_usd)}</span></div>
      <ol className="mt-4 flex flex-wrap gap-2" aria-label={`Jours de ${f.libelle}`}>{Array.from({ length: f.jours_prevus ?? 5 }, (_, i) => { const j = jours.find((x) => x.jour === i + 1); const etat = j?.etat ?? "a_venir"; return <li key={i} className="rounded-md border border-border px-3 py-2 text-xs"><Statut etat={etat === "manquant" ? "bloquant" : etat === "partiel" ? "verifier" : "conforme"} label={`Jour ${i + 1} : ${etat.replace("_", " ")}`} /></li>; })}</ol>
      {(f.statut === "go_donne" || f.statut === "en_cours") && <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={async (e) => { e.preventDefault(); try { await geste.executer("vis_annuler_fenetre", { p_window: f.window_id!, p_motif: motifs[f.window_id!] ?? "" }); } catch { /* erreur affichée */ } }}><label className="grid min-w-64 flex-1 gap-1.5 text-xs text-tertiary">Motif obligatoire<Input className="min-h-11" value={motifs[f.window_id!] ?? ""} onChange={(e) => setMotifs((m) => ({ ...m, [f.window_id!]: e.target.value }))} required /></label><Button type="submit" variant="outline" className="min-h-11" disabled={geste.enCours}>Arrêter</Button></form>}
    </div>;
  })}<ErreurGeste erreur={geste.erreur} /></Section>;
}

function telecharger(nom: string, html: string) {
  const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = nom; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function RapportSite({ subject }: { subject: string }) {
  const { sujet } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const pages = sujet?.pages ?? [];
  const comparaisons = (sujet?.comparaisons ?? []).filter((c) => c.derniere);
  return <div className="grid gap-6"><ResumeRapportV3 subject={subject} /><Section titre="Rapports et pages client">{pages.length === 0 ? <p className="text-sm text-muted-foreground">Aucun rapport généré.</p> : pages.map((p) => <article key={p.id} className="border-b border-border py-5 last:border-0"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="text-sm">{p.nature === "rapport" ? "Rapport" : "Page client"} · {p.langue}</h3><p className="mt-1 text-xs text-tertiary">{p.window_id} · {p.etat}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" className="min-h-11" onClick={() => telecharger(`${p.nature}-${p.window_id}-${p.langue}.html`, p.html ?? "")}>Télécharger</Button>{p.etat === "a_valider" && <Button className="min-h-11" disabled={geste.enCours} onClick={async () => { try { await geste.executer("vis_valider_rapport", { p_page: p.id! }); } catch { /* erreur affichée */ } }}>Valider</Button>}</div></div><iframe title={`${p.nature} ${p.langue}`} className="mt-4 h-[32rem] w-full rounded-md border border-border bg-background" {...proprietesRapport(p.html ?? "")} /></article>)}<ErreurGeste erreur={geste.erreur} /></Section>
    <Section titre="Comparaison avec la fenêtre de référence">{comparaisons.length === 0 ? <p className="text-sm text-muted-foreground">Aucune comparaison disponible.</p> : comparaisons.map((c) => <div key={c.id}><p className="text-sm">{c.window_id} comparée à {c.fenetre_reference}</p><p className="mt-2 text-lg">{c.verdict_non_marque === "pas de changement démontrable" ? "pas de changement démontrable" : c.verdict_non_marque}</p><p className="mt-1 text-xs text-tertiary">Questions marquées : {c.verdict_marque} · preuves {c.preuves_reference} puis {c.preuves_courantes}</p></div>)}
      <div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="text-left text-xs text-tertiary"><tr className="border-b border-border">{["Famille", "Assistant", "Référence", "Courante", "Verdict", "Fragilité"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead><tbody>{(sujet?.comparaisonMoteurs ?? []).map((m) => <tr key={`${m.comparaison_id}-${m.famille}-${m.moteur}`} className="border-b border-border last:border-0"><td className="py-2 pr-3">{m.famille}</td><td className="pr-3">{m.moteur}</td><td className="num pr-3">{m.reference_moyenne ?? "Non mesurable"} %</td><td className="num pr-3">{m.courante_moyenne ?? "Non mesurable"} %</td><td className="pr-3">{m.verdict === "pas de changement démontrable" ? "pas de changement démontrable" : m.verdict}</td><td className="text-xs text-tertiary">{m.fragile ? m.raison_fragile : "Non"}</td></tr>)}</tbody></table></div>
    </Section>
  </div>;
}

export function PilotageSite({ subject, client }: { subject: string; client: string }) {
  return <ChargementPilotage sujet><div className="mb-8"><Tabs defaultValue="revue"><TabsList aria-label="Pilotage de l'étude" className={`${listeSousOngletsVisibility} h-auto rounded-none bg-transparent p-0 sm:grid-cols-4`}><TabsTrigger value="revue" className={ongletVisibility}>Revue</TabsTrigger><TabsTrigger value="lancer" className={ongletVisibility}>Lancer</TabsTrigger><TabsTrigger value="suivi" className={ongletVisibility}>Suivi</TabsTrigger><TabsTrigger value="rapport" className={ongletVisibility}>Rapport</TabsTrigger></TabsList><TabsContent value="revue"><RevueSite subject={subject} /></TabsContent><TabsContent value="lancer"><LancerSite subject={subject} client={client} /></TabsContent><TabsContent value="suivi"><SuiviSite /></TabsContent><TabsContent value="rapport"><RapportSite subject={subject} /></TabsContent></Tabs></div></ChargementPilotage>;
}
