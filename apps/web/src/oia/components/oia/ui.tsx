"use client";

import { Link, useRouter } from "@/lib/router";
import { useId, useRef, useState, type ReactNode } from "react";
import type { Etat } from "@/data/demo";
import { modulesPersonnels, modules } from "@/data/demo";
import { depenseDuMois } from "@/config/navigation";
import { Button } from "@/components/ui/button";
import { LockKeyhole, Menu, X } from "lucide-react";

export function Shell({ children, large = false, fictif = true }: { children: ReactNode; large?: boolean; fictif?: boolean }) {
  const [menuOuvert, setMenuOuvert] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const contenuId = useId();
  const router = useRouter();
  return <div className="oia-shell min-h-dvh bg-background text-foreground md:grid md:grid-cols-[230px_minmax(0,1fr)]">
    <a href={`#${contenuId}`} className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-background focus:p-3">Aller au contenu principal</a>
    <header className="sticky top-0 z-30 bg-background border-b border-border md:sticky md:top-0 md:h-dvh md:overflow-y-auto md:border-r md:border-b-0" onKeyDown={(e) => { if (e.key === "Escape" && menuOuvert) { e.preventDefault(); setMenuOuvert(false); menuButton.current?.focus(); } }}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center px-5 py-2 md:hidden"><Link to="/" aria-label="OIA, accueil" className="flex min-h-12 min-w-12 items-center text-[15px] font-medium">OIA</Link><Button ref={menuButton} variant="ghost" size="icon" className="size-12 shrink-0" aria-label={menuOuvert ? "Fermer le menu de navigation" : "Ouvrir le menu de navigation"} aria-expanded={menuOuvert} aria-controls="oia-navigation" onClick={() => setMenuOuvert((v) => !v)}>{menuOuvert ? <X /> : <Menu />}</Button></div>
      <div id="oia-navigation" className={`${menuOuvert ? "flex" : "hidden"} max-h-[calc(100dvh-64px)] overflow-y-auto flex-col px-5 pb-5 md:flex md:min-h-full md:max-h-none md:py-5`} onClickCapture={(e) => { if (e.target instanceof Element && e.target.closest("a")) { setMenuOuvert(false); if (window.matchMedia("(max-width: 767px)").matches) { const unsubscribe = router.subscribe("onResolved", () => { unsubscribe(); requestAnimationFrame(() => document.querySelector<HTMLElement>("main")?.focus()); }); } } }}>
        <Link to="/" className="mb-5 hidden min-h-11 items-center text-[15px] font-medium md:flex">OIA</Link>
        <nav aria-label="Navigation principale" className="flex flex-col">
          <Link to="/" className="flex min-h-11 items-center px-2 text-sm text-muted-foreground" activeProps={{ className: "text-foreground underline underline-offset-4" }} activeOptions={{ exact: true }}>Accueil</Link>
          {modules.map((m) => <Link key={m.slug} to={`/${m.slug}`} className="flex min-h-11 items-center gap-2 px-2 text-sm text-muted-foreground hover:text-foreground" activeProps={{ className: "text-foreground underline underline-offset-4" }}>
            <span aria-hidden="true" className={`size-2 shrink-0 bg-${m.couleur}`} /><span>{m.nom}</span><span className="sr-only">, {m.etat}</span><span className="ml-auto flex size-6 items-center justify-center" title={m.etat} aria-hidden="true"><span className={`size-1.5 rounded-full ${m.statut === "conforme" ? "bg-ok" : "bg-warn"}`} /></span>
          </Link>)}
        </nav>
        <section className="mt-5 border-t border-border pt-5"><h2 className="mb-2 flex items-center gap-2 text-xs text-tertiary">Personnel <LockKeyhole className="size-3" aria-label="Espace privé" /></h2>
          <nav aria-label="Personnel" className="flex flex-col">{modulesPersonnels.map((m) => <Link key={m.slug} to="/personnel/$module" params={{ module: m.slug }} className="flex min-h-11 flex-wrap items-center gap-2 px-2 text-sm text-muted-foreground" activeProps={{ className: "text-foreground underline underline-offset-4" }}><span className="size-2 bg-module-personnel" aria-hidden="true" /><span>{m.nom}</span><span className="ml-auto text-[10px] text-tertiary">En préparation</span></Link>)}</nav>
        </section>
        <nav aria-label="Assistante et réglages" className="mt-5 border-t border-border pt-3 md:mt-auto"><Link to="/shyrka" className="flex min-h-11 items-center px-2 text-sm text-muted-foreground" activeProps={{ className: "text-foreground underline underline-offset-4" }}>Shyrka</Link><Link to="/reglages" className="flex min-h-11 items-center px-2 text-sm text-muted-foreground" activeProps={{ className: "text-foreground underline underline-offset-4" }}>Réglages</Link></nav>
        <DepenseMois />
      </div>
    </header>
    <div className="min-w-0"><main id={contenuId} tabIndex={-1} className={`mx-auto px-5 py-10 md:px-10 md:py-14 ${large ? "max-w-[1600px]" : "max-w-6xl"}`}>{children}</main>{fictif && <footer className="mx-auto max-w-6xl px-5 pb-20 text-xs text-tertiary md:px-10">Exemple fictif, données de démonstration.</footer>}</div>
  </div>;
}

export function Fictif() {
  return <span className="text-xs text-tertiary">Exemple fictif</span>;
}

const etatLabel: Record<Etat, string> = { conforme: "Conforme", verifier: "À vérifier", bloquant: "Bloquant" };
const etatDot: Record<Etat, string> = { conforme: "bg-ok", verifier: "bg-warn", bloquant: "bg-block" };
export function Statut({ etat, label }: { etat: Etat; label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
      <span aria-hidden className={`size-1.5 rounded-full ${etatDot[etat]}`} />
      {label ?? etatLabel[etat]}
    </span>
  );
}

export function Section({ titre, aside, children }: { titre: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="card min-w-0 p-5 md:p-6">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <h2 className="text-base">{titre}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Barre({ label, v, max = 100 }: { label: string; v: number; max?: number }) {
  return (
    <div className="grid grid-cols-[minmax(6rem,11rem)_1fr_3rem] items-center gap-4 py-2 text-sm">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="h-1.5 rounded-full bg-track">
        <span className="block h-full rounded-full bg-bar" style={{ width: `${(v / max) * 100}%` }} />
      </span>
      <span className="num text-right">{v} %</span>
    </div>
  );
}

export const btnPrimary = "inline-flex min-h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40";
export const btnSecondary = "inline-flex min-h-11 items-center justify-center rounded-md border border-input bg-background px-5 text-sm text-foreground hover:bg-muted";
export const field = "min-h-11 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-ring";

export function Check({ label, checked, onChange, extra }: { label: string; checked: boolean; onChange: () => void; extra?: ReactNode }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b border-border py-2 text-sm last:border-0">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      <span className="flex-1">{label}</span>
      {extra}
    </label>
  );
}

/** Dépense du mois, toujours visible sous la colonne (mandat v7, F2). Démonstration signalée tant qu'aucune source sûre n'existe. */
export function DepenseMois() {
  const { montant, plafond, source } = depenseDuMois;
  return (
    <section aria-label="Dépense du mois" className="mt-3 border-t border-border px-2 pt-3">
      <p className="text-xs text-tertiary">Dépense du mois</p>
      <p className="num mt-1 text-sm"><span className="text-foreground">{montant} $</span><span className="text-tertiary"> sur {plafond} $</span></p>
      <div className="mt-2 h-1 rounded-full bg-track"><span className="block h-full rounded-full bg-bar" style={{ width: `${Math.min(100, (montant / plafond) * 100)}%` }} /></div>
      {source === "démonstration" && <p className="mt-1 text-[10px] text-tertiary">Exemple fictif · dépense réelle chez chaque fournisseur</p>}
    </section>
  );
}
