import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { ChartNoAxesCombined, FolderSearch, LayoutDashboard, ListChecks, Plus, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, Fictif, Section, Statut } from "@/components/oia/ui";
import { useDonnees } from "@/lib/donnees-visibility";
import { FaviconSource } from "@/components/oia/identites";
import { ClocheAlertes } from "@/components/oia/visibility-pilotage";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { couleurScore } from "@/lib/donnees/visibility-v3";

export const ongletsVisibility = [
  { id: "overview", label: "Vue d'ensemble" }, { id: "plan", label: "Plan d'action" },
  { id: "visibilite", label: "Visibilité" }, { id: "part-de-voix", label: "Part de voix" }, { id: "concurrents", label: "Concurrents" },
  { id: "sentiment", label: "Sentiment" }, { id: "reponses", label: "Réponses" }, { id: "recherches", label: "Recherches" },
  { id: "citations", label: "Citations" }, { id: "reseaux", label: "Réseaux sociaux" }, { id: "performance", label: "Performance" }, { id: "contenu", label: "Qualité du contenu" }, { id: "indexation", label: "Indexation" },
  { id: "opportunites", label: "Plan d'action" }, { id: "recommandations", label: "Plan d'action" },
  { id: "audits", label: "Audits" }, { id: "rapports", label: "Rapports" }, { id: "activite", label: "Activité du moteur" }, { id: "etude", label: "Étude" },
  { id: "reglages", label: "Réglages" }, { id: "seo-command", label: "SEO Command" },
] as const;

/** Quatre entrées seulement par site ; Réglages est une icône en haut à droite. */
export const entreesSite = [
  { id: "overview", label: "Vue d'ensemble", icone: LayoutDashboard, sous: [] as string[], aussi: [] as string[] },
  { id: "plan", label: "Plan d'action", icone: ListChecks, sous: [], aussi: ["opportunites", "recommandations"] },
  { id: "resultats", label: "Résultats", icone: ChartNoAxesCombined, sous: ["visibilite", "part-de-voix", "sentiment", "reponses", "recherches", "citations", "reseaux", "performance", "contenu", "indexation"], aussi: ["concurrents"] },
  { id: "etudes", label: "Études", icone: FolderSearch, sous: ["audits", "rapports", "activite"], aussi: ["etude"] },
] as const;
const sousReglages = ["reglages", "seo-command"];
export function entreeActive(active: string) {
  if (sousReglages.includes(active)) return "reglages";
  return entreesSite.find((e) => e.id === active || (e.sous as readonly string[]).includes(active) || (e.aussi as readonly string[]).includes(active))?.id ?? "overview";
}
const libelleOnglet = (id: string) => ongletsVisibility.find((o) => o.id === id)?.label ?? id;

function lienOnglet(id: string) {
  if (id === "overview") return { to: "/visibility" as const };
  const e = entreesSite.find((x) => x.id === id);
  return { to: "/visibility/$onglet" as const, params: { onglet: e && e.sous.length ? e.sous[0]! : id } };
}

function useSiteCourant() {
  const selection = useSelectionVisibility();
  const { global } = useVisibilityPilotage();
  const { donnees } = useVisibilityV3();
  const vis = useDonnees();
  const subject = selection.sujetId ?? vis.sujetActif ?? donnees.scores[0]?.subject_id ?? "";
  const portfolio = global?.portefeuille.find((s) => s.subject_id === subject);
  const sujet = selection.sujets.find((s) => s.id === subject);
  const siteDemo = vis.sites.find((s) => s.slug === subject) ?? vis.sites[0];
  return { subject, nom: sujet?.nom ?? portfolio?.nom ?? siteDemo?.nom ?? "Site Visibility", adresse: portfolio?.site_url ?? sujet?.domaines[0] ?? siteDemo?.url ?? "" };
}

function BandeauSiteVisibility() {
  const selection = useSelectionVisibility();
  const { global } = useVisibilityPilotage();
  const { donnees } = useVisibilityV3();
  const vis = useDonnees();
  const subject = selection.sujetId ?? vis.sujetActif ?? donnees.scores[0]?.subject_id ?? "";
  const score = donnees.scores.find((s) => s.subject_id === subject);
  const portfolio = global?.portefeuille.find((s) => s.subject_id === subject);
  const sujet = selection.sujets.find((s) => s.id === subject);
  const siteDemo = vis.sites.find((s) => s.slug === subject) ?? vis.sites[0];
  const nom = sujet?.nom ?? portfolio?.nom ?? siteDemo?.nom ?? "Site Visibility";
  const adresse = portfolio?.site_url ?? sujet?.domaines[0] ?? siteDemo?.url ?? "";
  const date = score?.analyse_le ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" }).format(new Date(score.analyse_le)) : "Date non fournie";
  const sites = selection.reel ? selection.sujets : [];
  return <section aria-label="Site sélectionné" className="visibility-site-header mt-5 rounded-md p-5 md:p-6">
    <div className="grid gap-6 xl:grid-cols-[minmax(18rem,1.4fr)_minmax(24rem,1fr)] xl:items-center">
      <div className="flex min-w-0 items-start gap-4"><FaviconSource source={adresse} /><div className="min-w-0 flex-1"><p className="text-xs font-medium uppercase tracking-[0.12em] text-module-visibility">Site analysé</p><h2 className="mt-1 truncate text-2xl font-medium">{nom}</h2>{adresse && <p className="mt-1 truncate text-sm text-muted-foreground">{adresse}</p>}
        {selection.reel && <div className="mt-4 flex flex-wrap items-end gap-3"><label className="grid gap-1.5 text-xs text-tertiary">Passer à un autre site<FiltreSelect aria-label="Site affiché" value={subject} onChange={(e) => selection.setSujetId(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</FiltreSelect></label><Button asChild variant="outline" className="min-h-11"><Link to="/visibility" search={sansSite} hash="ajouter-un-site"><Plus aria-hidden="true" />Ajouter un site</Link></Button></div>}
      </div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.score) } as CSSProperties}><p className="text-xs">Visibilité dans les IA</p><p className="num mt-1 text-3xl">{score?.score ?? "Non mesuré"}<span className="text-xs"> / 100</span></p></div>
        <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.score_site) } as CSSProperties}><p className="text-xs">Santé technique</p><p className="num mt-1 text-3xl">{score?.score_site ?? "Non mesuré"}<span className="text-xs"> / 100</span></p></div>
        <p className="col-span-2 text-xs text-tertiary sm:col-span-1 sm:max-w-32">Dernière mesure<br /><span className="text-muted-foreground">{date}</span></p>
      </div>
    </div>
  </section>;
}

/** undefined explicite : retainSearchParams ne réinjecte pas le site. */
const sansSite = (prev: { site?: string; reglage?: string }) => ({ ...prev, site: undefined }) as unknown as { reglage?: string };

function FilAriane({ site, page }: { site?: string; page?: string }) {
  return <nav aria-label="Fil d’Ariane" className="mt-5 flex flex-wrap items-center gap-2 text-xs text-tertiary"><Link to="/" aria-label="OIA, accueil" className="inline-flex min-h-12 min-w-12 items-center">OIA</Link><span aria-hidden="true">/</span>
    {site ? <><Link to="/visibility" search={sansSite} className="inline-flex min-h-12 items-center px-1">Visibility</Link><span aria-hidden="true">›</span><Link to="/visibility" search={sansSite} className="inline-flex min-h-12 items-center px-1">Sites</Link><span aria-hidden="true">›</span>{page ? <><Link to="/visibility" className="inline-flex min-h-12 items-center px-1">{site}</Link><span aria-hidden="true">›</span><span aria-current="page">{page}</span></> : <span aria-current="page">{site}</span>}</>
      : <span aria-current="page">Visibility</span>}
  </nav>;
}

/** Accueil Visibility : liste des sites, sans navigation de site. */
export function VisibilityAccueilShell({ children }: { children: ReactNode }) {
  const { reel } = useDonnees();
  return <Shell fictif={!reel}>{!reel && <Fictif />}<FilAriane /><div className="mt-3 flex items-center justify-between gap-3"><h1 className="text-3xl font-medium tracking-[-0.02em]">Visibility</h1><ClocheAlertes /></div><div className="mt-6">{children}</div></Shell>;
}

export function VisibilityShell({ children, page, active = "overview" }: { children: ReactNode; page?: string; active?: string }) {
  const { reel } = useDonnees();
  const site = useSiteCourant();
  const entree = entreeActive(active);
  const sous = entree === "reglages" ? sousReglages : (entreesSite.find((e) => e.id === entree)?.sous ?? []) as readonly string[];
  const pageAriane = active === "overview" ? undefined : page ?? libelleOnglet(active);
  return <Shell fictif={!reel}>{!reel && <Fictif />}<FilAriane site={site.nom} {...(pageAriane ? { page: pageAriane } : {})} />
    <div className="mt-3 flex items-center justify-between gap-3"><h1 className="text-3xl font-medium tracking-[-0.02em]">Visibility</h1><div className="flex items-center gap-1"><ClocheAlertes /><Button asChild variant="ghost" size="icon" className={`size-11 ${entree === "reglages" ? "text-module-visibility" : ""}`}><Link to="/visibility/$onglet" params={{ onglet: "reglages" }} aria-label="Réglages" aria-current={entree === "reglages" ? "page" : undefined}><Settings aria-hidden="true" /></Link></Button></div></div>
    <BandeauSiteVisibility />
    <nav aria-label="Navigation du site" className="visibility-nav-site mt-6 flex gap-1 overflow-x-auto border-b border-border">{entreesSite.map((e) => { const Icone = e.icone; const actif = entree === e.id; return <Link key={e.id} {...lienOnglet(e.id)} activeOptions={{ exact: true, includeSearch: false }} aria-current={actif ? "page" : undefined} className={`inline-flex min-h-12 shrink-0 items-center gap-2 border-b-2 px-4 text-sm ${actif ? "border-module-visibility font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}><Icone className="size-4" aria-hidden="true" />{e.label}</Link>; })}</nav>
    {sous.length > 0 && <nav aria-label={entree === "reglages" ? "Réglages" : `Sous-onglets ${entreesSite.find((e) => e.id === entree)?.label ?? ""}`} className="mt-3 flex flex-wrap gap-1.5">{sous.map((id) => <Link key={id} to="/visibility/$onglet" params={{ onglet: id }} aria-current={active === id ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-md px-3 text-sm ${active === id ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{libelleOnglet(id)}</Link>)}</nav>}
    <div className="mt-8">{children}</div></Shell>;
}

export function SitesSuivis() {
  const { sites } = useDonnees();
  return <Section titre="Sites suivis"><div className="overflow-x-auto"><table className="w-full min-w-[640px] text-sm"><thead className="text-left text-tertiary"><tr className="border-b border-border">{["Site", "Panel", "Mesure de départ", "Visibilité dans les IA", "Google"].map((h) => <th key={h} className="py-2 pr-4 font-normal">{h}</th>)}</tr></thead><tbody className="num">{sites.map((s) => <tr key={s.nom} className="border-b border-border last:border-0"><td className="py-3 pr-4"><span className="flex items-center gap-2.5"><FaviconSource source={s.url} /><span><Link to="/sites/$slug" params={{ slug: s.slug }} className="underline underline-offset-4">{s.nom}</Link><div className="text-tertiary">{s.url}</div></span></span></td><td className="pr-4 text-muted-foreground">{s.panel}</td><td className="pr-4 text-muted-foreground">{s.depart}</td><td className="pr-4">{s.ia === null ? <span className="text-xs text-muted-foreground">Non mesurable<span className="block text-tertiary">Sélectionner le sujet pour lire sa mesure</span></span> : `${s.ia} %`}</td><td className="text-muted-foreground">{s.google}</td></tr>)}</tbody></table></div></Section>;
}
export function SeoResume() {
  const { agents, reel } = useDonnees();
  if (reel) return <Section titre="SEO Command"><p className="text-sm text-muted-foreground">Le journal SEO Command n'est pas inclus dans ce branchement de lecture.</p></Section>;
  return <Section titre="SEO Command"><div className="grid gap-x-6 sm:grid-cols-2 lg:grid-cols-3">{agents.map((a) => <div key={a} className="flex items-center justify-between gap-3 border-b border-border py-3 text-sm"><span>{a}</span><Statut etat="conforme" label="En veille" /></div>)}</div><dl className="mt-6 grid gap-5 text-sm sm:grid-cols-2"><div><dt className="text-tertiary">File de missions</dt><dd className="mt-1">Vide</dd></div><div><dt className="text-tertiary">Planificateur</dt><dd className="mt-1">Désactivé</dd></div></dl></Section>;
}
export function AjouterCompte() { return <Button asChild className="mb-6 min-h-11"><Link to="/nouveau-compte">Ajouter un compte</Link></Button>; }
export function moduleHead(nom: string, description: string) { return { meta: [{ title: `${nom}, OIA` }, { name: "description", content: description }, { property: "og:title", content: `${nom}, OIA` }, { property: "og:description", content: description }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }; }
