import { Link } from "@tanstack/react-router";
import type { CSSProperties, ReactNode } from "react";
import { ChartNoAxesCombined, FolderSearch, ListChecks, Plus, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell, Fictif, Section, Statut } from "@/components/oia/ui";
import { useDonnees } from "@/lib/donnees-visibility";
import { FaviconSource } from "@/components/oia/identites";
import { ClocheAlertes } from "@/components/oia/visibility-pilotage";
import { listeOngletsVisibility, menuVisibility } from "@/components/oia/visibility-ui";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { couleurScore } from "@/lib/donnees/visibility-v3";

export const ongletsVisibility = [
  { id: "overview", label: "Vue d'ensemble" }, { id: "visibilite", label: "Visibilité" }, { id: "part-de-voix", label: "Part de voix" },
  { id: "sentiment", label: "Sentiment" }, { id: "reponses", label: "Réponses" }, { id: "recherches", label: "Recherches" },
  { id: "citations", label: "Citations" }, { id: "reseaux", label: "Réseaux sociaux" },
  { id: "opportunites", label: "À corriger" }, { id: "recommandations", label: "Recommandations" }, { id: "performance", label: "Performance" },
  { id: "sites", label: "Sites et portefeuille" }, { id: "rapports", label: "Rapports" }, { id: "audits", label: "Audits externes" }, { id: "activite", label: "Activité du moteur" },
  { id: "reglages", label: "Réglages" }, { id: "seo-command", label: "SEO Command" },
] as const;

const groupes = [
  { label: "Résultats", icone: ChartNoAxesCombined, ids: ["overview", "visibilite", "part-de-voix", "sentiment", "reponses", "recherches", "citations", "reseaux"] },
  { label: "Agir", icone: ListChecks, ids: ["opportunites", "recommandations", "performance"] },
  { label: "Études", icone: FolderSearch, ids: ["sites", "rapports", "audits", "activite"] },
  { label: "Réglages", icone: SlidersHorizontal, ids: ["reglages", "seo-command"] },
] as const;

function lienOnglet(id: string) {
  if (id === "overview") return { to: "/visibility" as const };
  if (id === "sites") return { to: "/visibility/sites" as const };
  return { to: "/visibility/$onglet" as const, params: { onglet: id } };
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
        {selection.reel && <div className="mt-4 flex flex-wrap items-end gap-2"><label className="grid min-w-56 flex-1 gap-1.5 text-xs text-tertiary">Passer à un autre site<span className="relative"><select aria-label="Site affiché" className={menuVisibility} value={subject} onChange={(e) => selection.setSujetId(e.target.value)}>{sites.map((s) => <option key={s.id} value={s.id}>{s.nom}</option>)}</select></span></label><Button asChild variant="outline" className="min-h-11"><Link to="/visibility/sites" hash="ajouter-un-site"><Plus aria-hidden="true" />Ajouter un site</Link></Button></div>}
      </div></div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-center">
        <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.score) } as CSSProperties}><p className="text-xs">Visibilité dans les IA</p><p className="num mt-1 text-3xl">{score?.score ?? "Non mesuré"}<span className="text-xs"> / 100</span></p></div>
        <div className="carte-chiffre" style={{ "--carte-couleur": couleurScore(score?.score_site) } as CSSProperties}><p className="text-xs">Santé technique</p><p className="num mt-1 text-3xl">{score?.score_site ?? "Non mesuré"}<span className="text-xs"> / 100</span></p></div>
        <p className="col-span-2 text-xs text-tertiary sm:col-span-1 sm:max-w-32">Dernière mesure<br /><span className="text-muted-foreground">{date}</span></p>
      </div>
    </div>
  </section>;
}

export function VisibilityShell({ children, page = "Vue d’ensemble", active = "overview" }: { children: ReactNode; page?: string; active?: string }) {
  const { reel } = useDonnees();
  return <Shell fictif={!reel}>{!reel && <Fictif />}<nav aria-label="Fil d’Ariane" className="mt-5 flex flex-wrap items-center gap-2 text-xs text-tertiary"><Link to="/" aria-label="OIA, accueil" className="inline-flex min-h-12 min-w-12 items-center">OIA</Link><span aria-hidden="true">/</span><Link to="/visibility" className="inline-flex min-h-12 items-center px-1">Visibility</Link><span aria-hidden="true">/</span><span aria-current="page">{page}</span></nav><div className="mt-3 flex items-center justify-between gap-3"><h1 className="text-3xl font-medium tracking-[-0.02em]">Visibility</h1><ClocheAlertes /></div><BandeauSiteVisibility /><div className={`${listeOngletsVisibility} mt-6`}>{groupes.map((groupe) => { const Icone = groupe.icone; return <section className="visibility-nav-groupe" key={groupe.label}><h2><Icone className="size-4 text-module-visibility" aria-hidden="true" />{groupe.label}</h2><nav aria-label={groupe.label}>{groupe.ids.map((id) => { const tab = ongletsVisibility.find((t) => t.id === id)!; return <Link key={id} {...lienOnglet(id)} activeOptions={{ exact: true }} aria-current={active === id ? "page" : undefined}>{tab.label}</Link>; })}</nav></section>; })}</div>{children}</Shell>;
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
