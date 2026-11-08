import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useContexte } from "@/lib/shyrka-contexte";
import { ShyrkaParticles } from "@/components/oia/shyrka-particles";
import { Link, useRouterState } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Trash2, Maximize, Mic, MicOff, Pause, Play, Square, X, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { simulerShyrka } from "@/lib/donnees/shyrka";
import { actionClavierImmersive, DELAI_ENVOI_MS, DELAI_REFLEXION_MS, libelleImmersif, TRANSCRIPTION_SIMULEE, type PhaseImmersive } from "@/lib/shyrka-immersive";
import { useShyrkaDonnees } from "@/lib/donnees/provider";
import { EtatEcran } from "@/components/oia/etat-donnees";

import { lireShyrka, sauverShyrka } from "@/lib/shyrka-storage";
import { EcouteContinue } from "@/lib/shyrka-mains-libres";
import { changerPresence, definirPrive, interrompre, lirePresence, type ModePresence, verifierInterruption, PriseMicro, santeLocale, suivreEtats, tourAudio, tourTexte, ErreurLocale, type EtatLocal, type SanteLocale, type SourceLocale } from "@/lib/shyrka-locale";

/** État réel de Shyrka sur le Mac (passerelle locale), ou de la démonstration. */
type Mode = EtatLocal;
type Message = { id: number; auteur: "Vous" | "Shyrka"; texte: string; meta?: string; sources?: SourceLocale[] };
/** Les particules ont trois régimes : l'état réel y est ramené, le libellé dit l'état exact. */
const particules = (m: Mode): "repos" | "ecoute" | "reflexion" | "parle" => (m === "parle" ? "parle" : m === "ecoute" ? "ecoute" : m === "transcription" || m === "reflexion" ? "reflexion" : "repos");
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
  /** Mode de présence réel du Mac (null hors du Mac). */
  presence: ModePresence | null; changerPresence: (m: ModePresence) => void;
  /** Mains libres : active ou coupe le micro ouvert (fin d'énoncé après 2 s de silence, reprise qui interrompt Shyrka). */
  parler: () => void; priseActive: boolean;
  /** Transcription à relire avant envoi (jamais envoyée d'elle-même). */
  brouillon: { texte: string; note: string | null; n: number; langue?: string } | null;
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
  const [presence, setPresence] = useState<ModePresence | null>(null);
  const prise = useRef<PriseMicro | null>(null);
  const ecoute = useRef<EcouteContinue | null>(null);
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
        presence: (m) => setPresence(m),
      });
      void lirePresence().then((p) => vivant && setPresence(p.mode), () => undefined);
    });
    return () => { vivant = false; fermer?.(); prise.current?.liberer(); ecoute.current?.arreter(); };
  }, []);
  // L'écoute continue suit l'état réel : seuil relevé pendant la voix de Shyrka, rien pris pendant qu'elle réfléchit.
  useEffect(() => {
    const e = ecoute.current;
    if (!e) return;
    e.voixShyrka = mode === "parle";
    // Après une reprise (Shyrka interrompue), Mickaël parle déjà : on écoute.
    e.enAttente = mode === "transcription" || mode === "reflexion";
  }, [mode]);
  useEffect(() => { if (locale) void definirPrive(ctx.prive).catch(() => undefined); }, [locale, ctx.prive]);
  // Mode plus restreint (quelqu'un arrive, inactivité) : la conversation affichée disparaît de l'écran et du navigateur.
  const rangPresence = { seul: 2, entre_proches: 1, externe: 0 } as const;
  const presencePrecedente = useRef<ModePresence | null>(null);
  useEffect(() => {
    const avant = presencePrecedente.current;
    presencePrecedente.current = presence;
    if (avant && presence && rangPresence[presence] < rangPresence[avant]) { setMessages([]); sequence.current = 0; }
  }, [presence]);
  const ajouter = (m: Omit<Message, "id">) => setMessages((prev) => [...prev, { ...m, id: ++sequence.current }]);
  const envoyerLocal = async (demande: string, langueDetectee?: string) => {
    // La langue détectée sur la prise accompagne le tour ; un texte tapé est jugé par la passerelle.
    const langue = langueDetectee ?? brouillon?.langue;
    setOccupe(true); setAlerte(null); setBrouillon(null);
    ajouter({ auteur: "Vous", texte: demande });
    setMode("reflexion");
    try {
      const r = await tourTexte(demande, langue);
      const etat = [locale?.modele.nom.replace(/^ollama:/, "") ?? "modèle local", r.langue && r.langue !== "fr" ? `langue ${r.langue}` : null, `mémoire ${r.memoire}`, `corpus ${r.corpus}`, ctx.prive ? "mode privé" : null].filter(Boolean).join(" · ");
      ajouter({ auteur: "Shyrka", texte: r.reponse ?? "(rien entendu)", meta: `Mac Studio · ${etat}`, sources: r.sources });
      // La fin du tour (voix comprise) arrive par le flux d'états.
      if (r.reponse === null) setOccupe(false);
    } catch (e) {
      setOccupe(false); setMode("erreur");
      ajouter({ auteur: "Shyrka", texte: e instanceof ErreurLocale ? e.message : "La passerelle du Mac n'a pas répondu.", meta: "Mac Studio · erreur, aucune réponse inventée" });
    }
  };
  // Énoncé terminé (2 s de silence) : transcrit puis envoyé aussitôt ; une transcription douteuse attend.
  const traiterEnonce = (b: Blob) => {
    setMode("transcription");
    void tourAudio(b).then((r) => {
      if (r.verdict === "silence") { setMode("repos"); return; }
      if (r.verdict === "douteux") {
        setMode("repos");
        setBrouillon((x) => ({ texte: r.transcription, note: `Transcription douteuse : ${r.raison}. Corrige-la ou efface-la.`, n: (x?.n ?? 0) + 1, ...(r.langue ? { langue: r.langue } : {}) }));
        return;
      }
      void envoyerLocal(r.transcription, r.langue);
    }).catch((e) => { setMode("erreur"); setAlerte(e instanceof ErreurLocale ? e.message : "Transcription impossible."); });
  };
  const parler = () => {
    if (!locale) return;
    if (ecoute.current?.active) {
      ecoute.current.arreter();
      ecoute.current = null;
      setPriseActive(false);
      setMode((m) => (m === "ecoute" ? "repos" : m));
      return;
    }
    const e = new EcouteContinue({
      enonce: traiterEnonce,
      // Pendant sa voix : Shyrka n'est coupée que si la passerelle entend « Stop », « Attends » ou « Excuse-moi ».
      candidat: (b) => { void verifierInterruption(b).catch(() => undefined); },
      debutParole: () => setMode("ecoute"),
      erreur: (message) => { ecoute.current?.arreter(); ecoute.current = null; setPriseActive(false); setMode("repos"); setAlerte(message); },
    });
    ecoute.current = e;
    setAlerte(null);
    void e.demarrer().then(() => { if (e.active) setPriseActive(true); });
  };
  const couper = () => { void interrompre().catch(() => undefined); };
  useEffect(() => {
    if (!locale || mode !== "parle") return;
    const touche = (event: KeyboardEvent) => {
      const cible = event.target as HTMLElement | null;
      if (cible?.matches("input, textarea, [contenteditable=true]")) return;
      if (event.key !== "Escape" && event.key !== " ") return;
      // Capture : passe avant le plein écran (qui fermerait la vue ou couperait le micro).
      event.preventDefault();
      event.stopPropagation();
      void interrompre().catch(() => undefined);
    };
    window.addEventListener("keydown", touche, true);
    return () => window.removeEventListener("keydown", touche, true);
  }, [locale, mode]);
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
  return <ShyrkaContext.Provider value={{ presence, changerPresence: (m: ModePresence) => { void changerPresence(m).then((r) => setPresence(r.mode), () => undefined); }, locale, occupe, parler, priseActive, brouillon, couper, alerte, pret, sauvegarde, effacer: () => { clearTimeout(timer.current); setMessages([]); setActions([]); setDecisions([]); setMode("repos"); sequence.current = 0; }, pleinEcran, setPleinEcran, messages, actions, decisions, mode, envoyer, ecouter: (active) => { if (!locale && mode !== "parle") setMode(active ? "ecoute" : "repos"); }, cocher: (id) => setActions((prev) => prev.map((a) => a.id === id ? { ...a, faite: !a.faite } : a)), ouvert, ouvrir }}>{children}</ShyrkaContext.Provider>;
}

export function useShyrka() {
  const session = useContext(ShyrkaContext);
  if (!session) throw new Error("Shyrka doit être affichée dans sa session de démonstration.");
  return session;
}

export function PresenceShyrka({ compacte = false, seule = false, modeForce, paused = false }: { compacte?: boolean; seule?: boolean; modeForce?: Mode; paused?: boolean }) {
  const { mode: modeSession, setPleinEcran, locale } = useShyrka();
  const mode = modeForce ?? modeSession;
  const libelle = locale ? LIBELLE[mode] : mode === "repos" ? "Au repos" : mode === "ecoute" ? "À l’écoute" : mode === "reflexion" ? "Réflexion" : "Réponse simulée";
  return <div className={`shyrka-presence ${compacte ? "shyrka-presence-small" : ""}`} data-mode={mode}>
    <div role="img" aria-label={`Présence de Shyrka, ${libelle.toLowerCase()}`}><ShyrkaParticles mode={particules(mode)} paused={paused} /></div>
    {!seule && <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-12 text-shyrka-light hover:bg-shyrka-night hover:text-shyrka-light" onClick={() => { pleinEcranNavigateur(true); setPleinEcran(true); }} aria-label="Afficher la présence de Shyrka en plein écran" title="Afficher en plein écran, touche F"><Maximize /></Button>}
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
      {messages.length === 0 ? <div className="text-sm"><p className="mb-2 text-xs text-tertiary">{locale ? "Shyrka · Mac Studio" : "Shyrka · réponse simulée"}</p><p>{locale ? "Bonjour Mickaël. Je t’écoute : parle (bouton micro) ou écris." : "Bonjour Mickaël. Qu'est-ce qu'on regarde aujourd'hui ?"}</p></div> : messages.map((m) => <div key={m.id} className="border-b border-border pb-5 last:border-0"><p className="mb-2 text-xs text-tertiary">{m.auteur === "Shyrka" ? libelleShyrka(m) : m.auteur}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.texte}</p>{m.sources && m.sources.length > 0 && <ul aria-label="Sources de la réponse" className="mt-2 space-y-1 text-xs text-tertiary">{m.sources.map((s) => <li key={s.citation ?? `${s.chemin}:${s.ligne}`}>{s.citation ?? `${s.chemin}:${s.ligne}`} · {s.section} · version {s.version} · {s.date}</li>)}</ul>}</div>)}
    </div>
    <div className="shrink-0 border-t border-border pt-3">
      <div className="mb-3 flex flex-col items-start gap-1">{commandesShyrka.map((c) => <Button key={c} variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-2 py-2 text-left text-xs font-normal text-muted-foreground" disabled={!pret} onClick={() => envoyer(c)}>{c}</Button>)}</div>
      {brouillon?.note && <p className="mb-2 text-xs text-destructive" role="alert">{brouillon.note}</p>}
      {alerte && <p className="mb-2 text-xs text-muted-foreground" role="status">{alerte}</p>}
      <form onSubmit={(e) => { e.preventDefault(); envoyer(texte); setTexte(""); }} className={`grid ${locale ? "grid-cols-[auto_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} items-center gap-2`}>
        {locale && (mode === "parle"
          ? <Button type="button" variant="outline" size="icon" className="size-11 shrink-0" onClick={couper} aria-label="Couper la parole de Shyrka" title="Couper la parole de Shyrka"><Square /></Button>
          : <Button type="button" variant={priseActive ? "destructive" : "outline"} size="icon" className="size-11 shrink-0" disabled={locale.transcription !== "whisper-local"} onClick={parler} aria-pressed={priseActive} aria-label={priseActive ? "Couper le micro (mains libres)" : "Ouvrir le micro : parler à Shyrka en mains libres"} title={priseActive ? "Couper le micro" : "Parler en mains libres"}>{priseActive ? <MicOff /> : <Mic />}</Button>)}
        <Input aria-label="Demander à Shyrka" placeholder={priseActive ? "● Micro ouvert : parle, je réponds après 2 s de silence" : "Demander à Shyrka"} value={texte} onChange={(e) => setTexte(e.target.value)} className="min-h-11 min-w-0 text-base sm:text-sm" />
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

/** Délai avant l'envoi d'une transcription réelle en plein écran : de quoi taper une touche pour la corriger. */
const DELAI_ENVOI_MAC_MS = 1500;

/** Plein écran du navigateur : Chrome ne l'accorde que pendant un geste (touche, clic), d'où l'appel synchrone. */
function pleinEcranNavigateur(ouvrir: boolean): void {
  if (ouvrir && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
  if (!ouvrir && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
}

export function ShyrkaGlobale() {
  const { ouvert, ouvrir, pleinEcran, setPleinEcran } = useShyrka();
  const surPageShyrka = useRouterState({ select: (s) => s.location.pathname === "/shyrka" });
  useEffect(() => {
    const gererF = (event: KeyboardEvent) => {
      const cible = event.target as HTMLElement | null;
      if (cible?.matches("input, textarea, [contenteditable=true]") || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key.toLowerCase() !== "f" || (!pleinEcran && !surPageShyrka && !ouvert)) return;
      event.preventDefault();
      pleinEcranNavigateur(!pleinEcran);
      setPleinEcran(!pleinEcran);
    };
    window.addEventListener("keydown", gererF);
    return () => window.removeEventListener("keydown", gererF);
  }, [ouvert, pleinEcran, setPleinEcran, surPageShyrka]);
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
  const { pleinEcran, setPleinEcran, mode, envoyer, messages, locale, parler, priseActive, brouillon: brouillonSession, couper, alerte } = useShyrka();
  const [microActif, setMicroActif] = useState(presenceInitiale.microActif);
  const [pause, setPause] = useState(presenceInitiale.pause);
  const [visible, setVisible] = useState(false);
  const [phase, setPhase] = useState<PhaseImmersive>("repos");
  const [compris, setCompris] = useState<string | null>(null);
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState("");
  const disparition = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const reflexionTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const envoiTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const retourFocus = useRef<HTMLElement | null>(null);
  const contenuRef = useRef<HTMLDivElement>(null);
  const saisieRef = useRef<HTMLInputElement>(null);
  const phaseRef = useRef(phase);
  const modeRef = useRef(mode);
  const comprisRef = useRef(compris);
  const editionRef = useRef(edition);
  const envoyerRef = useRef(envoyer);
  const envoyerTexteRef = useRef<(texte: string) => void>(() => {});
  phaseRef.current = phase;
  modeRef.current = mode;
  comprisRef.current = compris;
  editionRef.current = edition;
  envoyerRef.current = envoyer;

  const nettoyerMinuteurs = () => {
    clearTimeout(reflexionTimer.current);
    clearTimeout(envoiTimer.current);
  };
  const reveiller = () => {
    setVisible(true);
    clearTimeout(disparition.current);
    disparition.current = setTimeout(() => setVisible(false), 2400);
  };
  const demarrerEcoute = () => {
    if (locale) { if (modeRef.current === "parle") couper(); else parler(); return; } // pendant la voix : la couper ; sinon micro ouvert ou coupé
    if (pause || modeRef.current === "parle" || editionRef.current || phaseRef.current === "reflexion" || comprisRef.current) return;
    nettoyerMinuteurs();
    setCompris(null);
    setPhase("ecoute");
    phaseRef.current = "ecoute";
    setMicroActif(true);
  };
  const envoyerTexte = (texte: string) => {
    const demande = texte.trim();
    if (!demande) return;
    nettoyerMinuteurs();
    setCompris(null);
    comprisRef.current = null;
    setPhase("repos");
    phaseRef.current = "repos";
    setMicroActif(false);
    setEdition(false);
    editionRef.current = false;
    setBrouillon("");
    envoyerRef.current(demande);
  };
  envoyerTexteRef.current = envoyerTexte;
  const terminerEcoute = () => {
    if (phaseRef.current !== "ecoute") return;
    setPhase("reflexion");
    phaseRef.current = "reflexion";
    setMicroActif(false);
    if (locale) return; // mains libres : la fin d'énoncé vient du silence
    reflexionTimer.current = setTimeout(() => {
      setCompris(TRANSCRIPTION_SIMULEE);
      comprisRef.current = TRANSCRIPTION_SIMULEE;
      envoiTimer.current = setTimeout(() => envoyerTexteRef.current(TRANSCRIPTION_SIMULEE), DELAI_ENVOI_MS);
    }, DELAI_REFLEXION_MS);
  };
  const ouvrirSaisie = (base = "", touche = "") => {
    nettoyerMinuteurs();
    setCompris(null);
    comprisRef.current = null;
    setPhase("repos");
    phaseRef.current = "repos";
    setMicroActif(false);
    setBrouillon(base + touche);
    setEdition(true);
    editionRef.current = true;
  };

  useEffect(() => {
    if (!pleinEcran) return;
    setMicroActif(false);
    setPause(false);
    setVisible(false);
    setPhase("repos");
    setCompris(null);
    setEdition(false);
    setBrouillon("");
    return () => {
      clearTimeout(disparition.current);
      clearTimeout(reflexionTimer.current);
      clearTimeout(envoiTimer.current);
    };
  }, [pleinEcran]);
  useEffect(() => {
    if (edition) saisieRef.current?.focus();
  }, [edition]);
  // Vrai plein écran : demandé au geste (touche F, bouton, voir basculerPleinEcran) ; quitté avec la vue.
  // Le quitter par Échap de Chrome ferme la vue.
  useEffect(() => {
    if (!pleinEcran && document.fullscreenElement) void document.exitFullscreen?.().catch(() => undefined);
    if (!pleinEcran && locale && priseActive) parler(); // quitter le plein écran ferme le micro ouvert
  }, [pleinEcran]);
  useEffect(() => {
    const sortie = () => { if (!document.fullscreenElement) setPleinEcran(false); };
    document.addEventListener("fullscreenchange", sortie);
    return () => document.removeEventListener("fullscreenchange", sortie);
  }, [setPleinEcran]);
  useEffect(() => {
    if (mode !== "parle") return;
    nettoyerMinuteurs();
    setCompris(null);
    setPhase("repos");
    setMicroActif(false);
    setEdition(false);
  }, [mode]);
  useEffect(() => {
    if (!pleinEcran) return;
    const clavier = (event: KeyboardEvent) => {
      const cible = event.target as HTMLElement | null;
      const saisie = Boolean(cible?.matches("input, textarea, [contenteditable=true]"));
      const autreBouton = Boolean(cible?.closest("button") && !cible.closest(".shyrka-presence-button"));
      if (event.key === "Escape" && (editionRef.current || comprisRef.current)) {
        event.preventDefault();
        event.stopPropagation();
        nettoyerMinuteurs();
        setEdition(false);
        editionRef.current = false;
        setBrouillon("");
        setCompris(null);
        comprisRef.current = null;
        setPhase("repos");
        phaseRef.current = "repos";
        return;
      }
      if (saisie || autreBouton) return;
      const action = actionClavierImmersive({
        key: event.key,
        repeat: event.repeat,
        modifieur: event.ctrlKey || event.metaKey || event.altKey,
        enAttente: Boolean(comprisRef.current),
      });
      if (action === "parole") {
        event.preventDefault();
        reveiller();
        demarrerEcoute();
      } else if (action === "envoyer" && comprisRef.current) {
        event.preventDefault();
        envoyerTexte(comprisRef.current);
      } else if (action === "corriger") {
        event.preventDefault();
        ouvrirSaisie(comprisRef.current ?? "", event.key.length === 1 ? event.key : "");
      } else if (action === "ecrire") {
        event.preventDefault();
        ouvrirSaisie("", event.key);
      }
    };
    const relacher = (event: KeyboardEvent) => {
      if (event.key === " " && phaseRef.current === "ecoute") {
        event.preventDefault();
        terminerEcoute();
      }
    };
    window.addEventListener("keydown", clavier, true);
    window.addEventListener("keyup", relacher);
    return () => {
      window.removeEventListener("keydown", clavier, true);
      window.removeEventListener("keyup", relacher);
    };
  }, [pleinEcran, mode, pause]);

  const derniereReponse = [...messages].reverse().find((message) => message.auteur === "Shyrka")?.texte ?? "";
  const sousTitre = mode === "parle" ? derniereReponse : compris ?? (locale ? alerte ?? brouillonSession?.note ?? "" : "");
  // Mode Mac : la transcription réelle arrive de la passerelle et part comme dans le design de Lovable,
  // mais après DELAI_ENVOI_MAC_MS (les 4 s de la démonstration s'ajoutaient au temps de réponse) ; d'ici là, une touche la corrige, Échap l'annule. Une transcription douteuse
  // (silence, sous-titres appris de Whisper) attend Entrée.
  useEffect(() => {
    if (!locale || !pleinEcran || !brouillonSession?.texte) return;
    const texte = brouillonSession.texte;
    nettoyerMinuteurs();
    setCompris(texte);
    comprisRef.current = texte;
    setPhase("repos");
    phaseRef.current = "repos";
    if (!brouillonSession.note) envoiTimer.current = setTimeout(() => envoyerTexteRef.current(texte), DELAI_ENVOI_MAC_MS);
  }, [brouillonSession, locale, pleinEcran]);
  const etat = locale ? (mode === "repos" ? "" : LIBELLE[mode]) : libelleImmersif(phase, mode === "parle", pause);
  const presenceMode: Mode = locale ? mode : mode === "parle" ? "parle" : phase;
  return <DialogPrimitive.Root open={pleinEcran} onOpenChange={setPleinEcran}><DialogPrimitive.Portal>
    <DialogPrimitive.Content ref={contenuRef} aria-describedby="shyrka-immersion-aide" className="shyrka-fullscreen" data-paused={pause} onOpenAutoFocus={(event) => { event.preventDefault(); retourFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; contenuRef.current?.focus(); }} onCloseAutoFocus={(e) => { if (retourFocus.current?.isConnected) { e.preventDefault(); retourFocus.current.focus(); } }} onPointerMove={reveiller} onPointerDown={reveiller} onKeyDown={reveiller} onKeyDownCapture={(event) => { if (event.key === "Escape" && edition) { event.preventDefault(); event.stopPropagation(); setEdition(false); setBrouillon(""); } }}>
      <DialogPrimitive.Title className="sr-only">{locale ? "Présence de Shyrka sur le Mac" : "Présence de Shyrka, simulation"}</DialogPrimitive.Title>
      <p id="shyrka-immersion-aide" className="sr-only">Maintenez la barre d’espace pour parler. Entrée envoie la transcription. Une autre touche permet de corriger. F ferme le plein écran.</p>
      <button type="button" className="shyrka-presence-button" aria-label={locale ? (priseActive ? "Couper le micro (mains libres)" : "Ouvrir le micro : mains libres") : phase === "ecoute" ? "Arrêter l’écoute simulée" : "Démarrer l’écoute simulée"} aria-describedby="shyrka-immersion-aide" onClick={() => { if (phaseRef.current === "ecoute") terminerEcoute(); else demarrerEcoute(); }}>
        <PresenceShyrka seule paused={pause} modeForce={presenceMode} />
      </button>
      <Button variant="ghost" size="icon" className="shyrka-close" data-visible={visible} aria-label="Fermer le plein écran" title="Fermer, touche F" onFocus={reveiller} onClick={() => setPleinEcran(false)}><X /></Button>
      {sousTitre && <p className="shyrka-sous-titre" aria-live="polite">{sousTitre}</p>}
      {edition && <form className="shyrka-saisie" onSubmit={(event) => { event.preventDefault(); envoyerTexte(brouillon); }}>
        <Input ref={saisieRef} aria-label="Écrire à Shyrka" placeholder="Écrire à Shyrka" autoComplete="off" value={brouillon} onChange={(event) => setBrouillon(event.target.value)} />
        <Button type="submit" variant="ghost" size="icon" className="shyrka-control" aria-label="Envoyer le message" disabled={!brouillon.trim()}><ArrowUp /></Button>
      </form>}
      <div className="shyrka-controls" data-visible={(visible || (locale !== null && mode === "parle")) && !edition} onFocus={reveiller}>
        <div className="flex justify-center gap-3">
          {locale && mode === "parle"
            ? <Button variant="ghost" size="icon" className="shyrka-control" aria-label="Couper la parole de Shyrka" title="Couper" onClick={couper}><Square /></Button>
            : <Button variant="ghost" size="icon" className="shyrka-control" aria-label={locale ? (priseActive ? "Couper le micro (mains libres)" : "Ouvrir le micro : mains libres") : microActif ? "Arrêter l’écoute simulée" : "Démarrer l’écoute simulée"} aria-pressed={locale ? priseActive : microActif} title={locale ? "Micro ouvert ou coupé, barre d’espace" : "Parler, ou maintenir la barre d’espace"} onClick={() => { if (phaseRef.current === "ecoute") terminerEcoute(); else demarrerEcoute(); }}>{(locale ? priseActive : microActif) ? <Mic /> : <MicOff />}</Button>}
          <Button variant="ghost" size="icon" className="shyrka-control" aria-label="Écrire à Shyrka" title="Écrire" onClick={() => ouvrirSaisie()}><Keyboard /></Button>
          <Button variant="ghost" size="icon" className="shyrka-control" aria-label={pause ? "Relancer la présence" : "Mettre la présence en pause"} aria-pressed={pause} title={pause ? "Relancer" : "Pause"} onClick={() => setPause((valeur) => !valeur)}>{pause ? <Play /> : <Pause />}</Button>
        </div>
      </div>
      <div aria-live="polite">{etat && <p className="shyrka-etat" data-controls-visible={visible && !edition}>{etat}</p>}</div>
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
