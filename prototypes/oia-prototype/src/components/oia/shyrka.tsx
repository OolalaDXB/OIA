import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useContexte } from "@/lib/shyrka-contexte";
import { ShyrkaParticles } from "@/components/oia/shyrka-particles";
import { Link, useRouterState } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Trash2, Maximize, Mic, MicOff, Pause, Play, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { simulerShyrka, etatPresence } from "@/lib/donnees/shyrka";
import { useShyrkaDonnees } from "@/lib/donnees/provider";
import { EtatEcran } from "@/components/oia/etat-donnees";

import { lireShyrka, sauverShyrka } from "@/lib/shyrka-storage";
import { definirPrive, interrompre, PriseMicro, santeLocale, suivreEtats, tourAudio, tourTexte, ErreurLocale, type EtatLocal, type SanteLocale, type SourceLocale } from "@/lib/shyrka-locale";

/** État réel de Shyrka sur le Mac (passerelle locale), ou de la démonstration. */
type Mode = EtatLocal;
type Message = { id: number; auteur: "Vous" | "Shyrka"; texte: string; meta?: string; sources?: SourceLocale[] };
/** Les particules ont trois régimes : l'état réel y est ramené, le libellé dit l'état exact. */
const particules = (m: Mode): "repos" | "ecoute" | "parle" => (m === "parle" ? "parle" : m === "ecoute" || m === "transcription" || m === "reflexion" ? "ecoute" : "repos");
const LIBELLE: Record<Mode, string> = { repos: "Au repos", ecoute: "À l’écoute, micro actif", transcription: "Transcription", reflexion: "Réflexion", parle: "Parle", erreur: "Erreur", interrompu: "Interrompue" };
type Action = { id: number; texte: string; faite: boolean };
type Session = {
  effacer: () => void; sauvegarde: boolean; pret: boolean;
  pleinEcran: boolean; setPleinEcran: (open: boolean) => void;
  messages: Message[]; actions: Action[]; decisions: Action[]; mode: Mode;
  envoyer: (texte: string) => void; ecouter: (active: boolean) => void;
  cocher: (id: number) => void; ouvert: boolean; ouvrir: (open: boolean) => void;
  /** Passerelle du Mac joignable : conversation réelle. Sinon null : démonstration. */
  locale: SanteLocale | null; occupe: boolean;
  /** Pousser pour parler : première action démarre la prise, la seconde l'arrête et la transcrit. */
  parler: () => void; priseActive: boolean;
  /** Transcription à relire avant envoi (jamais envoyée d'elle-même). */
  brouillon: { texte: string; note: string | null; n: number } | null;
  couper: () => void; alerte: string | null;
};
const ShyrkaContext = createContext<Session | null>(null);

export function ShyrkaProvider({ children }: { children: ReactNode }) {
  const ctx = useContexte();
  const [pleinEcran, setPleinEcran] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [decisions, setDecisions] = useState<Action[]>([]);
  const [mode, setMode] = useState<Mode>("repos");
  const [ouvert, ouvrir] = useState(false);
  const [pret, setPret] = useState(false);
  const [sauvegarde, setSauvegarde] = useState(true);
  const sequence = useRef(0);
  useEffect(() => {
    try {
      const saved = lireShyrka(window.localStorage);
      if (saved) {
        setMessages(saved.messages); setActions(saved.actions); setDecisions(saved.decisions);
        sequence.current = Math.max(0, ...saved.messages.map((m) => m.id), ...saved.actions.map((a) => a.id), ...saved.decisions.map((d) => d.id));
      }
    } catch { setSauvegarde(false); }
    setPret(true);
  }, []);
  useEffect(() => {
    if (!pret || ctx.prive) return;
    try { setSauvegarde(sauverShyrka(window.localStorage, { version: 1, messages, actions, decisions })); }
    catch { setSauvegarde(false); }
  }, [pret, messages, actions, decisions, ctx.prive]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  // Shyrka sur le Mac : passerelle locale (issue #11). Absente hors du Mac : démonstration.
  const [locale, setLocale] = useState<SanteLocale | null>(null);
  const [occupe, setOccupe] = useState(false);
  const [priseActive, setPriseActive] = useState(false);
  const [brouillon, setBrouillon] = useState<Session["brouillon"]>(null);
  const [alerte, setAlerte] = useState<string | null>(null);
  const prise = useRef<PriseMicro | null>(null);
  useEffect(() => {
    let fermer: (() => void) | undefined;
    let vivant = true;
    void santeLocale().then((s) => {
      if (!vivant || !s) return;
      setLocale(s);
      fermer = suivreEtats({
        etat: (e) => setMode((m) => (m === "ecoute" && e === "repos" ? m : e)),
        fin: () => setOccupe(false),
        perdu: () => setAlerte("Passerelle du Mac injoignable : relancer pnpm shyrka:passerelle."),
      });
    });
    return () => { vivant = false; fermer?.(); prise.current?.liberer(); };
  }, []);
  useEffect(() => { if (locale) void definirPrive(ctx.prive).catch(() => undefined); }, [locale, ctx.prive]);
  const ajouter = (m: Omit<Message, "id">) => setMessages((prev) => [...prev, { ...m, id: ++sequence.current }]);
  const envoyerLocal = async (demande: string) => {
    setOccupe(true); setAlerte(null); setBrouillon(null);
    ajouter({ auteur: "Vous", texte: demande });
    setMode("reflexion");
    try {
      const r = await tourTexte(demande);
      const etat = [locale?.modele.nom.replace(/^ollama:/, "") ?? "modèle local", `mémoire ${r.memoire}`, `corpus ${r.corpus}`, ctx.prive ? "mode privé" : null].filter(Boolean).join(" · ");
      ajouter({ auteur: "Shyrka", texte: r.reponse ?? "(rien entendu)", meta: `Mac Studio · ${etat}`, sources: r.sources });
      // La fin du tour (voix comprise) arrive par le flux d'états.
      if (r.reponse === null) setOccupe(false);
    } catch (e) {
      setOccupe(false); setMode("erreur");
      ajouter({ auteur: "Shyrka", texte: e instanceof ErreurLocale ? e.message : "La passerelle du Mac n'a pas répondu.", meta: "Mac Studio · erreur, aucune réponse inventée" });
    }
  };
  const parler = () => {
    if (!locale) return;
    const p = prise.current;
    if (p?.active) {
      setPriseActive(false); setMode("transcription");
      void p.arreter().then(tourAudio).then((r) => {
        setMode("repos");
        if (r.verdict === "silence") setAlerte(`Rien entendu (${r.raison ?? "silence"}) : aucun tour envoyé.`);
        else setBrouillon((b) => ({ texte: r.transcription, note: r.verdict === "douteux" ? `Transcription douteuse : ${r.raison}. Corrige-la ou efface-la.` : null, n: (b?.n ?? 0) + 1 }));
      }).catch((e) => { setMode("erreur"); setAlerte(e instanceof ErreurLocale ? e.message : "Transcription impossible."); });
      prise.current = null;
      return;
    }
    if (occupe && mode !== "parle") return;
    // Shyrka se tait avant d'écouter : sa voix ne doit pas entrer dans le micro.
    if (mode === "parle") void interrompre().catch(() => undefined);
    const nouvelle = new PriseMicro();
    prise.current = nouvelle;
    setAlerte(null);
    void nouvelle.demarrer(() => parler()).then(() => { setPriseActive(true); setMode("ecoute"); }).catch((e) => {
      prise.current = null; setPriseActive(false); setMode("repos");
      setAlerte(e instanceof ErreurLocale ? e.message : "Micro indisponible : le clavier reste disponible.");
    });
  };
  const couper = () => { void interrompre().catch(() => undefined); };
  const envoyer = (texte: string) => {
    const demande = texte.trim();
    if (!demande) return;
    if (locale) { if (!occupe) void envoyerLocal(demande); return; }
    clearTimeout(timer.current);
    const reponse = simulerShyrka(demande);
    setMessages((prev) => [...prev, { id: ++sequence.current, auteur: "Vous", texte: demande }, { id: ++sequence.current, auteur: "Shyrka", texte: reponse.texte }]);
    const nouvellesActions = reponse.actions.map((texte) => ({ id: ++sequence.current, texte, faite: false }));
    const nouvellesDecisions = reponse.decisions.map((texte) => ({ id: ++sequence.current, texte, faite: false }));
    setActions((prev) => [...prev, ...nouvellesActions]);
    setDecisions((prev) => [...prev, ...nouvellesDecisions]);
    nouvellesDecisions.forEach((d) => ctx.apprendre("Décisions", d.texte, "Conversation"));
    setMode("parle");
    timer.current = setTimeout(() => setMode("repos"), 2600);
  };
  return <ShyrkaContext.Provider value={{ locale, occupe, parler, priseActive, brouillon, couper, alerte, pret, sauvegarde, effacer: () => { clearTimeout(timer.current); setMessages([]); setActions([]); setDecisions([]); setMode("repos"); sequence.current = 0; }, pleinEcran, setPleinEcran, messages, actions, decisions, mode, envoyer, ecouter: (active) => { if (!locale && mode !== "parle") setMode(active ? "ecoute" : "repos"); }, cocher: (id) => setActions((prev) => prev.map((a) => a.id === id ? { ...a, faite: !a.faite } : a)), ouvert, ouvrir }}>{children}</ShyrkaContext.Provider>;
}

export function useShyrka() {
  const session = useContext(ShyrkaContext);
  if (!session) throw new Error("Shyrka doit être affichée dans sa session de démonstration.");
  return session;
}

export function PresenceShyrka({ compacte = false, seule = false, modeForce, paused = false }: { compacte?: boolean; seule?: boolean; modeForce?: Mode; paused?: boolean }) {
  const { mode: modeSession, setPleinEcran, locale } = useShyrka();
  const mode = modeForce ?? modeSession;
  const libelle = locale ? LIBELLE[mode] : mode === "repos" ? "Au repos" : mode === "ecoute" ? "À l’écoute" : "Réponse simulée";
  return <div className={`shyrka-presence ${compacte ? "shyrka-presence-small" : ""}`} data-mode={mode}>
    <div role="img" aria-label={`Présence de Shyrka, ${libelle.toLowerCase()}`}><ShyrkaParticles mode={particules(mode)} paused={paused} /></div>
    {!seule && <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-12 text-shyrka-light hover:bg-shyrka-night hover:text-shyrka-light" onClick={() => setPleinEcran(true)} aria-label="Afficher la présence de Shyrka en plein écran" title="Afficher en plein écran"><Maximize /></Button>}
    {!seule && <span className="absolute bottom-4 left-4 text-xs text-shyrka-light" role="status">{libelle}</span>}
  </div>;
}

export function ConversationShyrka({ compacte = false }: { compacte?: boolean }) {
  const { commandesShyrka } = useShyrkaDonnees();
  const { messages, envoyer, pret, locale, occupe, parler, priseActive, brouillon, couper, alerte, mode } = useShyrka();
  const [texte, setTexte] = useState("");
  const transcription = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = transcription.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
  useEffect(() => { if (brouillon) setTexte(brouillon.texte); }, [brouillon]);
  const libelleShyrka = (m: Message) => m.meta ? `Shyrka · ${m.meta}` : `Shyrka${locale ? "" : " · réponse simulée"}`;
  return <div className="flex min-h-0 flex-1 flex-col">
    <div ref={transcription} role="log" aria-label="Conversation avec Shyrka" aria-live="polite" className={`flex-1 space-y-6 overflow-y-auto py-5 ${compacte ? "min-h-16" : "min-h-24"}`}>
      {messages.length === 0 ? <div className="text-sm"><p className="mb-2 text-xs text-tertiary">{locale ? "Shyrka · Mac Studio" : "Shyrka · réponse simulée"}</p><p>{locale ? "Bonjour Mickaël. Je t’écoute : parle (bouton micro) ou écris." : "Bonjour Mickaël. Qu'est-ce qu'on regarde aujourd'hui ?"}</p></div> : messages.map((m) => <div key={m.id} className="border-b border-border pb-5 last:border-0"><p className="mb-2 text-xs text-tertiary">{m.auteur === "Shyrka" ? libelleShyrka(m) : m.auteur}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.texte}</p>{m.sources && m.sources.length > 0 && <ul aria-label="Sources de la réponse" className="mt-2 space-y-1 text-xs text-tertiary">{m.sources.map((s) => <li key={`${s.chemin}:${s.ligne}`}>{s.chemin}:{s.ligne} · {s.section} · version {s.version} · {s.date}</li>)}</ul>}</div>)}
    </div>
    <div className="shrink-0 border-t border-border pt-3">
      <div className="mb-3 flex flex-col items-start gap-1">{commandesShyrka.map((c) => <Button key={c} variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-2 py-2 text-left text-xs font-normal text-muted-foreground" disabled={!pret} onClick={() => envoyer(c)}>{c}</Button>)}</div>
      {brouillon?.note && <p className="mb-2 text-xs text-destructive" role="alert">{brouillon.note}</p>}
      {alerte && <p className="mb-2 text-xs text-muted-foreground" role="status">{alerte}</p>}
      <form onSubmit={(e) => { e.preventDefault(); envoyer(texte); setTexte(""); }} className={`grid ${locale ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} items-center gap-2`}>
        {locale && (mode === "parle"
          ? <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={couper} aria-label="Couper la parole de Shyrka" title="Couper la parole de Shyrka"><Square /></Button>
          : <Button type="button" variant={priseActive ? "destructive" : "outline"} size="icon" className="size-11 shrink-0" disabled={locale.transcription !== "whisper-local" || (occupe && !priseActive) || mode === "transcription"} onClick={parler} aria-pressed={priseActive} aria-label={priseActive ? "Arrêter la prise et transcrire" : "Parler à Shyrka (pousser pour parler)"} title={priseActive ? "Arrêter et transcrire" : "Parler"}>{priseActive ? <MicOff /> : <Mic />}</Button>)}
        <Input aria-label="Demander à Shyrka" placeholder={priseActive ? "● J’écoute… clique pour arrêter" : "Demander à Shyrka"} value={texte} onChange={(e) => setTexte(e.target.value)} className="min-h-11 min-w-0 text-base sm:text-sm" />
        <Button type="submit" variant="outline" size="icon" disabled={!pret || !texte.trim() || occupe} className="size-11 shrink-0" aria-label="Envoyer à Shyrka" title="Envoyer à Shyrka"><ArrowUp /></Button>
      </form>
      <p className="mt-3 text-xs text-tertiary">{locale ? `Mac Studio · ${locale.modele.nom.replace(/^ollama:/, "")} local · Whisper local · voix ${locale.voix.sortie === "mac" ? `${locale.voix.nom} sur le Mac` : "désactivée"} · mémoire ${locale.memoire} · corpus ${locale.corpus}. Rien ne part en ligne.` : "Réponses simulées · aucune action réelle."}</p>
    </div>
  </div>;
}

export function JournalShyrka() {
  const { actionsPreparees } = useShyrkaDonnees();
  const { actions, decisions, cocher } = useShyrka();
  return <aside aria-label="Journal de Shyrka" className="min-w-0 break-words xl:border-l xl:border-border xl:pl-6">
    <h2 className="mb-6 text-lg">Journal</h2>
    <h3 className="mb-3 text-xs text-tertiary">Actions demandées</h3>
    {actions.filter((a) => !a.faite).length === 0 && <p className="text-sm text-muted-foreground">Aucune action demandée.</p>}
    <ul className="space-y-4">{actions.filter((a) => !a.faite).map((a) => <li key={a.id}><label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm leading-relaxed"><Checkbox checked={a.faite} onCheckedChange={() => cocher(a.id)} className="mt-1" aria-label={`Valider : ${a.texte}`} /><span>{a.texte}</span></label></li>)}</ul>
    <h3 className="mb-3 mt-8 text-xs text-tertiary">Actions préparées</h3>
    <ul className="space-y-2">{actionsPreparees.map((t) => <li key={t} className="border-l border-border pl-3 text-sm text-muted-foreground">{t}</li>)}</ul>
    <h3 className="mb-3 mt-8 text-xs text-tertiary">Actions validées</h3>
    {actions.filter((a) => a.faite).length === 0 && <p className="text-sm text-muted-foreground">Aucune action validée.</p>}
    <ul className="space-y-4">{actions.filter((a) => a.faite).map((a) => <li key={a.id}><label className="flex min-h-12 cursor-pointer items-start gap-3 py-3 text-sm leading-relaxed"><Checkbox checked={a.faite} onCheckedChange={() => cocher(a.id)} className="mt-1" /><span className="text-tertiary">{a.texte}</span></label></li>)}</ul>
    <h3 className="mb-3 mt-8 text-xs text-tertiary">Décisions prises</h3>
    {decisions.length === 0 && <p className="text-sm text-muted-foreground">Aucune décision consignée.</p>}
    <ul className="space-y-3">{decisions.map((d) => <li key={d.id} className="border-l border-border pl-3 text-sm leading-relaxed">{d.texte}</li>)}</ul>
    <p className="mt-8 text-xs text-tertiary">Journal fictif · conservé dans ce navigateur.</p>
  </aside>;
}

export function ShyrkaGlobale() {
  const { ouvert, ouvrir } = useShyrka();
  const surPageShyrka = useRouterState({ select: (s) => s.location.pathname === "/shyrka" });
  return <>
    <Sheet open={ouvert} onOpenChange={ouvrir}>
    <SheetTrigger asChild><Button variant="outline" className={`shyrka-launcher fixed right-4 z-40 min-h-12 gap-2 bg-background font-normal ${surPageShyrka ? "hidden xl:inline-flex" : ""}`} aria-label="Ouvrir le panneau Shyrka"><span className="size-1.5 rounded-full bg-bar" aria-hidden="true" />Shyrka</Button></SheetTrigger>
    <SheetContent className="shyrka-sheet flex w-full min-h-0 flex-col gap-3 overflow-hidden p-4 sm:max-w-md sm:p-6">
      <SheetTitle className="shrink-0 pr-10 font-medium">Shyrka</SheetTitle>
      <SheetDescription className="text-xs">Assistante · démonstration simulée</SheetDescription>
      <EtatEcran module="shyrka"><PresenceShyrka compacte />
      <ConversationShyrka compacte /></EtatEcran>
      <div className="shrink-0"><SauvegardeShyrka compacte /><Button asChild variant="link" className="min-h-11 justify-start px-0 text-xs font-normal"><Link to="/shyrka" onClick={() => ouvrir(false)}>Ouvrir la conversation complète</Link></Button></div>
    </SheetContent></Sheet>
    <PresencePleinEcran />
  </>;
}
function PresencePleinEcran() {
  const { presenceInitiale } = useShyrkaDonnees();
  const { pleinEcran, setPleinEcran, mode, locale } = useShyrka();
  const [microActif, setMicroActif] = useState(presenceInitiale.microActif);
  const [pause, setPause] = useState(presenceInitiale.pause);
  const [visible, setVisible] = useState(true);
  const disparition = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retourFocus = useRef<HTMLElement | null>(null);
  const reveiller = () => {
    setVisible(true);
    clearTimeout(disparition.current);
    disparition.current = setTimeout(() => setVisible(false), 3000);
  };
  useEffect(() => {
    if (pleinEcran) {
      setMicroActif(false);
      setPause(false);
      setVisible(true);
      disparition.current = setTimeout(() => setVisible(false), 3000);
    }
    return () => clearTimeout(disparition.current);
  }, [pleinEcran]);
  const etat = etatPresence(microActif, pause, mode === "parle");
  return <DialogPrimitive.Root open={pleinEcran} onOpenChange={setPleinEcran}><DialogPrimitive.Portal>
    <DialogPrimitive.Content aria-describedby={undefined} className="shyrka-fullscreen" data-paused={pause} onOpenAutoFocus={() => { retourFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; }} onCloseAutoFocus={(e) => { if (retourFocus.current?.isConnected) { e.preventDefault(); retourFocus.current.focus(); } }} onPointerMove={reveiller} onPointerDown={reveiller} onKeyDown={reveiller}>
      <DialogPrimitive.Title className="sr-only">Présence de Shyrka, simulation</DialogPrimitive.Title>
      <PresenceShyrka seule paused={pause} modeForce={locale ? mode : mode === "parle" ? "parle" : microActif ? "ecoute" : "repos"} />
      <div className="shyrka-controls" data-visible={visible} onFocus={reveiller}>
        <p className="mb-3 text-center text-[10px]" role="status">{etat}</p>
        <div className="flex justify-center gap-4">
          <Button variant="ghost" size="icon" className="shyrka-control" aria-label="Micro simulé" aria-pressed={microActif} title={microActif ? "Couper le micro simulé" : "Activer le micro simulé"} onClick={() => setMicroActif((v) => !v)}>{microActif ? <Mic /> : <MicOff />}</Button>
          <Button variant="ghost" size="icon" className="shyrka-control" aria-label="Mettre la présence en pause" aria-pressed={pause} title={pause ? "Relancer" : "Pause"} onClick={() => setPause((v) => !v)}>{pause ? <Play /> : <Pause />}</Button>
          <Button variant="ghost" size="icon" className="shyrka-control" aria-label="Quitter la présence plein écran" title="Quitter" onClick={() => setPleinEcran(false)}><X /></Button>
        </div>
      </div>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal></DialogPrimitive.Root>;
}

export function SauvegardeShyrka({ compacte = false }: { compacte?: boolean }) {
  const { effacer, sauvegarde, messages, actions, decisions } = useShyrka();
  const [confirmation, setConfirmation] = useState(false);
  return <div className={compacte ? "" : "mb-6"}>
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"><p className="min-w-0 text-xs text-tertiary" role="status">{sauvegarde ? "Sauvegardé dans ce navigateur" : "Sauvegarde indisponible dans ce navigateur"}</p><Button variant="ghost" size="icon" className="size-11 shrink-0" aria-label="Effacer la conversation et le journal" title="Effacer la conversation et le journal" disabled={!messages.length && !actions.length && !decisions.length} onClick={() => setConfirmation(true)}><Trash2 /></Button></div>
    {confirmation && <div className="border-t border-border py-3"><p className="text-sm">Effacer la conversation et le journal de ce navigateur ?</p><div className="mt-2 flex gap-2"><Button variant="outline" className="min-h-11" onClick={() => setConfirmation(false)}>Annuler</Button><Button className="min-h-11" onClick={() => { effacer(); setConfirmation(false); }}>Tout effacer</Button></div></div>}
  </div>;
}
