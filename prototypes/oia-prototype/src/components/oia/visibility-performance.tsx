import { useState } from "react";
import { Section, Statut } from "@/components/oia/ui";
import { BarreColoree } from "@/components/oia/graphiques";
import { Button } from "@/components/ui/button";
import { BoutonAnalyse, EtatVisibilityV3 } from "@/components/oia/visibility-score";
import { FiltreSelect } from "@/components/oia/filtre-select";
import { useSelectionVisibility } from "@/lib/donnees/provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import {
  analyseRecente, analyseReussie, metrique, niveauSignal, opportunitesLighthouse,
  scoreLighthouse, type AnalyseV3, type NiveauSignal,
} from "@/lib/donnees/visibility-v3";
import { objet, texte } from "@/lib/donnees/visibility-pilotage";

const scoresLabels = [
  ["performance", "Performance"], ["seo", "SEO"], ["accessibilite", "Accessibilité"], ["bonnes_pratiques", "Bonnes pratiques"],
] as const;

const signaux = [
  { id: "lcp_ms", label: "LCP", description: "Affichage du contenu principal", bon: 2500, mauvais: 4000, format: (v: number) => `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s` },
  { id: "cls", label: "CLS", description: "Stabilité visuelle", bon: 0.1, mauvais: 0.25, format: (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 3 }) },
  { id: "tbt_ms", label: "TBT", description: "Temps de blocage total", bon: 200, mauvais: 600, format: (v: number) => `${Math.round(v).toLocaleString("fr-FR")} ms` },
  { id: "fcp_ms", label: "FCP", description: "Premier contenu affiché", bon: 1800, mauvais: 3000, format: (v: number) => `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s` },
] as const;

const niveauLabel: Record<NiveauSignal, string> = { bon: "Bon", a_ameliorer: "À améliorer", mauvais: "Mauvais" };
function EtatSignal({ niveau }: { niveau: NiveauSignal | null }) {
  if (!niveau) return <span className="text-xs text-muted-foreground">Non mesuré</span>;
  return <Statut etat={niveau === "bon" ? "conforme" : niveau === "a_ameliorer" ? "verifier" : "bloquant"} label={niveauLabel[niveau]} />;
}

function ErreurAnalyse({ analyse }: { analyse: AnalyseV3 | undefined }) {
  if (analyse?.statut !== "echec") return null;
  return <div role="alert" className="mb-5 rounded-md border border-border p-4"><p className="text-sm text-block">{analyse.erreur ?? "Analyse en échec, sans message d'erreur fourni."}</p><p className="mt-1 text-xs text-tertiary">Erreur de l'analyse affichée telle quelle.</p></div>;
}

function ScoresLighthouse({ analyse }: { analyse: AnalyseV3 | undefined }) {
  return <dl className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{scoresLabels.map(([id, label], index) => {
    const score = scoreLighthouse(analyse, id);
    return <div key={id} className="rounded-md border border-border p-4"><dt className="text-sm">{label}</dt><dd className="num mt-2 text-3xl">{score ?? "Non mesuré"}{score !== null && <span className="ml-1 text-sm text-tertiary">/ 100</span>}</dd><dd className="mt-3">{score === null ? <span className="block h-4 rounded-sm bg-track" /> : <BarreColoree label={label} largeur={score} detail={`${score} sur 100`} couleur={`var(--chart-${index + 1})`} />}</dd></div>;
  })}</dl>;
}

function SignauxWeb({ analyse }: { analyse: AnalyseV3 | undefined }) {
  return <Section titre="Signaux Web essentiels">
    <p className="mb-5 text-sm text-muted-foreground">Corrigez d'abord les signaux mauvais, puis ceux à améliorer, selon les seuils Google du contrat.</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{signaux.map((signal) => {
      const valeur = metrique(analyse, signal.id);
      const niveau = niveauSignal(valeur, signal.bon, signal.mauvais);
      return <div key={signal.id} className="rounded-md border border-border p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="text-sm">{signal.label}</h3><p className="mt-1 text-xs text-tertiary">{signal.description}</p></div><EtatSignal niveau={niveau} /></div><p className="num mt-4 text-2xl">{valeur === null ? "Non mesuré" : signal.format(valeur)}</p><p className="num mt-2 text-xs text-tertiary">Bon jusqu'à {signal.format(signal.bon)} · mauvais au-delà de {signal.format(signal.mauvais)}</p></div>;
    })}</div>
    <div className="mt-4 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-2"><div><p className="text-xs text-tertiary">Temps de réponse du serveur, TTFB</p><p className="num mt-1 text-xl">{metrique(analyse, "ttfb_ms") === null ? "Non mesuré" : `${metrique(analyse, "ttfb_ms")} ms`}</p><p className="mt-1 text-xs text-tertiary">Seuil non fourni par le contrat, aucune classification inventée.</p></div><div><p className="text-xs text-tertiary">Speed Index</p><p className="num mt-1 text-xl">{metrique(analyse, "si_ms") === null ? "Non mesuré" : `${(metrique(analyse, "si_ms")! / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s`}</p></div></div>
  </Section>;
}

function Opportunites({ analyse }: { analyse: AnalyseV3 | undefined }) {
  const opportunites = opportunitesLighthouse(analyse);
  const max = Math.max(1, ...opportunites.map((o) => o.gainMs));
  return <Section titre="Opportunités de gain">
    <p className="mb-5 text-sm text-muted-foreground">Les plus longues barres sont les gains de temps à traiter en premier sur cet appareil.</p>
    {opportunites[0] && <p className="carte-chiffre mb-5 text-sm" style={{ "--carte-couleur": "var(--chart-3)" } as React.CSSProperties}><strong className="num mr-2 text-xl">{(opportunites[0].gainMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s</strong>à gagner en priorité sur « {opportunites[0].titre} ».</p>}
    {opportunites.length === 0 ? <p className="text-sm text-muted-foreground">Aucune opportunité chiffrée dans cette analyse.</p> : <ol>{opportunites.map((o) => <li key={o.id} className="grid gap-2 border-b border-border py-3 last:border-0 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,1fr)_7rem] sm:items-center sm:gap-4"><span className="text-sm">{o.titre}</span><BarreColoree label={o.titre} largeur={o.gainMs / max * 100} detail={`${(o.gainMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s${o.gainKo !== null ? ` · ${o.gainKo} Ko` : ""}`} couleur="var(--chart-3)" /><span className="num text-sm sm:text-right">{(o.gainMs / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} s{o.gainKo !== null && <span className="block text-xs text-tertiary">{o.gainKo} Ko</span>}</span></li>)}</ol>}
    <dl className="mt-5 grid gap-4 border-t border-border pt-4 sm:grid-cols-2"><div><dt className="text-xs text-tertiary">Poids de la page</dt><dd className="num mt-1 text-xl">{metrique(analyse, "poids_ko") === null ? "Non mesuré" : `${metrique(analyse, "poids_ko")!.toLocaleString("fr-FR")} Ko`}</dd></div><div><dt className="text-xs text-tertiary">Nombre de requêtes</dt><dd className="num mt-1 text-xl">{metrique(analyse, "requetes") ?? "Non mesuré"}</dd></div></dl>
  </Section>;
}

function AuditLecture({ subject }: { subject: string }) {
  const { donnees } = useVisibilityV3();
  const recente = analyseRecente(donnees.analyses, subject, "crawl");
  const analyse = analyseReussie(donnees.analyses, subject, "crawl");
  const resultat = objet(analyse?.resultat ?? null);
  const metriques = objet(analyse?.metriques ?? null);
  return <Section titre="Audit de lecture des pages">
    <p className="mb-5 text-sm text-muted-foreground">Vérifiez que les moteurs lisent les pages, leurs données structurées et les prix sans dépendre de JavaScript.</p>
    <ErreurAnalyse analyse={recente} />
    {!analyse ? <p className="text-sm text-muted-foreground">Aucun audit de lecture réussi. Lancez une analyse pour le mesurer.</p> : <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5"><div><dt className="text-xs text-tertiary">Pages lues</dt><dd className="num mt-1 text-xl">{typeof metriques["pages"] === "number" ? metriques["pages"] : "Non mesuré"}</dd></div><div><dt className="text-xs text-tertiary">Pages indexables</dt><dd className="num mt-1 text-xl">{typeof metriques["indexables"] === "number" ? metriques["indexables"] : "Non mesuré"}</dd></div><div><dt className="text-xs text-tertiary">Robots</dt><dd className="mt-1 text-sm">{texte(resultat["robots"], "Non fourni")}</dd></div><div><dt className="text-xs text-tertiary">Données structurées</dt><dd className="mt-1 text-sm">{texte(resultat["donnees_structurees"], "Non fourni")}</dd></div><div><dt className="text-xs text-tertiary">Prix sans JavaScript</dt><dd className="mt-1 text-sm">{texte(resultat["prix_sans_js"], "Non fourni")}</dd></div></dl>}
  </Section>;
}

export function VuePerformance() {
  const { donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const subject = selection.sujetId ?? donnees.scores[0]?.subject_id ?? "studio-ardoise";
  const [strategie, setStrategie] = useState<"mobile" | "ordinateur">("mobile");
  const recente = analyseRecente(donnees.analyses, subject, "lighthouse", strategie);
  const analyse = analyseReussie(donnees.analyses, subject, "lighthouse", strategie);
  return <EtatVisibilityV3><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><label className="grid gap-1.5 text-xs text-tertiary">Appareil analysé<FiltreSelect value={strategie} onChange={(e) => setStrategie(e.target.value as "mobile" | "ordinateur")}><option value="mobile">Mobile</option><option value="ordinateur">Ordinateur</option></FiltreSelect></label><BoutonAnalyse subject={subject} /></div>
    <div className="grid gap-6"><Section titre={`Lighthouse ${strategie === "mobile" ? "mobile" : "ordinateur"}`} aside={<span className="text-xs text-tertiary">{analyse?.outil ?? "Outil non fourni"}</span>}>
      <p className="mb-5 text-sm text-muted-foreground">Un score faible indique le chantier à ouvrir, sans masquer les mesures absentes.</p><ErreurAnalyse analyse={recente} />{!analyse ? <p className="text-sm text-muted-foreground">Aucune analyse Lighthouse réussie pour cet appareil.</p> : <ScoresLighthouse analyse={analyse} />}{analyse?.url && <p className="mt-4 break-all text-xs text-tertiary">{analyse.url} · {analyse.recu_le}</p>}
    </Section><SignauxWeb analyse={analyse} /><Opportunites analyse={analyse} /><AuditLecture subject={subject} /></div>
  </EtatVisibilityV3>;
}
