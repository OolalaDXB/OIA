import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Section, Statut } from "@/components/oia/ui";
import { BoutonAnalyse, EtatVisibilityV3 } from "@/components/oia/visibility-score";
import { libelleVisibility, listeSousOngletsVisibility, menuVisibility, ongletVisibility } from "@/components/oia/visibility-ui";
import { useSelectionVisibility, useVisibilityDonnees } from "@/lib/donnees/provider";
import { useVisibilityV3 } from "@/lib/donnees/visibility-v3-provider";
import { documentationConstat, trierConstats, type ConstatV3 } from "@/lib/donnees/visibility-v3";
import type { LigneVisibility } from "@/lib/donnees/visibility-reel";

type Recommandation = LigneVisibility<"vis_recommandations_v2">;
type Action = {
  id: string;
  titre: string;
  explication: string;
  correction: string;
  source: string;
  categorie: string;
  gravite: string;
  effort: string;
  qui: string;
  impact: string | null;
  valeur: string | null;
  documentation: string | null;
  etat: "ouvert" | "resolu";
  premiere: string | null;
  derniere: string | null;
  origine: ConstatV3 | Recommandation;
};

const sourceLabel: Record<string, string> = { lighthouse: "Lighthouse", crawl: "Audit Crawlie", indexation: "Indexation", mesure_ia: "Mesure IA" };
const categorieLabel: Record<string, string> = { performance: "Performance", seo: "SEO", accessibilite: "Accessibilité", bonnes_pratiques: "Bonnes pratiques", contenu: "Contenu", technique: "Technique", visibilite_ia: "Visibilité IA" };
const date = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeZone: "UTC" });
const jour = (valeur: string | null) => valeur ? date.format(new Date(valeur)) : "date non fournie";

function depuisConstat(constat: ConstatV3): Action {
  return {
    id: constat.id ?? constat.cle ?? crypto.randomUUID(), titre: constat.titre ?? "Constat sans titre",
    explication: constat.explication ?? "Explication non fournie.", correction: constat.correction ?? "Correction non fournie.",
    source: constat.source ?? "analyse", categorie: constat.categorie ?? "technique", gravite: constat.gravite ?? "non_precisee",
    effort: constat.effort ?? "non fourni", qui: constat.qui ?? "non_attribue", impact: constat.impact, valeur: constat.valeur,
    documentation: documentationConstat(constat), etat: constat.etat === "resolu" ? "resolu" : "ouvert",
    premiere: constat.premiere_fois, derniere: constat.derniere_fois, origine: constat,
  };
}

function depuisRecommandation(recommandation: Recommandation): Action {
  return {
    id: `recommandation-${recommandation.id ?? crypto.randomUUID()}`, titre: recommandation.titre ?? "Recommandation de mesure IA",
    explication: recommandation.enonce ?? "Cette recommandation vient de la mesure de visibilité dans les assistants.",
    correction: "Ouvrez la recommandation pour examiner la décision, la preuve d'exécution et la remesure.",
    source: "mesure_ia", categorie: "visibilite_ia", gravite: "non_precisee", effort: recommandation.effort ?? "non fourni",
    qui: "non_attribue", impact: recommandation.impact, valeur: null, documentation: null,
    etat: recommandation.execute_le ? "resolu" : "ouvert", premiere: recommandation.cree_le ?? null, derniere: recommandation.execute_le ?? null,
    origine: recommandation,
  };
}

function CarteAction({ action, resolus }: { action: Action; resolus: boolean }) {
  const recommandation = action.source === "mesure_ia";
  return <details className="group border-b border-border py-4 last:border-0">
    <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-3">
      <span className="min-w-0 flex-1"><span className="block text-sm">{action.titre}</span><span className="mt-1 block text-xs text-tertiary">{sourceLabel[action.source] ?? action.source} · {categorieLabel[action.categorie] ?? action.categorie} · effort {action.effort}</span></span>
      <Statut etat={resolus ? "conforme" : action.gravite === "critique" ? "bloquant" : action.gravite === "important" ? "verifier" : "conforme"} label={resolus ? recommandation ? "Exécutée" : "Résolu" : action.gravite === "non_precisee" ? "À examiner" : action.gravite} />
    </summary>
    <div className="mt-4 grid gap-5 border-t border-border pt-4 text-sm lg:grid-cols-2">
      <div><h4 className="text-xs text-tertiary">Pourquoi cela compte</h4><p className="mt-2 leading-relaxed text-muted-foreground">{action.explication}</p></div>
      <div><h4 className="text-xs text-tertiary">Comment corriger</h4><p className="mt-2 leading-relaxed">{action.correction}</p></div>
    </div>
    <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-4"><div><dt className="text-tertiary">Gain attendu</dt><dd className="mt-1">{libelleVisibility(action.impact, "Non chiffré")}</dd></div><div><dt className="text-tertiary">Valeur mesurée</dt><dd className="mt-1">{action.valeur ?? "Non fournie"}</dd></div><div><dt className="text-tertiary">Qui intervient</dt><dd className="mt-1">{action.qui === "equipe" ? "Équipe" : action.qui === "client" ? "Client" : "Non attribué"}</dd></div><div><dt className="text-tertiary">Suivi</dt><dd className="mt-1">{resolus ? recommandation ? `Exécutée le ${jour(action.derniere)}` : `Relevé du ${jour(action.premiere)} au ${jour(action.derniere)}, absent à l'analyse suivante` : `Première détection : ${jour(action.premiere)}`}</dd></div></dl>
    <div className="mt-4 flex flex-wrap gap-4 text-xs">{action.documentation && <a href={action.documentation} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center underline underline-offset-4">Documentation</a>}{recommandation && "id" in action.origine && <Link to="/visibility/$onglet" params={{ onglet: "recommandations" }} className="inline-flex min-h-11 items-center underline underline-offset-4">Ouvrir la recommandation et sa preuve</Link>}</div>
  </details>;
}

export function VueCorriger() {
  const { donnees } = useVisibilityV3();
  const selection = useSelectionVisibility();
  const { recommandationsV2 } = useVisibilityDonnees();
  const subject = selection.sujetId ?? donnees.scores[0]?.subject_id ?? "studio-ardoise";
  const [gravite, setGravite] = useState("toutes");
  const [categorie, setCategorie] = useState("toutes");
  const [qui, setQui] = useState("tous");
  const actions = useMemo(() => {
    const constats = trierConstats(donnees.constats.filter((c) => c.subject_id === subject)).map(depuisConstat);
    const recommandations = [...(recommandationsV2 ?? [])].sort((a, b) => (a.priorite ?? 99) - (b.priorite ?? 99)).map(depuisRecommandation);
    return [...constats, ...recommandations];
  }, [donnees.constats, recommandationsV2, subject]);
  const categories = [...new Set(actions.map((a) => a.categorie))].sort();
  const filtrer = (etat: "ouvert" | "resolu") => actions.filter((a) => a.etat === etat && (gravite === "toutes" || a.gravite === gravite) && (categorie === "toutes" || a.categorie === categorie) && (qui === "tous" || a.qui === qui));
  const liste = (etat: "ouvert" | "resolu") => {
    const lignes = filtrer(etat);
    return lignes.length === 0 ? <p className="py-5 text-sm text-muted-foreground">{etat === "resolu" ? "Aucun constat résolu ou recommandation exécutée pour ces filtres." : "Aucune action ouverte pour ces filtres."}</p> : <div>{lignes.map((a) => <CarteAction key={a.id} action={a} resolus={etat === "resolu"} />)}</div>;
  };
  return <EtatVisibilityV3><div className="mb-6 flex flex-wrap items-end justify-between gap-3"><p className="max-w-2xl text-sm text-muted-foreground">Chaque carte explique le problème et la correction. Les recommandations de mesure IA restent identifiables et renvoient à leur preuve.</p><BoutonAnalyse subject={subject} /></div>
    <div role="group" aria-label="Filtres des constats" className="mb-6 grid gap-3 sm:grid-cols-3"><label className="grid gap-1.5 text-xs text-tertiary">Gravité<select aria-label="Gravité" className={menuVisibility} value={gravite} onChange={(e) => setGravite(e.target.value)}><option value="toutes">Toutes</option><option value="critique">Critique</option><option value="important">Important</option><option value="mineur">Mineur</option><option value="non_precisee">Non précisée</option></select></label><label className="grid gap-1.5 text-xs text-tertiary">Catégorie<select aria-label="Catégorie" className={menuVisibility} value={categorie} onChange={(e) => setCategorie(e.target.value)}><option value="toutes">Toutes</option>{categories.map((c) => <option key={c} value={c}>{categorieLabel[c] ?? c}</option>)}</select></label><label className="grid gap-1.5 text-xs text-tertiary">Qui intervient<select aria-label="Qui intervient" className={menuVisibility} value={qui} onChange={(e) => setQui(e.target.value)}><option value="tous">Tous</option><option value="client">Client</option><option value="equipe">Équipe</option><option value="non_attribue">Non attribué</option></select></label></div>
    <Tabs defaultValue="ouverts"><TabsList aria-label="État des corrections" className={`${listeSousOngletsVisibility} h-auto rounded-none bg-transparent p-0`}><TabsTrigger value="ouverts" className={ongletVisibility}>Ouverts ({filtrer("ouvert").length})</TabsTrigger><TabsTrigger value="resolus" className={ongletVisibility}>Résolus ({filtrer("resolu").length})</TabsTrigger></TabsList><TabsContent value="ouverts"><Section titre="Actions à corriger en priorité">{liste("ouvert")}</Section></TabsContent><TabsContent value="resolus"><Section titre="Évolution d'une analyse à l'autre"><p className="mb-4 text-sm text-muted-foreground">Un constat résolu a disparu à l'analyse suivante. Une recommandation exécutée conserve sa date et sa preuve.</p>{liste("resolu")}</Section></TabsContent></Tabs>
  </EtatVisibilityV3>;
}
