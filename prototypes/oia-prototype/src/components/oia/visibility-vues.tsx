import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Section, Statut } from "@/components/oia/ui";
import { SeoResume } from "@/components/oia/visibility";
import { Chiffre, Courbe, FiltresVisibility, Indicateur, NoteMesure, Surligne, useFiltres } from "@/components/oia/mesure";
import { useDonnees } from "@/lib/donnees-visibility";
import { useVisibilityDonnees } from "@/lib/donnees/provider";
import { BarreColoree, couleursGraphique } from "@/components/oia/graphiques";
import type { IdFenetre, NomAssistant, Valeur } from "@/lib/donnees/visibility";
import { VueReglages } from "@/components/oia/visibility-reglages";
export { VueReglages };
import { LogoAssistant, LogoMarque } from "@/components/oia/visibility-identites";
import { FaviconSource, LogoReseau } from "@/components/oia/identites";
import { ActiviteMoteur, ErreurGeste } from "@/components/oia/visibility-pilotage";
import { useGesteVisibility } from "@/lib/donnees/visibility-pilotage-provider";
import { Input } from "@/components/ui/input";

function useQuestions() {
  const { questions } = useVisibilityDonnees();
  return { libQuestion: (id: string) => questions.find((q) => q.id === id)?.q ?? id, famQuestion: (id: string) => questions.find((q) => q.id === id)?.famille ?? "" };
}
const pct = (v: number | null) => (v === null ? "Non mesurable" : `${v} %`);
const absent = (raison = "Valeur absente de la source."): Valeur => ({ v: null, min: null, max: null, raison });
function useBaisseSignificative() {
  const { fenetres, indicateurs, significatif } = useVisibilityDonnees();
  return (cle: "presence" | "partVoix" | "exactitude", id: IdFenetre) => {
    const i = fenetres.findIndex((f) => f.id === id); const p = fenetres[i + 1];
    const courant = indicateurs[id]; const precedent = p ? indicateurs[p.id] : undefined;
    if (!p || !courant || !precedent || fenetres.find((f) => f.id === id)?.enCours) return false;
    const cur = courant[cle]; const avant = precedent[cle];
    return significatif(cur, avant) && (cur.v ?? 0) < (avant.v ?? 0);
  };
}

function useReponsesFiltrees() {
  const { reponses } = useVisibilityDonnees();
  const { famQuestion } = useQuestions();
  const f = useFiltres();
  return reponses.filter((r) => (f.assistant === "Tous" || r.assistant === f.assistant) && (f.famille === "Toutes" || famQuestion(r.question) === f.famille) && r.fenetre === f.fenetreActive.id);
}
function Vide() { return <p className="text-sm text-muted-foreground">Aucune réponse collectée pour ces filtres.</p>; }

function BarreValeur({ label, sous, val, max = 50 }: { label: string; sous?: string | undefined; val: Valeur | null; max?: number }) {
  const { fenetreActive: fen } = useFiltres();
  const { assistants, concurrents, marque } = useVisibilityDonnees();
  const estAssistant = assistants.some((a) => a.nom === label);
  const estMarque = label === marque.nom || concurrents.some((c) => c.nom === label);
  const ok = val && val.v !== null && !fen.enCours;
  return <div className="grid grid-cols-[minmax(7rem,12rem)_1fr_auto] items-center gap-4 border-b border-border py-3 text-sm last:border-0">
    <span className="flex min-w-0 items-center gap-2.5">{estAssistant && <LogoAssistant nom={label} petite />}{estMarque && <LogoMarque nom={label} />}<span className="min-w-0"><span className="block truncate">{label}</span>{sous && <span className="block truncate text-xs text-tertiary">{sous}</span>}</span></span>
    <span>{ok && val.v !== null ? <BarreColoree label={label} largeur={(val.v / max) * 100} detail={`${val.v} %${val.min !== null && val.max !== null ? `, intervalle ${val.min} à ${val.max} %` : ""}`} /> : <span className="block h-4 rounded-sm bg-track" />}</span>
    <span className="min-w-[8rem] text-right">{val ? <Chiffre val={val} fen={fen} /> : <span className="text-muted-foreground">non mesurable</span>}</span>
  </div>;
}

function LigneEtat() {
  const donnees = useVisibilityDonnees();
  const { fenetreActive } = useFiltres();
  const etatCollecte = donnees.etatCollecteParFenetre?.[fenetreActive.id] ?? donnees.etatCollecte;
  return <dl className="mt-6 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
    <div><dt className="text-xs text-tertiary">Questions suivies</dt><dd className="num mt-1">{etatCollecte.questions}</dd></div>
    <div><dt className="text-xs text-tertiary">Réponses collectées</dt><dd className="num mt-1">{etatCollecte.reponses}</dd></div>
    <div><dt className="text-xs text-tertiary">Fréquence</dt><dd className="mt-1">{etatCollecte.frequence}</dd></div>
    <div><dt className="text-xs text-tertiary">Dernière mise à jour</dt><dd className="num mt-1">{etatCollecte.derniere}</dd></div>
  </dl>;
}

export function Indicateurs() {
  const baisseSignificative = useBaisseSignificative();
  const { indicateurs, presenceAssistant } = useVisibilityDonnees();
  const f = useFiltres(); const fen = f.fenetreActive;
  const ind = indicateurs[fen.id] ?? { presence: absent(), partVoix: absent(), exactitude: absent(), position: absent(), sentiment: { positif: null, neutre: null, negatif: null, raison: "Sentiment absent de la source." } };
  const presence = (f.assistant === "Tous" ? ind.presence : presenceAssistant[fen.id]?.[f.assistant as NomAssistant]) ?? absent();
  const s = ind.sentiment;
  return <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
    <Indicateur titre="Présence dans les réponses des IA" val={presence} fen={fen} ton="presence" alerte={baisseSignificative("presence", fen.id)} extra={!fen.enCours && (s.positif !== null && s.neutre !== null && s.negatif !== null ? <p className="num mt-3 text-xs text-tertiary">Sentiment : {s.positif} % positif · {s.neutre} % neutre · {s.negatif} % négatif{s.source ? <span className="block">{s.source}</span> : null}</p> : <p className="mt-3 text-xs text-tertiary">Sentiment non mesurable : {s.raison ?? "donnée absente"}{s.source ? <span className="block">{s.source}</span> : null}</p>)} />
    <Indicateur titre="Part de voix face aux concurrents" val={ind.partVoix} fen={fen} ton="part-voix" alerte={baisseSignificative("partVoix", fen.id)} />
    <Indicateur titre="Exactitude des faits cités" val={ind.exactitude} fen={fen} ton="exactitude" alerte={baisseSignificative("exactitude", fen.id)} />
    <Indicateur titre="Position moyenne dans les réponses" val={ind.position} fen={fen} ton="position" unite="" extra={!fen.enCours && <p className="mt-3 text-xs text-tertiary">1 = citée en premier{ind.position.raison?.includes("Jev") ? <span className="block">extrait (Jev 1.13)</span> : null}</p>} />
  </div>;
}

export function Paysage() {
  const donnees = useVisibilityDonnees();
  const { serie, marque } = donnees;
  const { fenetreActive } = useFiltres();
  const partVoix = donnees.partVoixParFenetre?.[fenetreActive.id] ?? donnees.partVoix;
  const classement = [...partVoix.global].sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
  return <Section titre="Paysage concurrentiel"><div className="grid gap-8 lg:grid-cols-[1.5fr_1fr]">
    <div><h3 className="mb-3 text-xs text-tertiary">Présence dans le temps</h3><Courbe fenetres={serie.fenetres} lignes={serie.lignes} /></div>
    <div><h3 className="mb-3 text-xs text-tertiary">Classement, part de voix</h3><ol>{classement.map((c, i) => { const indexSerie = serie.lignes.findIndex((l) => l.nom === c.nom); const couleur = couleursGraphique[Math.max(0, indexSerie) % couleursGraphique.length]; return <li key={c.nom} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 border-b border-border py-2.5 text-sm last:border-0"><span className="num text-tertiary">{i + 1}</span><span className="flex min-w-0 items-center gap-2.5"><LogoMarque nom={c.nom} couleur={couleur} /><span className={`truncate ${c.nom === marque.nom ? "underline decoration-module-visibility underline-offset-4" : ""}`}>{c.nom}</span></span><span className="num">{c.v === null ? "Non mesurable" : `${c.v} %`}</span></li>; })}</ol></div>
  </div></Section>;
}

export function VueEnsemble() {
  const { assistants, presenceAssistant } = useVisibilityDonnees();
  const { fenetreActive: fen } = useFiltres();
  return <><FiltresVisibility /><Indicateurs /><div className="mt-6 grid gap-6"><Paysage />
    <Section titre="Détail par assistant">{assistants.map((a) => <BarreValeur key={a.nom} label={a.nom} sous={a.version} val={presenceAssistant[fen.id]?.[a.nom] ?? absent()} />)}</Section></div>
    <LigneEtat /><NoteMesure /></>;
}

export function VueVisibilite() {
  const donnees = useVisibilityDonnees();
  const { serie, assistants, presenceAssistant, questions, presenceQuestion } = donnees;
  const f = useFiltres(); const fen = f.fenetreActive;
  const presenceReelle = donnees.presenceQuestionsParFenetre?.[fen.id]?.[f.assistant];
  return <><FiltresVisibility /><div className="grid gap-6"><Section titre="Présence de la marque dans le temps"><Courbe fenetres={serie.fenetres} lignes={serie.lignes.filter((l) => l.marque)} /></Section>
    <Section titre="Par assistant">{assistants.filter((a) => f.assistant === "Tous" || a.nom === f.assistant).map((a) => <BarreValeur key={a.nom} label={a.nom} sous={a.version} val={presenceAssistant[fen.id]?.[a.nom] ?? absent()} />)}</Section>
    <Section titre="Par question">{questions.filter((q) => f.famille === "Toutes" || q.famille === f.famille).map((q) => { const valeurReelle = presenceReelle?.[q.id]; const v = presenceQuestion[q.id] ?? null; return <BarreValeur key={q.id} label={q.q} sous={q.famille} max={100} val={valeurReelle ?? (v === null ? null : { v, min: Math.max(0, v - 6), max: v + 6 })} />; })}</Section></div><NoteMesure /></>;
}

export function VuePartVoix() {
  const donnees = useVisibilityDonnees();
  const { marque, concurrents, assistants, questions } = donnees;
  const f = useFiltres(); const fen = f.fenetreActive;
  const partVoix = donnees.partVoixParFenetre?.[fen.id] ?? donnees.partVoix;
  return <><FiltresVisibility /><div className="grid gap-6">
    <Section titre="La marque face à chaque concurrent">{[...partVoix.global].sort((a, b) => (b.v ?? -1) - (a.v ?? -1)).map((c) => <BarreValeur key={c.nom} label={c.nom} sous={c.nom === marque.nom ? "votre marque" : concurrents.find((x) => x.nom === c.nom)?.categorie} val={{ v: c.v, min: c.min ?? (c.v === null ? null : Math.max(0, c.v - 4)), max: c.max ?? (c.v === null ? null : c.v + 4), ...(c.raison ? { raison: c.raison } : {}) }} />)}</Section>
    <Section titre="Par assistant">{assistants.map((a) => { const v = partVoix.parAssistant[a.nom] ?? null; return <BarreValeur key={a.nom} label={a.nom} sous={a.version} val={v === null ? absent("Part de voix absente pour cet assistant.") : { v, min: Math.max(0, v - 4), max: v + 4 }} />; })}</Section>
    <Section titre="Par question">{questions.filter((q) => f.famille === "Toutes" || q.famille === f.famille).map((q) => { const v = partVoix.parQuestion[q.id] ?? null; return <BarreValeur key={q.id} label={q.q} sous={q.famille} max={100} val={v === null ? { v: null, min: null, max: null, raison: "La part de voix par question n'est pas fournie par le contrat v1." } : { v, min: Math.max(0, v - 5), max: v + 5 }} />; })}</Section>
  </div>{fen.enCours && <p className="mt-4 text-xs text-tertiary">Les valeurs par question attendent la fin de la fenêtre.</p>}<NoteMesure /></>;
}

export function VueSentiment() {
  const donnees = useVisibilityDonnees();
  const nomsConcurrents = donnees.concurrents.map((c) => c.nom);
  const { indicateurs, marque, assistants, reel } = donnees;
  const f = useFiltres(); const s = indicateurs[f.fenetreActive.id]?.sentiment ?? { positif: null, neutre: null, negatif: null, raison: "Sentiment absent de la source." };
  const liste = useReponsesFiltrees().filter((r) => reel ? r.marqueCitee === true || (r.marqueCitee === undefined && r.texte.includes(marque.nom)) : r.texte.includes(marque.nom));
  const mesurable = s.positif !== null && s.neutre !== null && s.negatif !== null;
  return <><FiltresVisibility /><div className="grid gap-6">
    <Section titre="Ton des réponses qui mentionnent la marque" aside={s.source ? <span className="text-xs text-tertiary">{s.source}</span> : undefined}>{f.fenetreActive.enCours ? <p className="text-sm text-muted-foreground">Mesure en cours, jour {f.fenetreActive.jour} sur {f.fenetreActive.joursPrevus ?? 5}</p> : !mesurable ? <p className="text-sm text-muted-foreground">Non mesurable : {s.raison ?? "sentiment absent de la source."}</p> : <dl className="grid gap-4 sm:grid-cols-3">{([["Positif", s.positif, s.positifN], ["Neutre", s.neutre, s.neutreN], ["Négatif", s.negatif, s.negatifN]] as const).map(([k, v, n], i) => <div key={k}><dt className="text-xs text-tertiary">{k}</dt><dd className="num mt-1 text-3xl">{v} %</dd><dd className="num text-xs text-tertiary">{reel && n !== undefined ? `${n} sur ${s.effectif ?? 0}` : `Intervalle ${Math.max(0, v! - 6)} à ${v! + 6} %`}</dd><dd className="mt-3"><BarreColoree label={k} largeur={v!} detail={`${v} %${reel && n !== undefined ? `, ${n} sur ${s.effectif ?? 0}` : ""}`} couleur={couleursGraphique[i + 1]} /></dd></div>)}</dl>}</Section>
    <Section titre="Par assistant">{assistants.map((a) => { const sa = donnees.sentimentAssistants?.[f.fenetreActive.id]?.[a.nom]; return <div key={a.nom} className="flex justify-between gap-3 border-b border-border py-2.5 text-sm last:border-0"><span className="flex items-center gap-2.5"><LogoAssistant nom={a.nom} petite />{a.nom}</span><span className="text-right text-muted-foreground">{sa ? sa.positif === null ? `Non mesurable : ${sa.raison}` : `${sa.positifN ?? 0} positives sur ${sa.effectif ?? 0} · ${sa.neutreN ?? 0} neutres · ${sa.negatifN ?? 0} négatives` : "Non mesurable, aucun jugement fourni"}</span></div>; })}</Section>
    <Section titre="Extraits concernés" aside={reel ? <span className="text-xs text-tertiary">extrait (Jev 1.13)</span> : undefined}>{liste.length === 0 ? <Vide /> : <ul>{liste.map((r) => <li key={r.id} className="border-b border-border py-3 text-sm last:border-0"><p className="flex items-center gap-2 text-xs text-tertiary"><LogoAssistant nom={r.assistant} petite />{r.assistant} · {r.sentiment === null ? `sentiment non mesurable${r.raisonNonMesurable ? ` : ${r.raisonNonMesurable}` : ""}` : r.sentiment === "negatif" ? "négatif" : r.sentiment}{r.position ? ` · position ${r.position}` : ""}</p><p className="mt-1 leading-relaxed"><Surligne texte={r.passage || r.texte} marque={marque.nom} concurrents={nomsConcurrents} /></p></li>)}</ul>}</Section>
  </div><NoteMesure /></>;
}

export function VueReponses() {
  const { libQuestion } = useQuestions();
  const nomsConcurrents = useVisibilityDonnees().concurrents.map((c) => c.nom);
  const { assistants, marque, concurrents } = useVisibilityDonnees();
  const liste = useReponsesFiltrees();
  return <><FiltresVisibility /><Section titre="Réponses collectées" aside={<span className="num text-sm text-tertiary">{liste.length}</span>}>{liste.length === 0 ? <Vide /> : <ul>{liste.map((r) => { const a = assistants.find((x) => x.nom === r.assistant); return <li key={r.id} className="border-b border-border last:border-0"><details className="group py-3"><summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-baseline justify-between gap-2 text-sm"><span>{libQuestion(r.question)}</span><span className="inline-flex items-center gap-2 text-xs text-tertiary"><LogoAssistant nom={r.assistant} petite />{r.assistant} · {r.date}</span></summary>
    <div className="mt-3 space-y-3 text-sm"><p className="leading-relaxed"><Surligne texte={r.texte} marque={marque.nom} concurrents={nomsConcurrents} /></p>
      <div className="flex flex-wrap items-center gap-2 text-xs text-tertiary"><span>Sources citées :</span>{r.sources === null ? `${r.nbCitations ?? 0} citations, adresses non fournies par l'assistant` : r.sources.length ? r.sources.map((s) => <a key={s} href={s} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 underline underline-offset-4"><FaviconSource source={s} petite />{s}</a>) : "aucune citation"}</div>
      <p className="text-xs text-tertiary">{r.date} · {r.assistant} · {r.versionModele ?? a?.version} · {r.empreinte ? `preuve ${r.empreinte.slice(0, 12)}…` : "preuve conservée"}</p></div></details></li>; })}</ul>}</Section><NoteMesure /></>;
}

export function VueRecherches() {
  const { reponses, questions } = useVisibilityDonnees();
  const liste = useReponsesFiltrees(); const compte = new Map<string, { n: number; q: string }>();
  for (const r of reponses) for (const s of r.recherches ?? []) compte.set(s, { n: (compte.get(s)?.n ?? 0) + 1, q: r.question });
  const parQuestion = questions.map((q) => ({ q, r: liste.filter((x) => x.question === q.id) })).filter((x) => x.r.length);
  return <><FiltresVisibility /><div className="grid gap-6">
    <Section titre="Recherches les plus fréquentes">{compte.size === 0 ? <p className="text-sm text-muted-foreground">Non mesurable : les termes de recherche ne sont pas fournis par les assistants pour ces réponses.</p> : <ol>{[...compte.entries()].sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([s, v], i) => <li key={s} className="grid grid-cols-[2rem_1fr_auto] gap-3 border-b border-border py-2.5 text-sm last:border-0"><span className="num text-tertiary">{i + 1}</span><span>« {s} »</span><a href={`#question-${v.q}`} className="text-xs text-tertiary underline underline-offset-4">Question d'origine</a></li>)}</ol>}</Section>
    <Section titre="Par question">{parQuestion.length === 0 ? <Vide /> : parQuestion.map(({ q, r }) => <div key={q.id} id={`question-${q.id}`} className="border-b border-border py-3 text-sm last:border-0"><p>{q.q}</p>{r.map((x) => <div key={x.id} className="mt-2 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1.5 text-tertiary"><LogoAssistant nom={x.assistant} petite />{x.assistant} :</span> {x.recherches === null ? "Non fourni par l'assistant" : x.recherches.length ? x.recherches.map((s) => `« ${s} »`).join(", ") : "Aucune recherche web"}{(x.pages?.length ?? 0) > 0 && <span className="mt-2 flex flex-wrap items-center gap-2 text-tertiary"><span>Pages consultées :</span>{x.pages!.map((page) => <span key={page} className="inline-flex items-center gap-1.5"><FaviconSource source={page} petite />{page}</span>)}</span>}</div>)}</div>)}</Section>
  </div><NoteMesure /></>;
}

export function VueCitations() {
  const donnees = useVisibilityDonnees();
  const f = useFiltres();
  const citations = donnees.citationsParFenetre?.[f.fenetreActive.id]?.[f.assistant] ?? donnees.citations;
  const max = Math.max(1, ...citations.map((c) => c.n));
  return <><FiltresVisibility /><Section titre="Sources citées, par fréquence">{citations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune citation pour ces filtres.</p> : <table className="num w-full text-sm"><tbody>{[...citations].sort((a, b) => b.n - a.n).map((c) => <tr key={c.source} className="border-b border-border last:border-0"><td className="break-all py-2.5 pr-3"><span className="flex items-center gap-2.5"><FaviconSource source={c.source} petite /><span>{c.source}{c.aVous && <span className="ml-2 text-xs text-tertiary">à vous</span>}</span></span></td><td className="hidden pr-3 text-xs text-tertiary sm:table-cell">{c.type}</td><td className="w-1/3"><BarreColoree label={c.source} largeur={(c.n / max) * 100} detail={`${c.n} citations · ${c.type}${c.aVous ? " · à vous" : ""}`} /></td><td className="w-12 text-right">{c.n}</td></tr>)}</tbody></table>}</Section><NoteMesure /></>;
}

export function VueOpportunites() {
  const { opportunites } = useVisibilityDonnees();
  return <><Section titre="Sujets où la marque est absente">{opportunites.length === 0 ? <p className="text-sm text-muted-foreground">Non mesurable : les opportunités de contenu ne sont pas fournies par le contrat v1.</p> : <ul>{opportunites.map((o) => <li key={o.sujet} className="grid gap-1 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[1fr_1.4fr] sm:gap-6"><div><p>{o.sujet}</p><p className="flex flex-wrap items-center gap-1.5 text-xs text-tertiary">Source : <FaviconSource source={o.source} petite />{o.source} · cités : {o.concurrents.join(", ")}</p></div><p className="text-muted-foreground">Piste : {o.piste}</p></li>)}</ul>}</Section><NoteMesure /></>;
}

export function VueReseaux() {
  const donnees = useVisibilityDonnees();
  const f = useFiltres();
  const reseaux = donnees.reseauxParFenetre?.[f.fenetreActive.id]?.[f.assistant] ?? donnees.reseaux;
  return <><FiltresVisibility />{reseaux.length === 0 ? <Section titre="Réseaux sociaux"><p className="text-sm text-muted-foreground">Aucun réseau social cité pour ces filtres.</p></Section> : <div className="grid gap-6 lg:grid-cols-3">{reseaux.map((r) => <Section key={`${r.reseau}-${r.handle}`} titre={<span className="flex items-center gap-2.5"><LogoReseau nom={r.reseau} />{r.reseau}</span>} aside={<span className="max-w-48 truncate text-xs text-tertiary">{r.handle}</span>}><p className="num text-3xl">{r.citations}</p><p className="mb-4 text-xs text-tertiary">citations par les assistants{r.part !== null && r.part !== undefined ? ` · ${r.part} % des citations` : ""}</p>{r.controles.length === 0 ? <p className="text-xs text-tertiary">Contrôles de profil non fournis par le contrat v1.</p> : r.controles.map((c) => <div key={c.nom} className="flex items-center justify-between gap-3 border-b border-border py-2 text-sm last:border-0"><span>{c.nom}</span><span className="text-right"><Statut etat={c.etat} label={c.detail} /></span></div>)}</Section>)}</div>}<NoteMesure /></>;
}

const ordre = { bloquant: 0, verifier: 1, conforme: 2 };
function ExecutionRecommandation({ id }: { id: string }) {
  const geste = useGesteVisibility();
  const [ouvert, setOuvert] = useState(false);
  if (!ouvert) return <Button variant="outline" className="min-h-11" onClick={() => setOuvert(true)}>Marquer comme fait</Button>;
  return <form className="mt-4 grid gap-3 rounded-md border border-border p-4" onSubmit={async (e) => { e.preventDefault(); const f = new FormData(e.currentTarget); try { await geste.executer("vis_declarer_execution", { p_recommandation: id, p_preuve: String(f.get("preuve") ?? ""), p_date: String(f.get("date") ?? ""), p_note: String(f.get("note") ?? "") }); setOuvert(false); } catch { /* erreur RPC affichée */ } }}>
    <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs text-tertiary">Preuve, adresse https ou empreinte de commit<Input name="preuve" className="min-h-11" required /></label><label className="grid gap-1.5 text-xs text-tertiary">Date d'exécution<Input name="date" className="min-h-11" type="date" max={new Date().toISOString().slice(0, 10)} defaultValue={new Date().toISOString().slice(0, 10)} required /></label></div>
    <label className="grid gap-1.5 text-xs text-tertiary">Note facultative<Input name="note" className="min-h-11" /></label><div className="flex gap-2"><Button type="submit" className="min-h-11" disabled={geste.enCours}>Déclarer l'exécution</Button><Button type="button" variant="ghost" className="min-h-11" onClick={() => setOuvert(false)}>Annuler</Button></div><ErreurGeste erreur={geste.erreur} />
  </form>;
}
export function VueRecommandations() {
  const donnees = useDonnees();
  const geste = useGesteVisibility();
  const [valides, setValides] = useState<string[]>([]); const [prepare, setPrepare] = useState(false);
  if (donnees.reel) {
    const recommandations = [...(donnees.recommandationsV2 ?? [])].sort((a, b) => (a.priorite ?? 0) - (b.priorite ?? 0));
    return <Section titre="Recommandations" aside={<span className="text-sm text-tertiary">Contrat v2</span>}>{recommandations.length === 0 ? <p className="text-sm text-muted-foreground">Aucune recommandation pour ce sujet.</p> : <ol>{recommandations.map((r) => <li key={r.id} className="border-b border-border py-4 text-sm last:border-0"><div className="grid gap-3 lg:grid-cols-[1fr_auto]"><div><h3>{r.titre}</h3><p className="mt-1 text-muted-foreground">{r.enonce}</p><p className="mt-2 text-xs text-tertiary">Impact {r.impact} · effort {r.effort} · risque {r.risque} · confiance {r.confiance}</p><p className="mt-1 text-xs text-tertiary">{r.execute_le ? `Exécutée le ${r.execute_le} · preuve ${r.reference_execution}` : "Aucune exécution déclarée"}</p><p className="mt-1 text-xs text-tertiary">Remesure : {r.mesuree_par_fenetre ?? "non planifiée"}</p></div><div className="flex flex-wrap items-start gap-2"><Statut etat={r.etat === "rejected" ? "bloquant" : r.etat === "pending" ? "verifier" : "conforme"} label={r.etat ?? "Inconnu"} />{r.etat === "pending" && <><Button variant="outline" className="min-h-11" disabled={geste.enCours} onClick={async () => { try { await geste.executer("vis_valider_recommandation", { p_recommandation: r.id! }); } catch { /* erreur affichée */ } }}>Accepter</Button><Button variant="ghost" className="min-h-11" disabled={geste.enCours} onClick={async () => { const motif = window.prompt("Motif du rejet"); if (!motif) return; try { await geste.executer("vis_rejeter_recommandation", { p_recommandation: r.id!, p_motif: motif }); } catch { /* erreur affichée */ } }}>Rejeter</Button></>}{r.etat === "accepted" && <ExecutionRecommandation id={r.id!} />}</div></div></li>)}</ol>}<ErreurGeste erreur={geste.erreur} /></Section>;
  }
  return <><div className="mb-6"><Button className="min-h-11" onClick={() => setPrepare(true)}>Préparer les corrections</Button><p className="mt-2 text-xs text-tertiary">Rien n'est publié sans votre validation.</p>{prepare && <p role="status" className="mt-2 text-xs text-muted-foreground">{valides.length} correction{valides.length > 1 ? "s" : ""} préparée{valides.length > 1 ? "s" : ""}, simulation en attente de publication validée.</p>}</div>
    <Section titre="Recommandations de SEO Command"><ol>{[...donnees.vueSite.recommandations].sort((a, b) => ordre[a.etat] - ordre[b.etat]).map((r) => <li key={r.titre} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-border py-3 text-sm last:border-0 sm:grid-cols-[1fr_10rem_8rem_auto]"><span>{r.titre}</span><span className="text-tertiary">{r.effet}</span><Statut etat={r.etat} /><label className="flex min-h-11 items-center gap-2 text-muted-foreground"><Checkbox checked={valides.includes(r.titre)} onCheckedChange={() => setValides((v) => v.includes(r.titre) ? v.filter((x) => x !== r.titre) : [...v, r.titre])} />valider</label></li>)}</ol></Section></>;
}

export function VueRapports() {
  const { libQuestion } = useQuestions();
  const { rapports, comparaison } = useVisibilityDonnees();
  return <><div className="grid gap-6"><Section titre="Rapports de fenêtre">{rapports.length === 0 ? <p className="text-sm text-muted-foreground">Aucun rapport généré pour ce sujet.</p> : <ul>{rapports.map((r) => <li key={r.id} className="flex flex-wrap justify-between gap-2 border-b border-border py-3 text-sm last:border-0"><span>{r.titre} · <span className="text-muted-foreground">{r.fenetre}</span></span><span className="text-tertiary">{r.statut}</span></li>)}</ul>}</Section>
    <Section titre="Avant et après, questions communes" aside={<span className="text-xs text-tertiary">J0 puis dernière fenêtre</span>}>{comparaison.length === 0 ? <p className="text-sm text-muted-foreground">Non mesurable : une seule fenêtre réelle est disponible.</p> : <table className="num w-full text-sm"><thead className="text-left text-tertiary"><tr className="border-b border-border"><th className="py-2 font-normal">Question</th><th className="font-normal">Avant</th><th className="font-normal">Après</th><th className="font-normal">Écart</th></tr></thead><tbody>{comparaison.map((c) => <tr key={c.question} className="border-b border-border last:border-0"><td className="py-2.5 pr-3">{libQuestion(c.question)}</td><td>{pct(c.avant)}</td><td>{pct(c.apres)}</td><td className="text-muted-foreground">{c.avant === null || c.apres === null ? "non mesurable" : `${c.apres - c.avant > 0 ? "+" : ""}${c.apres - c.avant} pt`}</td></tr>)}</tbody></table>}<p className="mt-3 text-xs text-tertiary">Un écart n'est significatif que si les intervalles des deux fenêtres ne se recouvrent pas.</p></Section></div><NoteMesure /></>;
}

export function VueSeo() { return <SeoResume />; }

export const vuesVisibility = {
  visibilite: VueVisibilite, "part-de-voix": VuePartVoix, sentiment: VueSentiment, reponses: VueReponses, recherches: VueRecherches,
  citations: VueCitations, opportunites: VueOpportunites, reseaux: VueReseaux, recommandations: VueRecommandations,
  rapports: VueRapports, "seo-command": VueSeo, reglages: VueReglages, activite: ActiviteMoteur,
} as const;
