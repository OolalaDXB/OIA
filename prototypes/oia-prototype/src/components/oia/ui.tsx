import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { Etat } from "@/data/demo";

const nav = [
  { to: "/", label: "Accueil" },
  { to: "/sites/$slug", params: { slug: "studio-ardoise" }, label: "Visibility" },
  { to: "/seo-command", label: "SEO Command" },
  { to: "/funding", label: "Funding" },
  { to: "/reglages", label: "Réglages" },
] as const;

export function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 px-5 md:px-10">
          <Link to="/" className="flex min-h-11 items-center text-[15px] font-medium tracking-[-0.02em]">OIA</Link>
          <nav aria-label="Navigation principale" className="-mx-3 flex flex-1 overflow-x-auto">
            {nav.map((n) => (
              <Link key={n.to} to={n.to} {...("params" in n ? { params: n.params } : {})}
                className="flex min-h-11 items-center whitespace-nowrap px-3 text-sm text-muted-foreground hover:text-foreground"
                activeProps={{ className: "text-foreground underline underline-offset-[6px]" }}
                activeOptions={{ exact: n.to === "/" }}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 md:px-10 md:py-14">{children}</main>
      <footer className="mx-auto max-w-6xl px-5 pb-10 text-xs text-tertiary md:px-10">Exemple fictif — données de démonstration.</footer>
    </div>
  );
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
    <section className="card p-5 md:p-6">
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
