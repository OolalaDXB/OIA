import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ajoutsVisibilityVides, avecReglagesVisibility, lireReglagesVisibility, sauverReglagesVisibility, type AjoutsVisibility } from "@/lib/visibility-reglages";
import { lireDemoAccueil, sourceAccueil, accueilVide, type DonneesAccueil } from "./accueil";
import { lireDemoMoney, sourceMoney, moneyVide, type DonneesMoney } from "./money";
import { lireDemoShyrka, sourceShyrka, shyrkaVide, type DonneesShyrka } from "./shyrka";
import { lireDemoVisibility, sourceVisibility, visibilityVide, type DonneesModuleVisibility, type SujetVisibility } from "./visibility";
import { useVisibilityReel } from "./visibility-reel";
import { chargerDonnees, resultatDonnees, type EtatDonnees, type SourceDonnees } from "./source";

type Modules = { accueil: DonneesAccueil; money: DonneesMoney; shyrka: DonneesShyrka; visibility: DonneesModuleVisibility };
export type ModuleDonnees = keyof Modules;
type Etats = { [K in ModuleDonnees]: EtatDonnees<Modules[K]> };
export type Sources = { [K in ModuleDonnees]: SourceDonnees<Modules[K]> };
const demo = { accueil: lireDemoAccueil(), money: lireDemoMoney(), shyrka: lireDemoShyrka(), visibility: lireDemoVisibility() };
const sourcesDemo: Sources = { accueil: sourceAccueil, money: sourceMoney, shyrka: sourceShyrka, visibility: sourceVisibility };
const initial: Etats = { accueil: resultatDonnees(demo.accueil, accueilVide), money: resultatDonnees(demo.money, moneyVide), shyrka: resultatDonnees(demo.shyrka, shyrkaVide), visibility: resultatDonnees(demo.visibility, visibilityVide) };
type SelectionVisibility = { reel: boolean; sujets: SujetVisibility[]; sujetId: string | null; setSujetId: (id: string) => void };
type ContexteSources = { etats: Etats; recharger: (module: ModuleDonnees) => void; selectionVisibility: SelectionVisibility };
const Ctx = createContext<ContexteSources>({ etats: initial, recharger: () => {}, selectionVisibility: { reel: false, sujets: [], sujetId: null, setSujetId: () => {} } });
type Reel = ReturnType<typeof useVisibilityReel>;
const ReelCtx = createContext<Reel | null>(null);
export function VisibilityReelProvider({ children }: { children: ReactNode }) {
  const reel = useVisibilityReel();
  return <ReelCtx.Provider value={reel}>{children}</ReelCtx.Provider>;
}
type ModificationReglages = (actuel: AjoutsVisibility) => AjoutsVisibility;
type ReglagesContexte = { ajouts: AjoutsVisibility; pret: boolean; erreur: boolean; modifier: (modification: ModificationReglages) => void };
const ReglagesCtx = createContext<ReglagesContexte | null>(null);
export function useReglagesVisibility() {
  const contexte = useContext(ReglagesCtx);
  if (!contexte) throw new Error("Les réglages Visibility nécessitent SourcesProvider.");
  return contexte;
}
export function useSelectionVisibility() { return useContext(Ctx).selectionVisibility; }

function useChargement<T>(source: SourceDonnees<T>, vide: (d: T) => boolean, revision: number, actifAuDepart: boolean): EtatDonnees<T> {
  const [etat, setEtat] = useState<EtatDonnees<T>>({ statut: "chargement" });
  useEffect(() => {
    if (!actifAuDepart && revision === 0) return;
    let actif = true;
    setEtat({ statut: "chargement" });
    void chargerDonnees(source, vide).then((r) => { if (actif) setEtat(r); });
    return () => { actif = false; };
  }, [source, vide, revision, actifAuDepart]);
  return etat;
}
function etatReel(reel: Reel | null): EtatDonnees<DonneesModuleVisibility> | null {
  if (!reel) return null;
  if (!reel.auth.user) return reel.auth.loading ? { statut: "chargement" } : null;
  if (reel.sujetsQuery.isPending) return { statut: "chargement" };
  if (reel.sujetsQuery.error) return { statut: "erreur", message: reel.sujetsQuery.error.message };
  if (!reel.sujets.length) return { statut: "acces", message: "Accès non accordé à Visibility pour ce compte." };
  if (!reel.sujetId || reel.donneesQuery.isPending) return { statut: "chargement" };
  if (reel.donneesQuery.error) return { statut: "erreur", message: reel.donneesQuery.error.message };
  return reel.donneesQuery.data ? { statut: "pret", donnees: reel.donneesQuery.data } : { statut: "chargement" };
}
/** Sources injectables pour les adaptateurs et les tests, démonstration synchrone par défaut. */
export function SourcesProvider({ children, sources = sourcesDemo }: { children: ReactNode; sources?: Sources }) {
  const [revisions, setRevisions] = useState({ accueil: 0, money: 0, shyrka: 0, visibility: 0 });
  const [ajouts, setAjouts] = useState<AjoutsVisibility>(ajoutsVisibilityVides);
  const [reglagesPrets, setReglagesPrets] = useState(false);
  const [erreurReglages, setErreurReglages] = useState(false);
  const reel = useContext(ReelCtx);
  useEffect(() => {
    setAjouts(lireReglagesVisibility(window.localStorage) ?? ajoutsVisibilityVides());
    setReglagesPrets(true);
  }, []);
  useEffect(() => {
    if (!reglagesPrets) return;
    setErreurReglages(!sauverReglagesVisibility(window.localStorage, ajouts));
  }, [ajouts, reglagesPrets]);

  const personnalise = sources !== sourcesDemo;
  const accueil = useChargement(sources.accueil, accueilVide, revisions.accueil, personnalise);
  const money = useChargement(sources.money, moneyVide, revisions.money, personnalise);
  const shyrka = useChargement(sources.shyrka, shyrkaVide, revisions.shyrka, personnalise);
  const visibility = useChargement(sources.visibility, visibilityVide, revisions.visibility, personnalise);
  const etatsBruts: Etats = { accueil: !personnalise && revisions.accueil === 0 ? initial.accueil : accueil, money: !personnalise && revisions.money === 0 ? initial.money : money, shyrka: !personnalise && revisions.shyrka === 0 ? initial.shyrka : shyrka, visibility: !personnalise && revisions.visibility === 0 ? initial.visibility : visibility };
  const etatVisibility = etatReel(reel) ?? etatsBruts.visibility;
  const etats: Etats = { ...etatsBruts, visibility: etatVisibility.statut === "pret" ? { ...etatVisibility, donnees: avecReglagesVisibility(etatVisibility.donnees, ajouts) } : etatVisibility };
  const reglages: ReglagesContexte = { ajouts, pret: reglagesPrets, erreur: erreurReglages, modifier: (modification) => setAjouts(modification) };
  const selectionVisibility: SelectionVisibility = { reel: Boolean(reel?.auth.user), sujets: reel?.sujets ?? [], sujetId: reel?.sujetId ?? null, setSujetId: (id) => reel?.setSujetId(id) };
  const recharger = (module: ModuleDonnees) => {
    if (module === "visibility" && reel?.auth.user) {
      if (reel.sujetsQuery.error) void reel.sujetsQuery.refetch();
      else void reel.donneesQuery.refetch();
      return;
    }
    setRevisions((r) => ({ ...r, [module]: r[module] + 1 }));
  };
  return <ReglagesCtx.Provider value={reglages}><Ctx.Provider value={{ etats, recharger, selectionVisibility }}>{children}</Ctx.Provider></ReglagesCtx.Provider>;
}
export function useEtatDonnees(module: ModuleDonnees) { const c = useContext(Ctx); return { etat: c.etats[module], recharger: () => c.recharger(module) }; }
function useModule<K extends ModuleDonnees>(module: K): Modules[K] { const e = useContext(Ctx).etats[module]; return e.statut === "pret" ? e.donnees : demo[module]; }
export const useAccueilDonnees = () => useModule("accueil");
export const useMoneyDonnees = () => useModule("money");
export const useShyrkaDonnees = () => useModule("shyrka");
export function useVisibilityDonnees(): DonneesModuleVisibility {
  const c = useContext(Ctx); const etat = c.etats.visibility;
  if (etat.statut === "pret") return etat.donnees;
  if (!c.selectionVisibility.reel) return demo.visibility;
  return {
    ...demo.visibility,
    reel: true,
    sites: [], agents: [], assistants: [], moteurs: [], plateformesMoteurs: [], questions: [], reponses: [], citations: [], reseaux: [], opportunites: [], rapports: [], comparaison: [], concurrents: [],
    fenetres: [{ id: "", label: "Aucune fenêtre", type: "", enCours: false }],
    familles: [],
    marque: { nom: "Visibility", sites: [], alias: [], profils: [] },
    depensesMoteurs: { ...demo.visibility.depensesMoteurs, observe: null, estimeGlobal: null },
    sujets: c.selectionVisibility.sujets,
    ...(c.selectionVisibility.sujetId ? { sujetActif: c.selectionVisibility.sujetId } : {}),
  };
}
