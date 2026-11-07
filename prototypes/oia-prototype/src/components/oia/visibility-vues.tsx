import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Section, Statut } from "@/components/oia/ui";
import { SeoResume } from "@/components/oia/visibility";
import { Chiffre, Courbe, FiltresVisibility, Indicateur, NoteMesure, Surligne, useFiltres } from "@/components/oia/mesure";
import { vueSite } from "@/data/demo";
import { BarreColoree, couleursGraphique } from "@/components/oia/graphiques";
import {
  assistants, citations, comparaison, concurrents, etatCollecte, fenetres, indicateurs, marque, opportunites, partVoix, presenceAssistant,
  presenceQuestion, questions, rapports, reponses, reseaux, serie, significatif, type IdFenetre, type NomAssistant, type Valeur,
} from "@/data/visibility";

const nomsConcurrents = concurrents.map((c) => c.nom);
const libQuestion = (id: string) => questions.find((q) => q.id === id)?.q ?? id;
const famQuestion = (id: string) => questions.find((q) => q.id === id)?.famille ?? "";
const pct = (v: number | null) => (v === null ? "non mesurable" : `${v} %`);

function precedente(id: IdFenetre) { const i = fenetres.findIndex((f) => f.id === id); return fenetres[i + 1]; }
function baisseSignificative(cle: "presence" | "partVoix" | "exactitude", id: IdFenetre) {
  const p = precedente(id); const cur = indicateurs[id][cle];
  return !!p && !fenetres.find((f) => f.id === id)?.enCours && significatif(cur, indicateurs[p.id][cle]) && (cur.v ?? 0) < (indicateurs[p.id][cle].v ?? 0);
}

function useReponsesFiltrees() {
  const f = useFiltres();
  return reponses.filter((r) => (f.assistant === "Tous" || r.assistant === f.assistant) && (f.famille === "Toutes" || famQuestion(r.question) === f.famille) && r.fenetre === f.fenetre);
}
function Vide() { return <p className="text-sm text-muted-foreground">Aucune réponse collectée pour ces filtres.</p>; }

function BarreValeur({ label, sous, val, max = 50 }: { label: string; sous?: string | undefined; val: Valeur | null; max?: number }) {
  const { fenetreActive: fen } = useFiltres();
  const ok = val && val.v !== null && !fen.enCours;
  return <div className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-4 border-b border-border py-3 text-sm last:border-0">
    <span className="min-w-0"><span className="block truncate">{label}</span>{sous && <span className="block truncate text-xs text-tertiary">{sous}</span>}</span>
    <span>{ok && val.v !== null ? <BarreColoree label={label} largeur={(val.v / max) * 100} detail={`${val.v} %, intervalle ${val.min} à ${val.max} %`} /> : <span className="block h-4 rounded-sm bg-track" />}</span>
    <span className="min-w-[8rem] text-right">{val ? <Chiffre val={val} fen={fen} /> : <span className="text-muted-foreground">non mesurable</span>}</span>
  </div>;
}

function LigneEtat() {
  return <dl className="mt-6 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
    <div><dt className="text-xs text-tertiary">Questions suivies</dt><dd className="num mt-1">{etatCollecte.questions}</dd></div>
    <div><dt className="text-xs text-tertiary">Réponses collectées</dt><dd className="num mt-1">{etatCollecte.reponses}</dd></div>
    <div><dt className="text-xs text-tertiary">Fréquence</dt><dd className="mt-1">{etatCollecte.frequence}</dd></div>
    <div><dt className="text-xs text-tertiary">Dernière mise à jour</dt><dd className="num mt-1">{etatCollecte.derniere}</dd></div>
  </dl>;
}

export function Indicateurs() {
  const f = useFiltres(); const fen = f.fenetreActive; const ind = indicateurs[fen.id];
  const presence = f.assistant === "Tous" ? ind.presence : presenceAssistant[fen.id][f.assistant as NomAssistant];
  const s = ind.sentiment;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Indicateur titre="Présence dans les réponses des IA" val={presence} fen={fen} alerte={baisseSignificative("presence", fen.id)} extra={!fen.enCours && <p className="num mt-3 text-xs text-tertiary">Sentiment : {s.positif} % positif · {s.neutre} % neutre · {s.negatif} % négatif</p>} />
    <Indicateur titre="Part de voix face aux concurrents" val={ind.partVoix} fen={fen} alerte={baisseSignificative("partVoix", fen.id)} />
    <Indicateur titre="Exactitude des faits cités" val={ind.exactitude} fen={fen} alerte={baisseSignificative("exactitude", fen.id)} />
    <Indicateur titre="Position moyenne dans les réponses" val={ind.position} fen={fen} unite="" extra={!fen.enCours && <p className="mt-3 text-xs text-tertiary">1 = citée en premier</p>} />
  </div>;
}

export function Paysage() {
  const classement = [...partVoix.global].sort((a, b) => b.v - a.v);
  return <Section titre="Paysage concurrentiel"><div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
    <div><h3 className="mb-3 text-xs text-tertiary">Présence dans le temps</h3><Courbe fenetres={serie.fenetres} lignes={serie.lignes} /></div>
    <div><h3 className="mb-3 text-xs text-tertiary">Classement, part de voix</h3><ol>{classement.map((c, i) => <li key={c.nom} className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-border py-2.5 text-sm last:border-0"><span className="num text-tertiary">{i + 1}</span><span className={c.nom === marque.nom ? "underline decoration-module-visibility underline-offset-4" : ""}>{c.nom}</span><span className="num">{c.v} %</span></li>)}</ol></div>
  </div></Section>;
}

export function VueEnsemble() {
  const { fenetreActive: fen } = useFiltres();
  return <><FiltresVisibility /><Indicateurs /><div className="mt-6 grid gap-6"><Paysage />
    <Section titre="Détail par assistant">{assistants.map((a) => <BarreValeur key={a.nom} label={a.nom} sous={a.version} val={presenceAssistant[fen.id][a.nom]} />)}</Section></div>
    <LigneEtat /><NoteMesure /></>;
}

export function VueVisibilite() {
  const f = useFiltres(); const fen = f.fenetreActive;
  return <><FiltresVisibility /><div className="grid gap-6"><Section titre="Présence de la marque dans le temps"><Courbe fenetres={serie.fenetres} lignes={serie.lignes.filter((l) => l.marque)} /></Section>
    <Section titre="Par assistant">{assistants.filter((a) => f.assistant === "Tous" || a.nom === f.assistant).map((a) => <BarreValeur key={a.nom} label={a.nom} sous={a.version} val={presenceAssistant[fen.id][a.nom]} />)}</Section>
    <Section titre="Par question">{questions.filter((q) => f.famille === "Toutes" || q.famille === f.famille).map((q) => { const v = presenceQuestion[q.id] ?? null; return <BarreValeur key={q.id} label={q.q} sous={q.famille} max={100} val={v === null ? null : { v, min: Math.max(0, v - 6), max: v + 6 }} />; })}</Section></div><NoteMesure /></>;
}

export function VuePartVoix() {
  const f = useFiltres(); const fen = f.fenetreActive;
  return <><FiltresVisibility /><div className="grid gap-6">
    <Section titre="La marque face à chaque concurrent">{[...partVoix.global].sort((a, b) => b.v - a.v).map((c) => <BarreValeur key={c.nom} label={c.nom} sous={c.nom === marque.nom ? "votre marque" : concurrents.find((x) => x.nom === c.nom)?.categorie} val={{ v: c.v, min: Math.max(0, c.v - 4), max: c.v + 4 }} />)}</Section>
    <Section titre="Par assistant">{assistants.map((a) => { const v = partVoix.parAssistant[a.nom]; return <BarreValeur key={a.nom} label={a.nom} sous={a.version} val={v === null ? null : { v, min: Math.max(0, v - 4), max: v + 4 }} />; })}</Section>
    <Section titre="Par question">{questions.filter((q) => f.famille === "Toutes" || q.famille === f.famille).map((q) => { const v = partVoix.parQuestion[q.id] ?? null; return <BarreValeur key={q.id} label={q.q} sous={q.famille} max={100} val={v === null ? null : { v, min: Math.max(0, v - 5), max: v + 5 }} />; })}</Section>
  </div>{fen.enCours && <p className="mt-4 text-xs text-tertiary">Les valeurs par question attendent la fin de la fenêtre.</p>}<NoteMesure /></>;
}

export function VueSentiment() {
  const f = useFiltres(); const s = indicateurs[f.fenetreActive.id].sentiment; const liste = useReponsesFiltrees().filter((r) => r.texte.includes(marque.nom));
  return <><FiltresVisibility /><div className="grid gap-6">
    <Section titre="Ton des réponses qui mentionnent la marque">{f.fenetreActive.enCours ? <p className="text-sm text-muted-foreground">Mesure en cours, jour {f.fenetreActive.jour} sur 5</p> : <dl className="grid gap-4 sm:grid-cols-3">{([["Positif", s.positif], ["Neutre", s.neutre], ["Négatif", s.negatif]] as const).map(([k, v], i) => <div key={k}><dt className="text-xs text-tertiary">{k}</dt><dd className="num mt-1 text-3xl">{v} %</dd><dd className="num text-xs text-tertiary">Intervalle {Math.max(0, v - 6)} à {v + 6} %</dd><dd className="mt-3"><BarreColoree label={k} largeur={v} detail={`${v} %, intervalle ${Math.max(0, v - 6)} à ${v + 6} %`} couleur={couleursGraphique[i + 1]} /></dd></div>)}</dl>}</Section>
    <Section titre="Par assistant">{assistants.map((a) => { const r = reponses.filter((x) => x.assistant === a.nom && x.texte.includes(marque.nom)); return <div key={a.nom} className="flex justify-between gap-3 border-b border-border py-2.5 text-sm last:border-0"><span>{a.nom}</span><span className="text-muted-foreground">{r.length === 0 ? "non mesurable" : ["positif", "neutre", "negatif"].map((t) => `${r.filter((x) => x.sentiment === t).length} ${t === "negatif" ? "négatif" : t}`).join(" · ")}</span></div>; })}</Section>
    <Section titre="Extraits concernés">{liste.length === 0 ? <Vide /> : <ul>{liste.map((r) => <li key={r.id} className="border-b border-border py-3 text-sm last:border-0"><p className="text-xs text-tertiary">{r.assistant} · {r.sentiment === "negatif" ? "négatif" : r.sentiment}</p><p className="mt-1 leading-relaxed"><Surligne texte={r.texte} marque={marque.nom} concurrents={nomsConcurrents} /></p></li>)}</ul>}</Section>
  </div><NoteMesure /></>;
}

export function VueReponses() {
  const liste = useReponsesFiltrees();
  return <><FiltresVisibility /><Section titre="Réponses collectées" aside={<span className="num text-sm text-tertiary">{liste.length}</span>}>{liste.length === 0 ? <Vide /> : <ul>{liste.map((r) => { const a = assistants.find((x) => x.nom === r.assistant); return <li key={r.id} className="border-b border-border last:border-0"><details className="group py-3"><summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 text-sm"><span>{libQuestion(r.question)}</span><span className="text-xs text-tertiary">{r.assistant} · {r.date}</span></summary>
    <div className="mt-3 space-y-3 text-sm"><p className="leading-relaxed"><Surligne texte={r.texte} marque={marque.nom} concurrents={nomsConcurrents} /></p>
      <p className="text-xs text-tertiary">Sources citées : {r.sources.length ? r.sources.join(", ") : "aucune"}</p>
      <p className="text-xs text-tertiary">{r.date} · {r.assistant} · {a?.version} · preuve conservée</p></div></details></li>; })}</ul>}</Section><NoteMesure /></>;
}

export function VueRecherches() {
  const liste = useReponsesFiltrees(); const compte = new Map<string, { n: number; q: string }>();
  for (const r of reponses) for (const s of r.recherches) compte.set(s, { n: (compte.get(s)?.n ?? 0) + 1, q: r.question });
  const parQuestion = questions.map((q) => ({ q, r: liste.filter((x) => x.question === q.id) })).filter((x) => x.r.length);
  return <><FiltresVisibility /><div className="grid gap-6">
    <Section titre="Recherches les plus fréquentes"><ol>{[...compte.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([s, v], i) => <li key={s} className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-border py-2.5 text-sm last:border-0"><span className="num text-tertiary">{i + 1}</span><span>« {s} »</span><a href={`#question-${v.q}`} className="text-xs text-tertiary underline underline-offset-4">Question d'origine</a></li>)}</ol></Section>
    <Section titre="Par question">{parQuestion.length === 0 ? <Vide /> : parQuestion.map(({ q, r }) => <div key={q.id} id={`question-${q.id}`} className="border-b border-border py-3 text-sm last:border-0"><p>{q.q}</p>{r.map((x) => <div key={x.id} className="mt-2 text-xs text-muted-foreground"><span className="text-tertiary">{x.assistant} :</span> {x.recherches.length ? x.recherches.map((s) => `« ${s} »`).join(", ") : "aucune recherche web (recherche désactivée)"}{x.pages.length > 0 && <span className="block text-tertiary">Pages consultées : {x.pages.join(", ")}</span>}</div>)}</div>)}</Section>
  </div><NoteMesure /></>;
}

export function VueCitations() {
  const max = Math.max(...citations.map((c) => c.n));
  return <><FiltresVisibility /><Section titre="Sources citées, par fréquence"><table className="num w-full text-sm"><tbody>{[...citations].sort((a, b) => b.n - a.n).map((c) => <tr key={c.source} className="border-b border-border last:border-0"><td className="break-all py-2.5 pr-3">{c.source}{c.aVous && <span className="ml-2 text-xs text-tertiary">à vous</span>}</td><td className="hidden pr-3 text-xs text-tertiary sm:table-cell">{c.type}</td><td className="w-1/3"><BarreColoree label={c.source} largeur={(c.n / max) * 100} detail={`${c.n} citations · ${c.type}${c.aVous ? " · à vous" : ""}`} /></td><td className="w-12 text-right">{c.n}</td></tr>)}</tbody></table></Section><NoteMesure /></>;
}

export function VueOpportunites() {
  return <><Section titre="Sujets où la marque est absente"><ul>{opportunites.map((o) => <li key={o.sujet} className="grid gap-1 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[1fr_1.4fr] sm:gap-6"><div><p>{o.sujet}</p><p className="text-xs text-tertiary">Source : {o.source} · cités : {o.concurrents.join(", ")}</p></div><p className="text-muted-foreground">Piste : {o.piste}</p></li>)}</ul></Section><NoteMesure /></>;
}

export function VueReseaux() {
  return <><div className="grid gap-6 lg:grid-cols-3">{reseaux.map((r) => <Section key={r.reseau} titre={r.reseau} aside={<span className="text-xs text-tertiary">{r.handle}</span>}><p className="num text-3xl">{r.citations}</p><p className="mb-4 text-xs text-tertiary">citations par les assistants</p>{r.controles.map((c) => <div key={c.nom} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"><span>{c.nom}</span><span className="text-right"><Statut etat={c.etat} label={c.detail} /></span></div>)}</Section>)}</div><NoteMesure /></>;
}

const ordre = { bloquant: 0, verifier: 1, conforme: 2 };
export function VueRecommandations() {
  const [valides, setValides] = useState<string[]>([]); const [prepare, setPrepare] = useState(false);
  return <><div className="mb-6"><Button className="min-h-11" onClick={() => setPrepare(true)}>Préparer les corrections</Button><p className="mt-2 text-xs text-tertiary">Rien n'est publié sans votre validation.</p>{prepare && <p role="status" className="mt-2 text-xs text-muted-foreground">{valides.length} correction{valides.length > 1 ? "s" : ""} préparée{valides.length > 1 ? "s" : ""}, simulation en attente de publication validée.</p>}</div>
    <Section titre="Recommandations de SEO Command" aside={<span className="text-sm text-tertiary">Classées par gravité</span>}><ol>{[...vueSite.recommandations].sort((a, b) => ordre[a.etat] - ordre[b.etat]).map((r) => <li key={r.titre} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[1fr_10rem_8rem_auto]"><span>{r.titre}</span><span className="text-tertiary">{r.effet}</span><Statut etat={r.etat} /><label className="flex min-h-11 items-center gap-2 text-muted-foreground"><Checkbox checked={valides.includes(r.titre)} onCheckedChange={() => setValides((v) => v.includes(r.titre) ? v.filter((x) => x !== r.titre) : [...v, r.titre])} />valider</label></li>)}</ol></Section></>;
}

export function VueRapports() {
  return <><div className="grid gap-6"><Section titre="Rapports de fenêtre"><ul>{rapports.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm last:border-0"><span>{r.titre} · <span className="text-muted-foreground">{r.fenetre}</span></span><span className="text-tertiary">{r.statut}</span></li>)}</ul></Section>
    <Section titre="Avant et après, questions communes" aside={<span className="text-xs text-tertiary">J0 puis remesure 1</span>}><table className="num w-full text-sm"><thead className="text-left text-tertiary"><tr className="border-b border-border"><th className="py-2 font-normal">Question</th><th className="font-normal">Avant</th><th className="font-normal">Après</th><th className="font-normal">Écart</th></tr></thead><tbody>{comparaison.map((c) => <tr key={c.question} className="border-b border-border last:border-0"><td className="py-2.5 pr-3">{libQuestion(c.question)}</td><td>{pct(c.avant)}</td><td>{pct(c.apres)}</td><td className="text-muted-foreground">{c.avant === null || c.apres === null ? "non mesurable" : `${c.apres - c.avant > 0 ? "+" : ""}${c.apres - c.avant} pt`}</td></tr>)}</tbody></table><p className="mt-3 text-xs text-tertiary">Un écart n'est significatif que si les intervalles des deux fenêtres ne se recouvrent pas.</p></Section></div><NoteMesure /></>;
}

export function VueSeo() { return <SeoResume />; }

export function VueReglages() {
  const t = "min-h-12 rounded-none border-b-2 border-transparent px-2 font-normal text-muted-foreground data-[state=active]:border-module-visibility data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none";
  const ligne = "flex flex-wrap justify-between gap-2 border-b border-border py-2.5 text-sm last:border-0";
  return <Tabs defaultValue="marque"><TabsList aria-label="Réglages Visibility" className="mb-6 h-auto justify-start gap-2 rounded-none border-b border-border bg-transparent p-0">{([["marque", "Marque"], ["concurrents", "Concurrents"], ["questions", "Questions"], ["moteurs", "Moteurs"]] as const).map(([v, l]) => <TabsTrigger key={v} value={v} className={t}>{l}</TabsTrigger>)}</TabsList>
    <TabsContent value="marque"><Section titre="Marque"><div className={ligne}><span className="text-tertiary">Nom</span><span>{marque.nom}</span></div><div className={ligne}><span className="text-tertiary">Sites</span><span>{marque.sites.join(", ")}</span></div><div className={ligne}><span className="text-tertiary">Alias</span><span>{marque.alias.join(", ")}</span></div>{marque.profils.map((p) => <div key={p.reseau} className={ligne}><span className="text-tertiary">{p.reseau}</span><span>{p.handle}</span></div>)}</Section></TabsContent>
    <TabsContent value="concurrents"><Section titre="Concurrents">{concurrents.map((c) => <div key={c.nom} className={ligne}><span>{c.nom}</span><span className="text-muted-foreground">{c.categorie}</span></div>)}</Section></TabsContent>
    <TabsContent value="questions"><div className="grid gap-6"><Section titre="Panel par famille">{[...new Set(questions.filter((q) => !q.marque).map((q) => q.famille))].map((fam) => <div key={fam} className="mb-4"><h3 className="mb-1 text-xs text-tertiary">{fam}</h3>{questions.filter((q) => q.famille === fam && !q.marque).map((q) => <div key={q.id} className={ligne}><span>{q.q}</span><span className="text-xs uppercase text-tertiary">{q.langue}</span></div>)}</div>)}</Section>
      <Section titre="Questions marquées « votre marque »">{questions.filter((q) => q.marque).map((q) => <div key={q.id} className={ligne}><span>{q.q}</span><span className="text-xs uppercase text-tertiary">{q.langue}</span></div>)}</Section></div></TabsContent>
    <TabsContent value="moteurs"><Section titre="Moteurs mesurés" aside={<span className="text-xs text-tertiary">Lecture seule</span>}><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-sm"><thead className="text-left text-tertiary"><tr className="border-b border-border">{["Assistant", "Modèle", "Version", "Recherche web", "Dernière collecte"].map((h) => <th key={h} className="py-2 pr-3 font-normal">{h}</th>)}</tr></thead><tbody>{assistants.map((a) => <tr key={a.nom} className="border-b border-border last:border-0"><td className="py-2.5 pr-3">{a.nom}</td><td className="pr-3 text-muted-foreground">{a.modele}</td><td className="num pr-3 text-muted-foreground">{a.version}</td><td className="pr-3">{a.recherche ? "Activée" : "Désactivée"}</td><td className="num text-muted-foreground">{a.derniere}</td></tr>)}</tbody></table></div></Section></TabsContent>
  </Tabs>;
}

export const vuesVisibility = {
  visibilite: VueVisibilite, "part-de-voix": VuePartVoix, sentiment: VueSentiment, reponses: VueReponses, recherches: VueRecherches,
  citations: VueCitations, opportunites: VueOpportunites, reseaux: VueReseaux, recommandations: VueRecommandations,
  rapports: VueRapports, "seo-command": VueSeo, reglages: VueReglages,
} as const;
