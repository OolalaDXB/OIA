import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Shell, Fictif, Section } from "@/components/oia/ui";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import { rechercherMoney } from "@/lib/money-recherche.functions";
import type { AnalyseMoney } from "@/lib/money-recherche";
import { enregistrerEvenementMoney } from "@/lib/money-analytics";
import { formatMontant, sousTotaux, versCsv, versMarkdown, type Opportunite } from "@/lib/donnees/money";
import { useMoneyDonnees } from "@/lib/donnees/provider";

export const ongletsMoney = [
  { id: "aujourdhui", label: "Aujourd'hui" }, { id: "toutes", label: "Toutes" }, { id: "financements", label: "Financements" },
  { id: "appels-offres", label: "Appels d'offres" }, { id: "investisseurs", label: "Investisseurs" }, { id: "signals", label: "Signals" }, { id: "montants", label: "Montants" },
] as const;

type Journal = { date: string; texte: string };
const Ctx = createContext<{ etiquettes: Record<string, string>; etiqueter: (id: string, projet: string) => void; journal: Journal[]; ouvrir: (o: Opportunite) => void } | null>(null);
const useMoney = () => { const c = useContext(Ctx); if (!c) throw new Error("Money Lookup indisponible."); return c; };

export function MoneyProvider({ children }: { children: ReactNode }) {
  const { opportunites } = useMoneyDonnees();
  const [etiquettes, setEt] = useState<Record<string, string>>({});
  const [journal, setJournal] = useState<Journal[]>([]);
  const [fiche, setFiche] = useState<Opportunite | null>(null);
  const etiqueter = (id: string, projet: string) => {
    setEt((e) => ({ ...e, [id]: projet }));
    const o = opportunites.find((x) => x.id === id);
    setJournal((j) => [{ date: new Date().toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }), texte: `Mickaël a étiqueté « ${o?.titre} » : ${projet || "aucun projet"}.` }, ...j]);
  };
  const ouvrir = (o: Opportunite) => { setFiche(o); enregistrerEvenementMoney("project.money_opportunity_opened", { opportunity_id: o.id, type: o.type, verified: o.verification === "Vérifié" }); };
  return <Ctx.Provider value={{ etiquettes, etiqueter, journal, ouvrir }}>{children}<Fiche o={fiche} fermer={() => setFiche(null)} /></Ctx.Provider>;
}

export function Verif({ v }: { v: Opportunite["verification"] }) {
  return v === "Vérifié" ? <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"><span aria-hidden className="size-1.5 rounded-full bg-ok" />Vérifié</span>
    : <span className="inline-flex items-center gap-1.5 rounded-sm border border-warn px-1.5 py-0.5 text-xs text-foreground"><span aria-hidden className="size-1.5 rounded-full bg-warn" />Non vérifié</span>;
}

export function MoneyShell({ actif, children }: { actif: string; children: ReactNode }) {
  return <Shell><Fictif /><h1 className="mt-2 text-3xl">Money Lookup</h1><p className="mt-2 text-sm text-muted-foreground">Tout l'argent à aller chercher. Rien n'est certain sans vérification humaine.</p>
    <nav aria-label="Pages Money Lookup" className="mb-8 mt-6 flex gap-x-2 overflow-x-auto border-b border-border">{ongletsMoney.map((t) => <Link key={t.id} {...(t.id === "aujourdhui" ? { to: "/money-lookup" as const } : { to: "/money-lookup/$onglet" as const, params: { onglet: t.id } })} onClick={() => { if (t.id !== actif) enregistrerEvenementMoney("project.money_tab_selected", { tab: t.id }); }} aria-current={actif === t.id ? "page" : undefined} className={`inline-flex min-h-12 shrink-0 items-center whitespace-nowrap border-b-2 px-2 py-3 text-sm text-muted-foreground ${actif === t.id ? "border-module-funding text-foreground" : "border-transparent"}`}>{t.label}</Link>)}</nav>
    <RechercheMoney />{children}</Shell>;
}

function RechercheMoney() {
  const { opportunites } = useMoneyDonnees();
  const [texte, setTexte] = useState("");
  const [analyse, setAnalyse] = useState<AnalyseMoney | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [charge, setCharge] = useState(false);
  const rechercher = useServerFn(rechercherMoney);
  const { ouvrir } = useMoney();
  const soumettre = async (event: React.FormEvent) => {
    event.preventDefault(); if (charge || texte.trim().length < 3) return;
    setCharge(true); setErreur(null); setAnalyse(null);
    try { const result = await rechercher({ data: { texte } }); setAnalyse(result.analyse); setErreur(result.erreur); }
    catch { setErreur("L'analyse est indisponible. Votre texte est conservé."); }
    finally { setCharge(false); }
  };
  return <section className="mb-8 border-b border-border pb-6" aria-labelledby="money-besoin-titre">
    <h2 id="money-besoin-titre" className="mb-3 text-base">Trouver des correspondances</h2>
    <form onSubmit={soumettre} className="space-y-3"><label htmlFor="money-besoin" className="block text-sm text-muted-foreground">Votre besoin ou opportunité</label>
      <Textarea id="money-besoin" value={texte} maxLength={3000} disabled={charge} onChange={(e) => setTexte(e.target.value)} placeholder="Je cherche une subvention pour développer le prototype logiciel OIA en Bretagne…" className="min-h-24" />
      <div className="flex flex-wrap items-center gap-3"><Button type="submit" className="min-h-11" disabled={charge || texte.trim().length < 3}>{charge ? "Analyse en cours…" : "Rechercher les opportunités"}</Button><span className="text-xs text-tertiary">démonstration, modèle via Lovable · Claude Sonnet 5 · catalogue fictif uniquement</span></div>
      <p className="text-xs text-tertiary">Le texte est envoyé à AI Gateway pour cette analyse. N'incluez pas de données confidentielles. Aucune recherche web ni vérification humaine.</p>
    </form>
    {charge && <p role="status" className="mt-4 text-sm text-muted-foreground">Comparaison des opportunités de démonstration…</p>}
    {erreur && <p role="alert" className="mt-4 text-sm text-block">{erreur}</p>}
    {analyse && <div className="mt-5 space-y-4" aria-live="polite"><p className="text-sm">{analyse.resume}</p>
      {analyse.correspondances.length === 0 && <p className="text-sm text-muted-foreground">Aucune correspondance dans le catalogue de démonstration.</p>}
      <ol>{analyse.correspondances.map((c) => { const o = opportunites.find((item) => item.id === c.id); if (!o) return null; return <li key={c.id} className="border-t border-border py-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3>{o.titre}</h3><span className="text-xs text-muted-foreground">Correspondance {c.pertinence.toLowerCase()}</span></div>
        <p className="num mt-1 text-xs text-tertiary">{formatMontant(o.montant, o.devise)} · {o.typeMontant} · exemple fictif</p><div className="mt-2"><Verif v={o.verification} /></div>
        <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">{c.raisons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        {c.manquants.length > 0 && <div className="mt-3"><h4 className="text-xs font-medium">À préciser ou vérifier</h4><ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">{c.manquants.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
        <Button variant="link" className="mt-2 min-h-11 px-0" onClick={() => ouvrir(o)}>Ouvrir la fiche</Button>
      </li>; })}</ol>
      {analyse.manquants.length > 0 && <div className="border-t border-border pt-4"><h3 className="text-sm">Informations manquantes dans votre besoin</h3><ul className="mt-2 list-inside list-disc space-y-1 text-sm text-muted-foreground">{analyse.manquants.map((m, i) => <li key={i}>{m}</li>)}</ul></div>}
      <p className="text-xs text-tertiary">Analyse IA sur données fictives, à valider par Mickaël. Aucune éligibilité ni disponibilité garantie.</p>
    </div>}
  </section>;
}

function Ligne({ o }: { o: Opportunite }) {
  const { ouvrir, etiquettes } = useMoney();
  return <li className="border-b border-border last:border-0"><Button variant="ghost" type="button" onClick={() => ouvrir(o)} className="grid h-auto min-h-12 w-full gap-1 whitespace-normal rounded-none px-0 py-3 text-left text-sm font-normal sm:grid-cols-[1fr_8rem_9rem_7rem] sm:items-center sm:gap-4">
    <span><span className="block">{o.titre}</span><span className="block text-xs text-tertiary">{o.type} · {o.organisme}{etiquettes[o.id] ? ` · projet : ${etiquettes[o.id]}` : ""}</span></span>
    <span className="num text-xs text-muted-foreground">{o.cloture ? `Clôture ${o.cloture}` : "Clôture inconnue"}</span>
    <span className="num text-xs">{formatMontant(o.montant, o.devise)}<span className="block text-tertiary">{o.typeMontant}</span></span>
    <Verif v={o.verification} /></Button></li>;
}

export function Aujourdhui() {
  const { opportunites } = useMoneyDonnees();
  const bientot = opportunites.filter((o) => o.joursRestants !== null && o.joursRestants >= 0 && o.joursRestants <= 14);
  const retard = opportunites.filter((o) => o.statut === "En retard");
  const tri = opportunites.filter((o) => o.statut === "À trier");
  return <div className="grid gap-6 lg:grid-cols-2">
    <Section titre="Ferme bientôt" aside={<span className="text-xs text-tertiary">14 jours</span>}><ul>{bientot.map((o) => <Ligne key={o.id} o={o} />)}</ul></Section>
    <Section titre="En retard"><ul>{retard.map((o) => <Ligne key={o.id} o={o} />)}</ul></Section>
    <Section titre="Attend un tri" aside={<span className="num text-sm text-tertiary">{tri.length}</span>}><ul>{tri.map((o) => <Ligne key={o.id} o={o} />)}</ul></Section>
    <Section titre="Alertes de veille"><Signals compact /></Section>
  </div>;
}

export function Signals({ compact = false }: { compact?: boolean }) {
  const { signals } = useMoneyDonnees();
  const l = <ol>{signals.slice(0, compact ? 3 : undefined).map((s) => <li key={s.date} className="grid gap-1 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[10rem_1fr]"><span className="num text-xs text-tertiary">{s.date}</span><span>{s.texte}<span className="block text-xs text-tertiary">{s.source} · non vérifié</span></span></li>)}</ol>;
  return compact ? l : <Section titre="Veille permanente">{l}</Section>;
}

const champsFiltre = { type: ["Financement", "Appel d'offres", "Investisseur"], eligibilite: ["Éligible", "À confirmer", "Non éligible"], recommandation: ["Prioritaire", "À étudier", "Écarter"], verification: ["Vérifié", "Non vérifié"], entite: ["OIA SAS", "OIA FZ", "Studio Ardoise"], projet: [] as string[], fraicheur: ["Moins de 7 jours", "Moins de 30 jours", "Plus ancien"] } as const;
const libChamp: Record<keyof typeof champsFiltre, string> = { type: "Type", eligibilite: "Éligibilité", recommandation: "Recommandation", verification: "Vérification", entite: "Entité", projet: "Projet", fraicheur: "Fraîcheur" };
type Filtres = Partial<Record<keyof typeof champsFiltre, string>>;
type Vue = { nom: string; filtres: Filtres; tri: string };
const CLE_VUES = "oia.money.vues.v1";

function telecharger(contenu: string, nom: string, type: string) {
  const url = URL.createObjectURL(new Blob([contenu], { type }));
  const a = document.createElement("a"); a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function Liste({ type }: { type?: Opportunite["type"] }) {
  const { opportunites, projets } = useMoneyDonnees();
  const champs = { ...champsFiltre, projet: [...projets] };
  const { etiquettes } = useMoney();
  const [filtres, setFiltres] = useState<Filtres>({});
  const [tri, setTri] = useState("cloture");
  const [vues, setVues] = useState<Vue[]>([]);
  useEffect(() => { try { setVues(JSON.parse(localStorage.getItem(CLE_VUES) ?? "[]")); } catch { setVues([]); } }, []);
  const liste = useMemo(() => opportunites.filter((o) => (!type || o.type === type) && Object.entries(filtres).every(([k, v]) => !v || (k === "projet" ? etiquettes[o.id] === v || o.suggestions[0]?.projet === v : (o as Record<string, unknown>)[k] === v)))
    .sort((a, b) => tri === "cloture" ? (a.joursRestants ?? 9999) - (b.joursRestants ?? 9999) : tri === "score" ? (b.suggestions[0]?.score ?? 0) - (a.suggestions[0]?.score ?? 0) : a.titre.localeCompare(b.titre, "fr")), [filtres, tri, type, etiquettes, opportunites]);
  const enregistrer = () => { const nom = `Vue ${vues.length + 1}`; const n = [...vues, { nom, filtres, tri }]; setVues(n); try { localStorage.setItem(CLE_VUES, JSON.stringify(n)); } catch { /* stockage indisponible */ } };
  const sel = "min-h-11 rounded-md border border-border bg-background px-2 text-sm text-muted-foreground";
  return <>
    <div role="group" aria-label="Filtres" className="mb-4 flex flex-wrap gap-3 text-sm">{(Object.keys(champsFiltre) as (keyof typeof champsFiltre)[]).filter((k) => !(type && k === "type")).map((k) => <label key={k} className="flex items-center gap-2 text-tertiary">{libChamp[k]}<select className={sel} value={filtres[k] ?? ""} onChange={(e) => { setFiltres((f) => ({ ...f, [k]: e.target.value })); enregistrerEvenementMoney("project.money_filter_changed", { view: type ?? "Toutes", filter: k, active: e.target.value !== "" }); }}><option value="">Tous</option>{champs[k].map((v) => <option key={v}>{v}</option>)}</select></label>)}
      <label className="flex items-center gap-2 text-tertiary">Tri<select className={sel} value={tri} onChange={(e) => { setTri(e.target.value); enregistrerEvenementMoney("project.money_filter_changed", { view: type ?? "Toutes", filter: "tri", active: true }); }}><option value="cloture">Clôture la plus proche</option><option value="score">Meilleur score</option><option value="titre">Titre</option></select></label></div>
    <div className="mb-6 flex flex-wrap items-center gap-2"><Button variant="outline" className="min-h-11 font-normal" onClick={enregistrer}>Enregistrer la vue</Button>{vues.map((v) => <Button key={v.nom} variant="ghost" className="min-h-11 font-normal" onClick={() => { setFiltres(v.filtres); setTri(v.tri); enregistrerEvenementMoney("project.money_filter_changed", { view: type ?? "Toutes", filter: "vue_enregistree", active: Object.values(v.filtres).some(Boolean) }); }}>{v.nom}</Button>)}
      <span className="ml-auto flex flex-wrap gap-2"><Button variant="outline" className="min-h-11 font-normal" onClick={() => { telecharger(versCsv(liste), "money-lookup.csv", "text/csv;charset=utf-8"); enregistrerEvenementMoney("project.money_export_requested", { format: "csv", count: liste.length, view: type ?? "Toutes" }); }}>Export CSV</Button><Button variant="outline" className="min-h-11 font-normal" onClick={() => { telecharger(versMarkdown(liste), "money-lookup.md", "text/markdown;charset=utf-8"); enregistrerEvenementMoney("project.money_export_requested", { format: "markdown", count: liste.length, view: type ?? "Toutes" }); }}>Export Markdown</Button></span></div>
    <Section titre="Opportunités" aside={<span className="num text-sm text-tertiary">{liste.length}</span>}>{liste.length ? <ul>{liste.map((o) => <Ligne key={o.id} o={o} />)}</ul> : <p className="text-sm text-muted-foreground">Aucune opportunité pour ces filtres.</p>}</Section>
  </>;
}

function Fiche({ o, fermer }: { o: Opportunite | null; fermer: () => void }) {
  const { projets } = useMoneyDonnees();
  const { etiquettes, etiqueter, journal } = useMoney();
  const ligne = "flex flex-wrap justify-between gap-2 border-b border-border py-2 text-sm";
  return <Sheet open={!!o} onOpenChange={(v) => !v && fermer()}><SheetContent className="w-full overflow-y-auto sm:max-w-lg">{o && <>
    <SheetTitle className="pr-10 font-medium">{o.titre}</SheetTitle><SheetDescription className="text-xs">{o.type} · fiche fictive</SheetDescription>
    <div className="mt-4"><Verif v={o.verification} />{o.verification === "Non vérifié" && <p className="mt-2 text-xs text-muted-foreground">Ces informations n'ont pas encore été vérifiées par un humain.</p>}</div>
    <dl className="mt-4"><div className={ligne}><dt className="text-tertiary">Organisme</dt><dd>{o.organisme}</dd></div><div className={ligne}><dt className="text-tertiary">Publication</dt><dd className="num">{o.publication}</dd></div><div className={ligne}><dt className="text-tertiary">Clôture</dt><dd className="num">{o.cloture ?? "inconnue"}</dd></div><div className={ligne}><dt className="text-tertiary">Éligibilité</dt><dd>{o.eligibilite}</dd></div><div className={ligne}><dt className="text-tertiary">Montant</dt><dd className="num">{formatMontant(o.montant, o.devise)} · {o.typeMontant}</dd></div></dl>
    <h3 className="mb-2 mt-6 text-xs text-tertiary">Faits officiels</h3><ul>{o.faits.map((f) => <li key={f.fait} className="border-b border-border py-2 text-sm">{f.fait}<span className="block text-xs text-tertiary">Source : {f.source}</span></li>)}</ul>
    <h3 className="mb-2 mt-6 text-xs text-tertiary">Projets suggérés</h3><ul>{o.suggestions.map((s) => <li key={s.projet} className="border-b border-border py-2 text-sm"><span className="flex justify-between"><span>{s.projet}</span><span className="num">{s.score} / 100</span></span><span className="block text-xs text-tertiary">{s.raison}</span></li>)}</ul>
    <label className="mt-6 block text-xs text-tertiary">Projet étiqueté par Mickaël<select className="mt-1 min-h-11 w-full rounded-md border border-border bg-background px-2 text-sm text-foreground" value={etiquettes[o.id] ?? ""} onChange={(e) => etiqueter(o.id, e.target.value)}><option value="">Aucun</option>{projets.map((p) => <option key={p}>{p}</option>)}</select></label>
    <p className="mt-1 text-xs text-tertiary">Décision humaine, journalisée.</p>
    {journal.length > 0 && <ul className="mt-2">{journal.slice(0, 3).map((j) => <li key={j.date + j.texte} className="border-l border-border pl-2 text-xs text-muted-foreground">{j.date} · {j.texte}</li>)}</ul>}
    <h3 className="mb-2 mt-6 text-xs text-tertiary">Sources officielles</h3><ul className="text-sm">{o.sources.map((s) => <li key={s}>{s}</li>)}</ul>
    <h3 className="mb-2 mt-6 text-xs text-tertiary">Notes</h3>{o.notes.length ? <ul className="text-sm">{o.notes.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune note.</p>}
    <h3 className="mb-2 mt-6 text-xs text-tertiary">Tâches liées</h3>{o.taches.length ? <ul className="text-sm">{o.taches.map((n) => <li key={n}>{n}</li>)}</ul> : <p className="text-sm text-muted-foreground">Aucune tâche.</p>}
  </>}</SheetContent></Sheet>;
}

export function Montants() {
  const { opportunites, typesMontant } = useMoneyDonnees();
  const { etiquettes } = useMoney();
  const [type, setType] = useState(""); const [devise, setDevise] = useState(""); const [verif, setVerif] = useState("");
  const liste = opportunites.filter((o) => (!type || o.typeMontant === type) && (!devise || o.devise === devise) && (!verif || o.verification === verif));
  const projetDe = (o: Opportunite) => etiquettes[o.id] || o.suggestions[0]?.projet || "Sans projet";
  const groupes = [...new Set(liste.map(projetDe))];
  const sel = "min-h-11 rounded-md border border-border bg-background px-2 text-sm text-muted-foreground";
  return <>
    <div role="group" aria-label="Filtres" className="mb-6 flex flex-wrap gap-3 text-sm"><label className="flex items-center gap-2 text-tertiary">Type<select className={sel} value={type} onChange={(e) => { setType(e.target.value); enregistrerEvenementMoney("project.money_filter_changed", { view: "Montants", filter: "type_montant", active: e.target.value !== "" }); }}><option value="">Tous</option>{typesMontant.map((t) => <option key={t}>{t}</option>)}</select></label><label className="flex items-center gap-2 text-tertiary">Devise<select className={sel} value={devise} onChange={(e) => { setDevise(e.target.value); enregistrerEvenementMoney("project.money_filter_changed", { view: "Montants", filter: "devise", active: e.target.value !== "" }); }}><option value="">Toutes</option><option>EUR</option><option>USD</option><option>AED</option></select></label><label className="flex items-center gap-2 text-tertiary">Vérification<select className={sel} value={verif} onChange={(e) => { setVerif(e.target.value); enregistrerEvenementMoney("project.money_filter_changed", { view: "Montants", filter: "verification", active: e.target.value !== "" }); }}><option value="">Toutes</option><option>Vérifié</option><option>Non vérifié</option></select></label></div>
    <p className="mb-6 text-xs text-tertiary">Aucun total global : une subvention, un chiffre d'affaires potentiel, un investissement et un prêt ne s'additionnent pas.</p>
    {groupes.length === 0 && <p role="status" className="text-sm text-muted-foreground">Aucun montant pour ces filtres.</p>}
    <div className="grid gap-6">{groupes.map((p) => { const items = liste.filter((o) => projetDe(o) === p); return <Section key={p} titre={p}>
      {typesMontant.filter((t) => items.some((o) => o.typeMontant === t)).map((t) => <div key={t} className="mb-4 last:mb-0"><h3 className="mb-1 text-xs text-tertiary">{t}</h3>{items.filter((o) => o.typeMontant === t).map((o) => <div key={o.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm"><span>{o.titre}</span><span className="flex items-center gap-3"><span className="num">{formatMontant(o.montant, o.devise)}</span><Verif v={o.verification} /></span></div>)}
        {sousTotaux(items.filter((o) => o.typeMontant === t)).map((s) => <p key={s.devise} className="num mt-1 text-right text-xs text-tertiary">Sous-total {t.toLocaleLowerCase("fr")}, {s.devise} : {s.inconnus && s.total === 0 ? "inconnu" : formatMontant(s.total, s.devise)}{s.inconnus && s.total > 0 ? ` + ${s.inconnus} montant${s.inconnus > 1 ? "s" : ""} inconnu${s.inconnus > 1 ? "s" : ""}` : ""}</p>)}</div>)}
    </Section>; })}</div>
  </>;
}
