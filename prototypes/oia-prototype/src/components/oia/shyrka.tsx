import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useContexte } from "@/lib/shyrka-contexte";
import { ShyrkaParticles } from "@/components/oia/shyrka-particles";
import { Link, useRouterState } from "@tanstack/react-router";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowUp, Trash2, Maximize, Mic, MicOff, Pause, Play, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetTrigger, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { commandesShyrka, simulerShyrka, presenceInitiale, etatPresence } from "@/data/demo";

import { lireShyrka, sauverShyrka } from "@/lib/shyrka-storage";

type Mode = "repos" | "ecoute" | "parle";
type Message = { id: number; auteur: "Vous" | "Shyrka"; texte: string };
type Action = { id: number; texte: string; faite: boolean };
type Session = {
  effacer: () => void; sauvegarde: boolean; pret: boolean;
  pleinEcran: boolean; setPleinEcran: (open: boolean) => void;
  messages: Message[]; actions: Action[]; decisions: Action[]; mode: Mode;
  envoyer: (texte: string) => void; ecouter: (active: boolean) => void;
  cocher: (id: number) => void; ouvert: boolean; ouvrir: (open: boolean) => void;
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
  const envoyer = (texte: string) => {
    const demande = texte.trim();
    if (!demande) return;
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
  return <ShyrkaContext.Provider value={{ pret, sauvegarde, effacer: () => { clearTimeout(timer.current); setMessages([]); setActions([]); setDecisions([]); setMode("repos"); sequence.current = 0; }, pleinEcran, setPleinEcran, messages, actions, decisions, mode, envoyer, ecouter: (active) => { if (mode !== "parle") setMode(active ? "ecoute" : "repos"); }, cocher: (id) => setActions((prev) => prev.map((a) => a.id === id ? { ...a, faite: !a.faite } : a)), ouvert, ouvrir }}>{children}</ShyrkaContext.Provider>;
}

export function useShyrka() {
  const session = useContext(ShyrkaContext);
  if (!session) throw new Error("Shyrka doit être affichée dans sa session de démonstration.");
  return session;
}

export function PresenceShyrka({ compacte = false, seule = false, modeForce, paused = false }: { compacte?: boolean; seule?: boolean; modeForce?: Mode; paused?: boolean }) {
  const { mode: modeSession, setPleinEcran } = useShyrka();
  const mode = modeForce ?? modeSession;
  return <div className={`shyrka-presence ${compacte ? "shyrka-presence-small" : ""}`} data-mode={mode}>
    <div role="img" aria-label={`Présence de Shyrka, ${mode === "repos" ? "au repos" : mode === "ecoute" ? "en écoute" : "réponse simulée"}`}><ShyrkaParticles mode={mode} paused={paused} /></div>
    {!seule && <Button variant="ghost" size="icon" className="absolute right-2 top-2 size-12 text-shyrka-light hover:bg-shyrka-night hover:text-shyrka-light" onClick={() => setPleinEcran(true)} aria-label="Afficher la présence de Shyrka en plein écran" title="Afficher en plein écran"><Maximize /></Button>}
    {!seule && <span className="absolute bottom-4 left-4 text-xs text-shyrka-light">{mode === "repos" ? "Au repos" : mode === "ecoute" ? "À l’écoute" : "Réponse simulée"}</span>}
  </div>;
}

export function ConversationShyrka({ compacte = false }: { compacte?: boolean }) {
  const { messages, envoyer, ecouter, pret } = useShyrka();
  const [texte, setTexte] = useState("");
  const transcription = useRef<HTMLDivElement>(null);
  useEffect(() => { const el = transcription.current; if (el) el.scrollTop = el.scrollHeight; }, [messages]);
  return <div className="flex min-h-0 flex-1 flex-col">
    <div ref={transcription} role="log" aria-label="Conversation avec Shyrka" aria-live="polite" className={`flex-1 space-y-6 overflow-y-auto py-5 ${compacte ? "min-h-16" : "min-h-24"}`}>
      {messages.length === 0 ? <div className="text-sm"><p className="mb-2 text-xs text-tertiary">Shyrka · réponse simulée</p><p>Bonjour Mickaël. Qu'est-ce qu'on regarde aujourd'hui ?</p></div> : messages.map((m) => <div key={m.id} className="border-b border-border pb-5 last:border-0"><p className="mb-2 text-xs text-tertiary">{m.auteur}{m.auteur === "Shyrka" ? " · réponse simulée" : ""}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.texte}</p></div>)}
    </div>
    <div className="shrink-0 border-t border-border pt-3">
      <div className="mb-3 flex flex-col items-start gap-1">{commandesShyrka.map((c) => <Button key={c} variant="ghost" className="h-auto min-h-11 max-w-full justify-start whitespace-normal px-2 py-2 text-left text-xs font-normal text-muted-foreground" disabled={!pret} onClick={() => envoyer(c)}>{c}</Button>)}</div>
      <form onSubmit={(e) => { e.preventDefault(); envoyer(texte); setTexte(""); }} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2">
        <Input aria-label="Demander à Shyrka" placeholder="Demander à Shyrka" value={texte} onChange={(e) => setTexte(e.target.value)} onFocus={() => ecouter(true)} onBlur={() => ecouter(false)} className="min-h-11 min-w-0 text-base sm:text-sm" />
        <Button type="submit" variant="outline" size="icon" disabled={!pret || !texte.trim()} className="size-11 shrink-0" aria-label="Envoyer à Shyrka" title="Envoyer à Shyrka"><ArrowUp /></Button>
      </form>
      <p className="mt-3 text-xs text-tertiary">Réponses simulées · aucune action réelle.</p>
    </div>
  </div>;
}

const actionsPreparees = ["Quatre corrections Studio Ardoise, en attente de relecture", "Annexe technique Bpifrance, brouillon"];
export function JournalShyrka() {
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
      <PresenceShyrka compacte />
      <ConversationShyrka compacte />
      <div className="shrink-0"><SauvegardeShyrka compacte /><Button asChild variant="link" className="min-h-11 justify-start px-0 text-xs font-normal"><Link to="/shyrka" onClick={() => ouvrir(false)}>Ouvrir la conversation complète</Link></Button></div>
    </SheetContent></Sheet>
    <PresencePleinEcran />
  </>;
}
function PresencePleinEcran() {
  const { pleinEcran, setPleinEcran, mode } = useShyrka();
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
      <PresenceShyrka seule paused={pause} modeForce={mode === "parle" ? "parle" : microActif ? "ecoute" : "repos"} />
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
