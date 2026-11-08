import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Shell, Fictif, Section, Statut } from "@/components/oia/ui";
import { useDonnees } from "@/lib/donnees-visibility";

export function VisibilityShell({ children, page = "Vue d’ensemble", active = "overview" }: { children: ReactNode; page?: string; active?: string }) {
  const { reel } = useDonnees();
  const tabs = ongletsVisibility;
  return <Shell fictif={!reel}>{!reel && <Fictif />}<nav aria-label="Fil d’Ariane" className="mt-5 flex flex-wrap items-center gap-2 text-xs text-tertiary"><Link to="/" aria-label="OIA, accueil" className="inline-flex min-h-12 min-w-12 items-center">OIA</Link><span aria-hidden="true">/</span><Link to="/visibility" className="inline-flex min-h-12 items-center px-1">Visibility</Link><span aria-hidden="true">/</span><span aria-current="page">{page}</span></nav><h1 className="mt-3 text-3xl">Visibility</h1><nav aria-label="Pages Visibility" className="mb-8 mt-6 flex gap-x-2 overflow-x-auto border-b border-border">{tabs.map((t) => <Link key={t.id} {...(t.id === "overview" ? { to: "/visibility" as const } : t.id === "sites" ? { to: "/visibility/sites" as const } : { to: "/visibility/$onglet" as const, params: { onglet: t.id } })} aria-current={active === t.id ? "page" : undefined} className={`inline-flex min-h-12 min-w-12 shrink-0 items-center whitespace-nowrap border-b-2 px-2 py-3 text-sm text-muted-foreground ${active === t.id ? "border-module-visibility text-foreground" : "border-transparent"}`}>{t.label}</Link>)}</nav>{children}</Shell>;
}
export const ongletsVisibility = [
  { id: "overview", label: "Vue d'ensemble" }, { id: "visibilite", label: "Visibilité" }, { id: "part-de-voix", label: "Part de voix" },
  { id: "sentiment", label: "Sentiment" }, { id: "reponses", label: "Réponses" }, { id: "recherches", label: "Recherches des assistants" },
  { id: "citations", label: "Citations" }, { id: "opportunites", label: "Opportunités de contenu" }, { id: "reseaux", label: "Réseaux sociaux" },
  { id: "recommandations", label: "Recommandations" }, { id: "rapports", label: "Rapports" }, { id: "sites", label: "Sites" },
  { id: "seo-command", label: "SEO Command" }, { id: "reglages", label: "Réglages" },
] as const;
export function SitesSuivis() {
  const { sites } = useDonnees();
  return <Section titre="Sites suivis"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-tertiary"><tr className="border-b border-border">{["Site", "Panel", "Mesure de départ", "Visibilité dans les IA", "Google"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead><tbody className="num">{sites.map((s) => <tr key={s.nom} className="border-b border-border last:border-0"><td className="py-3 pr-4"><Link to="/sites/$slug" params={{ slug: s.slug }} className="underline underline-offset-4">{s.nom}</Link><div className="text-tertiary">{s.url}</div></td><td className="pr-4 text-muted-foreground">{s.panel}</td><td className="pr-4 text-muted-foreground">{s.depart}</td><td className="pr-4">{s.ia === null ? <Statut etat="bloquant" label="Non mesuré" /> : `${s.ia} %`}</td><td className="text-muted-foreground">{s.google}</td></tr>)}</tbody></table></div></Section>;
}
export function SeoResume() {
  const { agents } = useDonnees();
  return <Section titre="SEO Command"><div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{agents.map((a) => <div key={a} className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm"><span>{a}</span><Statut etat="conforme" label="En veille" /></div>)}</div><dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-tertiary">File de missions</dt><dd className="mt-1">Vide</dd></div><div><dt className="text-tertiary">Planificateur</dt><dd className="mt-1">Désactivé</dd></div></dl></Section>;
}
export function AjouterCompte() { return <Button asChild className="mb-6 min-h-11"><Link to="/nouveau-compte">Ajouter un compte</Link></Button>; }
export function moduleHead(nom: string, description: string) { return { meta: [{ title: `${nom}, OIA` }, { name: "description", content: description }, { property: "og:title", content: `${nom}, OIA` }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; }
