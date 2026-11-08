import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ajoutsVisibilityVides, avecReglagesVisibility, lireReglagesVisibility, sauverReglagesVisibility, type AjoutsVisibility } from "@/lib/visibility-reglages";
import { lireDemoAccueil, sourceAccueil, accueilVide, type DonneesAccueil } from "./accueil";
import { lireDemoMoney, sourceMoney, moneyVide, type DonneesMoney } from "./money";
import { lireDemoShyrka, sourceShyrka, shyrkaVide, type DonneesShyrka } from "./shyrka";
import { lireDemoVisibility, sourceVisibility, visibilityVide, type DonneesModuleVisibility } from "./visibility";
import { chargerDonnees, resultatDonnees, type EtatDonnees, type SourceDonnees } from "./source";

type Modules = { accueil: DonneesAccueil; money: DonneesMoney; shyrka: DonneesShyrka; visibility: DonneesModuleVisibility };
export type ModuleDonnees = keyof Modules;
type Etats = { [K in ModuleDonnees]: EtatDonnees<Modules[K]> };
export type Sources = { [K in ModuleDonnees]: SourceDonnees<Modules[K]> };
const demo = { accueil: lireDemoAccueil(), money: lireDemoMoney(), shyrka: lireDemoShyrka(), visibility: lireDemoVisibility() };
const sourcesDemo: Sources = { accueil: sourceAccueil, money: sourceMoney, shyrka: sourceShyrka, visibility: sourceVisibility };
const initial: Etats = { accueil: resultatDonnees(demo.accueil, accueilVide), money: resultatDonnees(demo.money, moneyVide), shyrka: resultatDonnees(demo.shyrka, shyrkaVide), visibility: resultatDonnees(demo.visibility, visibilityVide) };
const Ctx = createContext<{ etats: Etats; recharger: (module: ModuleDonnees) => void }>({ etats: initial, recharger: () => {} });
type ModificationReglages = (actuel: AjoutsVisibility) => AjoutsVisibility;
type ReglagesContexte = { ajouts: AjoutsVisibility; pret: boolean; erreur: boolean; modifier: (modification: ModificationReglages) => void };
const ReglagesCtx = createContext<ReglagesContexte | null>(null);
export function useReglagesVisibility() {
  const contexte = useContext(ReglagesCtx);
  if (!contexte) throw new Error("Les réglages Visibility nécessitent SourcesProvider.");
  return contexte;
}

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
/** Sources injectables pour les futurs adaptateurs et les tests, démonstration synchrone par défaut. */
export function SourcesProvider({ children, sources = sourcesDemo }: { children: ReactNode; sources?: Sources }) {
  const [revisions, setRevisions] = useState({ accueil: 0, money: 0, shyrka: 0, visibility: 0 });
  const [ajouts, setAjouts] = useState<AjoutsVisibility>(ajoutsVisibilityVides);
  const [reglagesPrets, setReglagesPrets] = useState(false);
  const [erreurReglages, setErreurReglages] = useState(false);
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
  const etatVisibility = etatsBruts.visibility;
  const etats: Etats = { ...etatsBruts, visibility: etatVisibility.statut === "pret" ? { ...etatVisibility, donnees: avecReglagesVisibility(etatVisibility.donnees, ajouts) } : etatVisibility };
  const reglages: ReglagesContexte = { ajouts, pret: reglagesPrets, erreur: erreurReglages, modifier: (modification) => setAjouts(modification) };
  return <ReglagesCtx.Provider value={reglages}><Ctx.Provider value={{ etats, recharger: (module) => setRevisions((r) => ({ ...r, [module]: r[module] + 1 })) }}>{children}</Ctx.Provider></ReglagesCtx.Provider>;
}
export function useEtatDonnees(module: ModuleDonnees) { const c = useContext(Ctx); return { etat: c.etats[module], recharger: () => c.recharger(module) }; }
function useModule<K extends ModuleDonnees>(module: K): Modules[K] { const e = useContext(Ctx).etats[module]; return e.statut === "pret" ? e.donnees : demo[module]; }
export const useAccueilDonnees = () => useModule("accueil");
export const useMoneyDonnees = () => useModule("money");
export const useShyrkaDonnees = () => useModule("shyrka");
export const useVisibilityDonnees = () => useModule("visibility");