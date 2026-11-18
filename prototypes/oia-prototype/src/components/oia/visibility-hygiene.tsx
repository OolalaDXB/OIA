import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, ExternalLink, Minus, X } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Section, Statut } from "@/components/oia/ui";
import { EtatVisibilityV3, JaugeScore } from "@/components/oia/visibility-score";
import { ErreurGeste } from "@/components/oia/visibility-pilotage";
import { libelleVisibility } from "@/components/oia/visibility-ui";
import { useOiaAuth } from "@/lib/oia-auth";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useGesteVisibility, useVisibilityPilotage } from "@/lib/donnees/visibility-pilotage-provider";
import { objet, tableau, texte } from "@/lib/donnees/visibility-pilotage";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  actionGoogle, actionsHygiene, bingHygiene, googleHygiene, type ActionHygiene, type RequeteBing, controlesHygiene, delaiSuiviHygiene, demandeHygieneActive, explorationBing,
  hygieneDemo, lireHygieneVisibility, scoreIndexation, trierControlesHygiene, type ControleHygiene, DELAI_SUIVI_HYGIENE,
} from "@/lib/donnees/visibility-hygiene";

const dateLong = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "UTC" });
const dateHeure = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const date = (valeur: string | null | undefined, heure = false) => {
  if (!valeur) return "Date non fournie";
  const d = new Date(valeur.length === 10 ? `${valeur}T00:00:00Z` : valeur);
  return Number.isNaN(d.getTime()) ? valeur : (heure ? dateHeure : dateLong).format(d);
};
const nombre = (valeur: number | null) => valeur === null ? "Non mesuré" : valeur.toLocaleString("fr-FR");

function PreuveControle({ preuve }: { preuve: Json }) {
  if (preuve === null) return <p className="text-sm text-muted-foreground">Preuve non fournie.</p>;
  if (typeof preuve === "string" || typeof preuve === "number" || typeof preuve === "boolean") return <p className="whitespace-pre-wrap break-words text-sm">{String(preuve)}</p>;
  if (Array.isArray(preuve)) {
    const lignes = preuve.filter((p): p is string => typeof p === "string");
    return lignes.length ? <ul className="grid gap-1.5 text-sm">{lignes.map((page) => <li key={page} className="break-all">{page}</li>)}</ul> : <p className="text-sm text-muted-foreground">Preuve non fournie.</p>;
  }
  const detail = objet(preuve);
  const pages = [
    ...tableau<string>(detail["pages"] ?? null),
    ...tableau<string>(detail["adresses"] ?? null),
    ...tableau<string>(detail["urls"] ?? null),
    texte(detail["page"]), texte(detail["url"]),
  ].filter(Boolean);
  const autres = Object.entries(detail).filter(([cle, valeur]) => !["pages", "adresses", "urls", "page", "url"].includes(cle) && (typeof valeur === "string" || typeof valeur === "number" || typeof valeur === "boolean"));
  return <div className="grid gap-3 text-sm">
    {pages.length > 0 && <div><h4 className="text-xs text-tertiary">Pages en cause</h4><ul className="mt-1 grid gap-1.5">{[...new Set(pages)].map((page) => <li key={page} className="break-all">{page}</li>)}</ul></div>}
    {autres.map(([cle, valeur]) => <p key={cle}><span className="text-tertiary">{cle.replaceAll("_", " ")} : </span>{String(valeur)}</p>)}
    {!pages.length && !autres.length && <p className="text-muted-foreground">Preuve non fournie.</p>}
  </div>;
}

function LigneControle({ controle }: { controle: ControleHygiene }) {
  const Icone = controle.ok === true ? Check : controle.ok === false ? X : Minus;
  const etat = controle.ok === true ? "Conforme" : controle.ok === false ? "Écart" : "Non mesuré";
  return <details className="border-b border-border py-3 last:border-0">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-3">
      <span className={`flex size-7 shrink-0 items-center justify-center rounded-full ${controle.ok === true ? "bg-ok/15 text-ok" : controle.ok === false ? "bg-block/15 text-block" : "bg-muted text-muted-foreground"}`}><Icone className="size-4" aria-hidden="true" /><span className="sr-only">{etat}</span></span>
      <span className="min-w-0 flex-1"><span className="block text-sm">{controle.titre}</span><span className="mt-1 block text-xs text-tertiary">{controle.valeur ?? "Valeur non fournie"}{controle.gravite ? ` · ${libelleVisibility(controle.gravite)}` : ""}</span></span>
      <span className={`text-xs ${controle.ok === true ? "text-ok" : controle.ok === false ? "text-block" : "text-muted-foreground"}`}>{controle.ok === true ? "✓ conforme" : controle.ok === false ? "✗ écart" : "non mesuré"}</span>
    </summary>
    <div className="ml-0 mt-3 rounded-md bg-muted p-4 sm:ml-10"><PreuveControle preuve={controle.preuve} /></div>
  </details>;
}

function ListeActions({ actions }: { actions: ActionHygiene[] }) {
  return <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Actions faites par OIA</h3>{actions.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucune action d'indexation enregistrée.</p> : <ul className="mt-2">{actions.map((action, index) => <li key={`${action.action}-${index}`} className="border-b border-border py-3 text-sm last:border-0"><p>{action.action}</p>{action.cible && <p className="mt-1 break-all text-xs text-tertiary">{action.cible}</p>}{action.resultat && <p className="mt-1 text-xs text-muted-foreground">{action.resultat}</p>}</li>)}</ul>}</div>;
}

function TableRequetes({ titre, requetes, indisponible }: { titre: string; requetes: RequeteBing[]; indisponible: string | null }) {
  return <div className="min-w-0"><h3 className="text-sm font-medium">{titre}</h3>{indisponible ? <p className="mt-3 text-sm text-muted-foreground">{indisponible}</p> : requetes.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucune requête dans le dernier relevé.</p> : <div className="mt-3 overflow-x-auto"><table className="num w-full text-sm"><thead className="text-left text-xs text-tertiary"><tr className="border-b border-border"><th className="py-2 pr-4 font-normal">Requête</th><th className="py-2 pr-4 text-right font-normal">Impressions</th><th className="py-2 pr-4 text-right font-normal">Clics</th><th className="py-2 text-right font-normal">Position</th></tr></thead><tbody>{requetes.map((requete) => <tr key={requete.requete} className="border-b border-border last:border-0"><td className="py-3 pr-4">{requete.requete}</td><td className="py-3 pr-4 text-right">{nombre(requete.impressions)}</td><td className="py-3 pr-4 text-right">{nombre(requete.clics)}</td><td className="py-3 text-right">{requete.position === null ? "Non mesurée" : requete.position.toLocaleString("fr-FR")}</td></tr>)}</tbody></table></div>}</div>;
}

function indisponibiliteGoogle(hygiene: Parameters<typeof googleHygiene>[0]) {
  const google = googleHygiene(hygiene);
  return !google.present ? "Non mesurable : Google n'a pas encore été lu." : google.erreur ? "Indisponible : Google n'a pas pu être lu." : google.proprieteIntrouvable ? "Indisponible : propriété Search Console introuvable." : null;
}
function indisponibiliteBing(hygiene: Parameters<typeof bingHygiene>[0]) {
  const bing = bingHygiene(hygiene);
  return !bing.present ? "Non mesurable : aucune lecture Bing." : bing.erreur ? "Indisponible : Bing n'a pas pu être lu." : bing.verifie === false ? "Indisponible : site non vérifié dans Bing." : null;
}

function CarteGoogle({ hygiene }: { hygiene: Parameters<typeof googleHygiene>[0] }) {
  const google = googleHygiene(hygiene);
  const actions = actionsHygiene(hygiene).filter(actionGoogle);
  const lue = google.present && !google.erreur && !google.proprieteIntrouvable;
  return <Section titre="Google Search Console" aside={lue ? <Statut etat="conforme" label="Propriété lue" /> : google.proprieteIntrouvable ? <Statut etat="bloquant" label="Propriété introuvable" /> : undefined}>
    {!google.present ? <p className="text-sm text-muted-foreground">Non mesurable : aucune lecture Google dans le dernier contrôle.</p>
    : google.erreur ? <div role="alert" className="rounded-md border border-block bg-block/10 p-4"><p className="text-sm font-medium text-block">Google n'a pas pu être lu</p><p className="mt-2 whitespace-pre-wrap text-sm text-block">{google.erreur}</p></div>
    : google.proprieteIntrouvable ? <div className="rounded-md border border-warn bg-warn/10 p-4"><p className="text-sm">Aucune propriété Search Console ne couvre ce site. Ajoutez-la et donnez l'accès au compte de service d'OIA.</p><Button asChild variant="outline" className="mt-3 min-h-11"><a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Ouvrir Google Search Console<ExternalLink aria-hidden="true" /></a></Button></div>
    : <>
      <dl className="grid gap-x-5 sm:grid-cols-2"><div className="border-b border-border py-3"><dt className="text-xs text-tertiary">Propriété</dt><dd className="mt-1 break-all text-sm">{google.propriete}</dd></div><div className="border-b border-border py-3"><dt className="text-xs text-tertiary">Autorisation</dt><dd className="mt-1 text-sm">{google.autorisation ?? "Non fournie"}</dd></div></dl>
      <div className="mt-6"><h3 className="text-sm font-medium">Sitemaps</h3>{google.sitemaps.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucun sitemap déclaré dans Search Console.</p> : <ul className="mt-2">{google.sitemaps.map((s) => <li key={s.url} className="border-b border-border py-3 text-sm last:border-0"><p className="break-all">{s.url}</p><p className="num mt-1 text-xs text-tertiary">{nombre(s.soumises)} soumises · {nombre(s.indexees)} indexées{s.erreurs ? ` · ${s.erreurs} erreur${s.erreurs > 1 ? "s" : ""}` : ""}{s.avertissements ? ` · ${s.avertissements} avertissement${s.avertissements > 1 ? "s" : ""}` : ""}<br />Envoyé : {date(s.envoye, true)} · Lu : {date(s.lu, true)}</p></li>)}</ul>}</div>
      <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Pages inspectées</h3><p className="mt-1 text-xs text-tertiary">Échantillon de {google.inspection.length} page{google.inspection.length > 1 ? "s" : ""}, état dans l'index Google.</p>{google.inspection.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucune page inspectée.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-sm" aria-label="Pages inspectées par Google"><thead className="text-left text-xs text-tertiary"><tr className="border-b border-border"><th className="py-2 pr-4 font-normal">Page</th><th className="py-2 pr-4 font-normal">État</th><th className="hidden py-2 font-normal sm:table-cell">Dernier passage</th></tr></thead><tbody>{google.inspection.map((page) => <tr key={page.url} className="border-b border-border align-top last:border-0"><td className="py-3 pr-4"><span className="break-all">{page.url}</span><span className="mt-1 block text-xs text-tertiary sm:hidden">Dernier passage : {date(page.dernierPassage, true)}</span>{page.autreAdresse && <span className="mt-1 block"><span className="inline-block rounded-full bg-warn/15 px-2 py-0.5 text-xs text-foreground" title={`Google : ${page.canoniqueGoogle} · site : ${page.canoniqueSite}`}>Google choisit une autre adresse</span><span className="mt-1 block break-all text-xs text-tertiary">Google retient {page.canoniqueGoogle}</span></span>}</td><td className="w-[40%] py-3 pr-4">{page.indexee === true ? <span className="text-ok">✓ indexée</span> : page.indexee === false ? <span className="text-block">✗ {page.couverture ?? "Raison non fournie"}</span> : <span className="text-muted-foreground">Non mesuré</span>}</td><td className="hidden py-3 text-xs text-tertiary sm:table-cell">{date(page.dernierPassage, true)}</td></tr>)}</tbody></table></div>}</div>
    </>}
    <ListeActions actions={actions} />
  </Section>;
}

function CarteRequetes({ hygiene }: { hygiene: Parameters<typeof bingHygiene>[0] }) {
  return <Section titre="Principales requêtes" aside={<span className="text-xs text-tertiary">Google sur 28 jours · Bing</span>}><div className="grid gap-8 lg:grid-cols-2">
    <TableRequetes titre="Top requêtes Google" requetes={googleHygiene(hygiene).requetes} indisponible={indisponibiliteGoogle(hygiene)} />
    <TableRequetes titre="Top requêtes Bing" requetes={bingHygiene(hygiene).requetes} indisponible={indisponibiliteBing(hygiene)} />
  </div></Section>;
}

function CarteBing({ hygiene }: { hygiene: Parameters<typeof bingHygiene>[0] }) {
  const bing = bingHygiene(hygiene);
  const exploration = explorationBing(bing);
  return <Section titre="Bing Webmaster Tools" aside={bing.verifie === null ? undefined : <Statut etat={bing.verifie ? "conforme" : "bloquant"} label={bing.verifie ? "Site vérifié" : "Site non vérifié"} />}>
    {!bing.present ? <p className="text-sm text-muted-foreground">Non mesurable : aucune lecture Bing dans le dernier contrôle.</p> : <>
      {bing.site && <p className="mb-4 break-all text-sm text-muted-foreground">{bing.site}</p>}
      {bing.erreur ? <div role="alert" className="rounded-md border border-block bg-block/10 p-4"><p className="text-sm font-medium text-block">Bing n'a pas pu être lu</p><p className="mt-2 whitespace-pre-wrap text-sm text-block">{bing.erreur}</p></div> : bing.verifie === false ? <div className="rounded-md border border-warn bg-warn/10 p-4"><p className="text-sm">Ajouter et vérifier le site dans Bing Webmaster Tools</p><Button asChild variant="outline" className="mt-3 min-h-11"><a href="https://www.bing.com/webmasters" target="_blank" rel="noreferrer">Ouvrir Bing Webmaster Tools<ExternalLink aria-hidden="true" /></a></Button></div> : <>
        <div className="grid gap-6 lg:grid-cols-2">
          <div><h3 className="text-sm font-medium">Sitemaps</h3>{bing.feeds.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Aucun sitemap relevé par Bing.</p> : <ul className="mt-2">{bing.feeds.map((feed) => <li key={feed.url} className="border-b border-border py-3 text-sm last:border-0"><p className="break-all">{feed.url}</p><p className="mt-1 text-xs text-tertiary">{libelleVisibility(feed.statut, "Statut non fourni")} · {nombre(feed.adresses)} adresses<br />Dernier passage : {date(feed.dernierPassage, true)}</p></li>)}</ul>}</div>
          <div><h3 className="text-sm font-medium">Exploration</h3>{exploration.length === 0 ? <p className="mt-3 text-sm text-muted-foreground">Dernier relevé d'exploration non fourni.</p> : <dl className="mt-2 grid grid-cols-2 gap-x-5">{exploration.map((item) => <div key={item.cle} className="border-b border-border py-3"><dt className="text-xs text-tertiary">{item.label}</dt><dd className="num mt-1 text-sm">{["date", "dernier_releve"].includes(item.cle) ? date(item.valeur) : item.valeur}</dd></div>)}</dl>}</div>
        </div>
        <div className="mt-6 border-t border-border pt-5"><h3 className="text-sm font-medium">Problèmes d'exploration</h3><p className="num mt-2 text-sm">{nombre(bing.problemes.total)} problème{bing.problemes.total === 1 ? "" : "s"}</p>{bing.problemes.exemples.length > 0 ? <ul className="mt-2 grid gap-2 text-sm text-muted-foreground">{bing.problemes.exemples.map((exemple) => <li key={exemple} className="break-all border-l-2 border-warn pl-3">{exemple}</li>)}</ul> : <p className="mt-2 text-xs text-tertiary">Aucun exemple fourni.</p>}</div>
      </>}
    </>}
    <ListeActions actions={actionsHygiene(hygiene).filter((a) => !actionGoogle(a))} />
  </Section>;
}

export function VueIndexation() {
  const { connecte } = useVisibilityV3();
  const auth = useOiaAuth();
  const selection = useSelectionVisibility();
  const { global, globalQuery } = useVisibilityPilotage();
  const geste = useGesteVisibility();
  const [message, setMessage] = useState<string | null>(null);
  const subject = selection.sujetId ?? (connecte ? "" : hygieneDemo.subject_id);
  const userId = auth.user?.id ?? "";
  const query = useQuery({
    queryKey: ["visibility-hygiene", userId, subject],
    queryFn: () => lireHygieneVisibility(subject),
    enabled: Boolean(userId && subject) && !auth.loading,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const active = demandeHygieneActive(global?.demandes ?? [], subject);
  const delai = delaiSuiviHygiene(active);
  const refetch = useRef(query.refetch);
  const refetchGlobal = useRef(globalQuery.refetch);
  refetch.current = query.refetch;
  refetchGlobal.current = globalQuery.refetch;
  useEffect(() => {
    if (!connecte || delai === false) return;
    const minuteur = window.setInterval(() => { void refetch.current(); void refetchGlobal.current(); }, delai);
    return () => window.clearInterval(minuteur);
  }, [connecte, delai]);

  const hygiene = connecte ? query.data?.[0] : hygieneDemo;
  const controles = trierControlesHygiene(controlesHygiene(hygiene));
  const ecarts = hygiene?.ecarts_ouverts;
  async function controler() {
    if (!connecte || !subject || active) return;
    setMessage(null);
    try {
      await geste.executer("vis_demander_hygiene", { p_subject: subject });
      setMessage("Contrôle demandé. Le statut et les résultats seront relus automatiquement.");
    } catch { /* erreur RPC affichée telle quelle */ }
  }

  return <EtatVisibilityV3><div className="grid gap-6">
    <Section titre="Hygiène d'indexation" aside={<span className="text-xs text-tertiary">Site en ligne, Bing et Google</span>}>
      {connecte && query.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement du dernier contrôle d'indexation…</p> : <>
        {connecte && query.error && <div role="alert" className="mb-5 rounded-md border border-block p-4"><p className="text-sm text-block">{query.error.message}</p><Button variant="outline" className="mt-3 min-h-11" onClick={() => void query.refetch()}>Réessayer</Button></div>}
        <div className="grid gap-6 md:grid-cols-[auto_minmax(0,1fr)] md:items-center">
          <JaugeScore score={scoreIndexation(hygiene)} petite />
          <div><h3 className="text-xl font-medium">Score d'indexation</h3><p className="mt-2 text-sm text-muted-foreground">Dernier contrôle : {date(hygiene?.recu_le, true)}</p><p className="num mt-1 text-sm text-muted-foreground">{ecarts === null || ecarts === undefined ? "Écarts ouverts non mesurés" : `${ecarts} écart${ecarts > 1 ? "s" : ""} ouvert${ecarts > 1 ? "s" : ""}`}</p><p className="mt-2 break-all text-xs text-tertiary">{hygiene?.url ?? "Aucun contrôle enregistré pour ce site."}</p></div>
        </div>
        <div className="mt-6 border-t border-border pt-5"><Button className="min-h-11" disabled={!connecte || !subject || geste.enCours || Boolean(active)} title={!connecte ? "Connectez-vous pour demander un contrôle réel" : "Contrôle gratuit"} onClick={() => void controler()}>{geste.enCours ? "Demande en cours…" : active?.statut === "RUNNING" ? "Contrôle en cours" : active?.statut === "QUEUED" ? "Contrôle en file" : "Contrôler maintenant"}</Button><span className="ml-3 text-xs text-tertiary">Gratuit · le moteur contrôle aussi le site une fois par jour</span>
          {!connecte && <p className="mt-2 text-xs text-tertiary">Connexion requise pour lancer un contrôle réel.</p>}
          {active && <p role="status" className="mt-3 text-sm text-muted-foreground">Demande HYGIENE {libelleVisibility(active.statut).toLocaleLowerCase("fr-FR")} · actualisation toutes les {DELAI_SUIVI_HYGIENE / 1000} secondes.</p>}
          {message && <p role="status" className="mt-3 text-sm text-muted-foreground">{message}</p>}<ErreurGeste erreur={geste.erreur} />
        </div>
      </>}
    </Section>
    {(!connecte || !query.isPending) && <>
      <Section titre="Liste de contrôle" aside={<span className="num text-sm text-tertiary">{controles.length} contrôle{controles.length > 1 ? "s" : ""}</span>}><p className="mb-4 text-sm text-muted-foreground">Les écarts apparaissent en premier, triés par gravité. Ouvrez une ligne pour voir les pages en cause.</p>{controles.length === 0 ? <p className="text-sm text-muted-foreground">Aucun contrôle mesuré pour ce site.</p> : <div>{controles.map((controle) => <LigneControle key={controle.id} controle={controle} />)}</div>}</Section>
      <CarteBing hygiene={hygiene} />
      <CarteGoogle hygiene={hygiene} />
      <CarteRequetes hygiene={hygiene} />
    </>}
  </div></EtatVisibilityV3>;
}
