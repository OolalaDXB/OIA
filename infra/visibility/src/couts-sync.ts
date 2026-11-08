/**
 * Dépenses d'IA vers la base OIA (migration 0009, table oia_ia_cout ; contrat
 * prototypes/oia-prototype/CONTRAT_VIS_COUTS_V1.md). Produit un script SQL
 * appliqué en une transaction par scripts/couts-sync.sh, chaque jour depuis le
 * Mac (tâche quotidienne de la fenêtre). Aucun appel à un fournisseur d'IA.
 *
 * Lignes écrites (les mois couverts par les données sont remplacés en entier) :
 *   - Visibility, une par marque, mois et cible configurée dans Elmo : coût
 *     ESTIMÉ par la grille de prix (src/cost-grid.ts) sur les runs du mois ;
 *     pas de coût retenu par modèle (le garde-fou n'est pas ventilé) ;
 *   - Visibility, ligne agrégée du garde-fou (assistant et modèle NULL) : coût
 *     RETENU, dernier relevé du mois de cost-journal.csv ;
 *   - Visibility, Jev (jugements) : non compté, sans compteur ni grille ;
 *   - Money Lookup, veille (discovery.yml : scout puis analyste, Mistral) :
 *     estimée d'après les jetons publiés dans les rapports commités ; ni
 *     retenue ni plafonnée, donc « partiel ».
 * money-match et shyrka ne sont jamais écrits : la vue lit leur compteur de
 * budget en base.
 *
 * CLI : tsx src/couts-sync.ts <entrees.json> > couts.sql
 *       tsx src/couts-sync.ts --rapport <date> < rapport.md (une ligne JSON)
 */
import { readFileSync } from "node:fs";
import { PRICE_GRID, findPrice, runCostUsd, type RunRecord } from "./cost-grid.js";
import { defaultSubjectsDir, loadSubjects } from "./load.js";
import type { SubjectBundle } from "./schema.js";

export const ESPACE_STUDIO = "00000000-0000-4000-8000-000000000001";
const PERIMETRE_ELMO = "elmo (Visibility, plafond du garde-fou)";
const SOURCE_GRILLE = "grille de prix OIA (infra/visibility/src/cost-grid.ts) sur les runs d'Elmo du mois";
const SOURCE_JOURNAL = "journal du garde-fou (~/oia-visibility-data/cost-journal.csv), dernier relevé du mois";
/** Prix retenu pour l'alias `mistral-large-latest` de la veille (hypothèse : alias de mistral-large-4). */
const PRIX_VEILLE = { modele: "mistral-large-latest", grille: "mistral-large-4" } as const;

export interface ElmoRun extends RunRecord {
  brand: string;
  /** Moteur d'Elmo (chatgpt, claude…). */
  model: string;
  /** Mois UTC, AAAA-MM-01. */
  month: string;
}

export interface Entrees {
  now: string;
  /** Contenu de cost-journal.csv. */
  journal: string;
  elmo: {
    brands: { id: string; enabledModels: string[]; promptsEnabled: number }[];
    runs: ElmoRun[];
  };
  /** Rapports de la veille, un par run de discovery.yml (date du commit). */
  veille: { date: string; appels: number; jetonsEntree: number; jetonsSortie: number }[];
}

export interface Ligne {
  module: "visibility" | "money_lookup";
  service: string;
  marque_id: string | null;
  mois: string;
  assistant: string | null;
  fournisseur: string | null;
  modele: string | null;
  version: string;
  voie_acces: "api_directe" | "openrouter" | "toutes";
  suivi: boolean;
  nb_questions: number | null;
  frequence: string | null;
  nb_reponses_prevues: number | null;
  nb_reponses: number | null;
  nb_appels: number | null;
  unite_volume: "reponse" | "appel";
  cout_estime_par_reponse_usd: number | null;
  cout_estime_mois_usd: number | null;
  cout_retenu_mois_usd: number | null;
  plafond_mois_usd: number | null;
  plafond_perimetre: string;
  depense_budget_mois_usd: number | null;
  reserve_budget_mois_usd: number | null;
  seuil_alerte_usd: number | null;
  alerte_budget: boolean | null;
  statut_comptage: "compte" | "partiel" | "non_compte";
  source_cout: string;
}

const FOURNISSEUR: Record<string, string> = { "openai-api": "openai", "anthropic-api": "anthropic", "mistral-api": "mistral", openrouter: "openrouter" };
const mois = (iso: string) => `${iso.slice(0, 7)}-01`;
const arrondi = (n: number) => Math.round(n * 1e6) / 1e6;

/** Dernier relevé du garde-fou par mois : coût retenu, plafond et seuil (colonnes illisibles ignorées). */
export function journalParMois(csv: string): Map<string, { retenu: number; plafond: number; seuil: number }> {
  const [entete, ...lignes] = csv.trim().split("\n");
  const cols = (entete ?? "").split(",");
  const at = (c: string) => cols.indexOf(c);
  const out = new Map<string, { retenu: number; plafond: number; seuil: number }>();
  for (const l of lignes) {
    const v = l.split(",");
    const retenu = Number(v[at("retained_usd")]);
    if (!Number.isFinite(retenu)) continue;
    out.set(`${v[at("month_utc")]}-01`, { retenu, plafond: Number(v[at("cap_usd")]), seuil: Number(v[at("alert_usd")]) });
  }
  return out;
}

/** Jours d'une fenêtre qui tombent dans un mois UTC. */
function joursDansLeMois(start: string, days: number, m: string): number {
  let n = 0;
  for (let i = 0; i < days; i++) if (mois(new Date(Date.parse(`${start}T00:00:00Z`) + i * 864e5).toISOString()) === m) n++;
  return n;
}

/** Nombre de lundis d'un mois (discovery.yml : le lundi à 06:00 UTC). */
function lundis(m: string): number {
  const d = new Date(`${m}T00:00:00Z`);
  let n = 0;
  for (; d.getUTCMonth() === new Date(`${m}T00:00:00Z`).getUTCMonth(); d.setUTCDate(d.getUTCDate() + 1)) if (d.getUTCDay() === 1) n++;
  return n;
}

export function lignes(e: Entrees, sujets: SubjectBundle[]): Ligne[] {
  const out: Ligne[] = [];
  const journal = journalParMois(e.journal);
  const moisElmo = new Set([...e.elmo.runs.map((r) => r.month), ...journal.keys()]);
  for (const m of [...moisElmo].sort()) {
    const j = journal.get(m);
    const budget = {
      plafond_mois_usd: j?.plafond ?? null,
      plafond_perimetre: PERIMETRE_ELMO,
      depense_budget_mois_usd: j ? arrondi(j.retenu) : null,
      reserve_budget_mois_usd: null,
      seuil_alerte_usd: j?.seuil ?? null,
      // Contrat : alerte strictement au-delà du seuil.
      alerte_budget: j ? j.retenu > j.seuil : null,
    };
    const runsDuMois = e.elmo.runs.filter((r) => r.month === m);
    for (const brand of e.elmo.brands) {
      const sujet = sujets.find((s) => s.subject.id === brand.id);
      const fenetres = (sujet?.measurement.windows ?? []).filter((w) => w.status !== "planned" && w.start && w.targets?.length);
      const cibles = new Map<string, string[]>(); // cible → fenêtres
      for (const w of fenetres) if (joursDansLeMois(w.start!, w.days, m) > 0) for (const t of w.targets!) cibles.set(t, [...(cibles.get(t) ?? []), w.id]);
      const prevuesParCible = (t: string) =>
        fenetres.filter((w) => w.targets!.includes(t)).reduce((n, w) => n + joursDansLeMois(w.start!, w.days, m) * brand.promptsEnabled, 0);
      // Une ligne par cible suivie, plus une par moteur activé dans Elmo mais hors fenêtre.
      const suivies = [...cibles.keys()].map((t) => {
        const [moteur, fournisseurElmo, ...reste] = t.split(":");
        return { moteur: moteur!, fournisseurElmo: fournisseurElmo!, modele: reste.filter((x) => x !== "online").join(":"), cible: t };
      });
      const nonSuivis = brand.enabledModels.filter((mo) => !suivies.some((s) => s.moteur === mo));
      for (const s of suivies) {
        const runs = runsDuMois.filter((r) => r.brand === brand.id && r.model === s.moteur && r.provider === s.fournisseurElmo);
        const couts = runs.map((r) => runCostUsd(r)?.usd).filter((x): x is number => x !== undefined);
        const parReponse = couts.length ? couts.reduce((a, b) => a + b, 0) / couts.length : null;
        const prevues = prevuesParCible(s.cible);
        const versions = [...new Set(runs.map((r) => r.version))];
        out.push({
          module: "visibility", service: "elmo", marque_id: brand.id, mois: m,
          assistant: s.moteur, fournisseur: FOURNISSEUR[s.fournisseurElmo] ?? null, modele: s.modele,
          version: versions.length === 1 ? versions[0]! : "non renseignée",
          voie_acces: s.fournisseurElmo === "openrouter" ? "openrouter" : "api_directe",
          suivi: true, nb_questions: brand.promptsEnabled,
          frequence: `quotidienne : une réponse par question et par jour (fenêtre ${cibles.get(s.cible)!.join(", ")})`,
          nb_reponses_prevues: prevues, nb_reponses: runs.length, nb_appels: null, unite_volume: "reponse",
          cout_estime_par_reponse_usd: parReponse === null ? null : arrondi(parReponse),
          cout_estime_mois_usd: parReponse === null ? null : arrondi(parReponse * prevues),
          cout_retenu_mois_usd: null,
          ...budget,
          statut_comptage: couts.length === runs.length ? "compte" : "partiel",
          source_cout: couts.length === runs.length ? SOURCE_GRILLE : `${SOURCE_GRILLE} ; ${runs.length - couts.length} run(s) d'un modèle absent de la grille`,
        });
      }
      for (const mo of nonSuivis)
        out.push({
          module: "visibility", service: "elmo", marque_id: brand.id, mois: m, assistant: mo, fournisseur: null, modele: null,
          version: "non renseignée", voie_acces: "toutes", suivi: false, nb_questions: brand.promptsEnabled, frequence: null,
          nb_reponses_prevues: 0, nb_reponses: runsDuMois.filter((r) => r.brand === brand.id && r.model === mo).length, nb_appels: null, unite_volume: "reponse",
          cout_estime_par_reponse_usd: null, cout_estime_mois_usd: null, cout_retenu_mois_usd: null, ...budget,
          statut_comptage: "non_compte", source_cout: "moteur activé dans Elmo, hors des cibles de la fenêtre : coût à valider avant ajout",
        });
    }
    // Ligne agrégée du garde-fou : tout Elmo, sans ventilation par marque ni par modèle.
    out.push({
      module: "visibility", service: "elmo", marque_id: null, mois: m, assistant: null, fournisseur: null, modele: null,
      version: "non renseignée", voie_acces: "toutes", suivi: true, nb_questions: null, frequence: null, nb_reponses_prevues: null,
      nb_reponses: runsDuMois.length, nb_appels: null, unite_volume: "reponse",
      cout_estime_par_reponse_usd: null, cout_estime_mois_usd: null, cout_retenu_mois_usd: j ? arrondi(j.retenu) : null, ...budget,
      statut_comptage: j ? "compte" : "non_compte",
      source_cout: j ? `${SOURCE_JOURNAL} : max(estimation Elmo, grille, cumul OpenRouter, relevé manuel)` : "aucun relevé du garde-fou ce mois-ci",
    });
    out.push({
      module: "visibility", service: "jev", marque_id: null, mois: m, assistant: "jev", fournisseur: "typesafe", modele: null,
      version: "non renseignée", voie_acces: "api_directe", suivi: true, nb_questions: null, frequence: null, nb_reponses_prevues: null,
      nb_reponses: null, nb_appels: null, unite_volume: "appel",
      cout_estime_par_reponse_usd: null, cout_estime_mois_usd: null, cout_retenu_mois_usd: null, ...budget,
      statut_comptage: "non_compte", source_cout: "jugements de Jev (TypeSafe en direct) : ni compteur ni grille ; seulement par le relevé de la facture TypeSafe",
    });
  }
  // Veille de Money Lookup : jetons publiés par chaque run, prix de la grille.
  const prix = PRICE_GRID.find((p) => p.id === PRIX_VEILLE.grille)!;
  const coutRun = (v: Entrees["veille"][number]) => (v.jetonsEntree * prix.inputPerMTok + v.jetonsSortie * prix.outputPerMTok) / 1e6;
  for (const m of [...new Set(e.veille.map((v) => mois(v.date)))].sort()) {
    const runs = e.veille.filter((v) => mois(v.date) === m);
    const moyenne = runs.reduce((a, v) => a + coutRun(v), 0) / runs.length;
    out.push({
      module: "money_lookup", service: "veille-money", marque_id: null, mois: m, assistant: "mistral", fournisseur: "mistral",
      modele: PRIX_VEILLE.modele, version: "non renseignée", voie_acces: "api_directe", suivi: true,
      nb_questions: null, frequence: "hebdomadaire (discovery.yml, le lundi à 06:00 UTC)", nb_reponses_prevues: null, nb_reponses: null,
      nb_appels: runs.reduce((a, v) => a + v.appels, 0), unite_volume: "appel",
      cout_estime_par_reponse_usd: null, cout_estime_mois_usd: arrondi(moyenne * Math.max(lundis(m), runs.length)), cout_retenu_mois_usd: null,
      plafond_mois_usd: null, plafond_perimetre: "aucun plafond (veille de Money Lookup)", depense_budget_mois_usd: null,
      reserve_budget_mois_usd: null, seuil_alerte_usd: null, alerte_budget: null, statut_comptage: "partiel",
      source_cout: `estimé : jetons des rapports outputs/scout et outputs/analyst (${runs.length} run(s) ce mois), prix ${prix.id} (${prix.inputPerMTok} $ / ${prix.outputPerMTok} $ par M de jetons) supposé pour l'alias ${PRIX_VEILLE.modele}, × lundis du mois ; ni retenu ni plafonné`,
    });
  }
  return out;
}

const q = (v: unknown): string => (v === null || v === undefined ? "null" : typeof v === "number" || typeof v === "boolean" ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const COLONNES: (keyof Ligne)[] = [
  "module", "service", "marque_id", "mois", "assistant", "fournisseur", "modele", "version", "voie_acces", "suivi", "nb_questions", "frequence",
  "nb_reponses_prevues", "nb_reponses", "nb_appels", "unite_volume", "cout_estime_par_reponse_usd", "cout_estime_mois_usd", "cout_retenu_mois_usd",
  "plafond_mois_usd", "plafond_perimetre", "depense_budget_mois_usd", "reserve_budget_mois_usd", "seuil_alerte_usd", "alerte_budget", "statut_comptage", "source_cout",
];

/** Script transactionnel : les mois couverts sont remplacés en entier, pour les seuls services alimentés ici. */
export function sqlCouts(ls: Ligne[], now: string): string {
  const parMois = [...new Set(ls.map((l) => `${l.mois}|${l.service}`))];
  const L = [`-- dépenses d'IA · ${ls.length} ligne(s) · ${now}`, "begin;"];
  for (const k of parMois) {
    const [m, s] = k.split("|");
    L.push(`delete from public.oia_ia_cout where espace_id = '${ESPACE_STUDIO}' and mois = '${m}' and service = ${q(s)};`);
  }
  for (const l of ls)
    L.push(`insert into public.oia_ia_cout (espace_id, ${COLONNES.join(", ")}, mis_a_jour_le) values ('${ESPACE_STUDIO}', ${COLONNES.map((c) => q(l[c])).join(", ")}, ${q(now)});`);
  L.push("commit;");
  return `${L.join("\n")}\n`;
}

/** Jetons d'un rapport de la veille (outputs/scout ou outputs/analyst). */
export function lireRapportVeille(texte: string): { appels: number; jetonsEntree: number; jetonsSortie: number } | null {
  const m = /model calls: (\d+) · tokens(?: in\/out:)? (\d+)\/(\d+)/.exec(texte);
  return m ? { appels: Number(m[1]), jetonsEntree: Number(m[2]), jetonsSortie: Number(m[3]) } : null;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  try {
    const [fichier, date] = process.argv.slice(2);
    if (fichier === "--rapport") {
      // Un rapport de la veille sur stdin → une ligne JSON datée (rien si le rapport n'a pas de compteur).
      const r = lireRapportVeille(readFileSync(0, "utf8"));
      if (r) process.stdout.write(`${JSON.stringify({ date, ...r })}\n`);
      process.exit(0);
    }
    if (!fichier) throw new Error("usage: tsx src/couts-sync.ts <entrees.json> | --rapport <date> < rapport.md");
    const e = JSON.parse(readFileSync(fichier, "utf8")) as Entrees;
    const inconnus = [...new Set(e.elmo.runs.filter((r) => !findPrice(r.provider, r.version)).map((r) => `${r.provider}:${r.version}`))];
    if (inconnus.length) process.stderr.write(`modèle(s) absent(s) de la grille, lignes « partiel » : ${inconnus.join(", ")}\n`);
    process.stdout.write(sqlCouts(lignes(e, loadSubjects(defaultSubjectsDir())), e.now));
  } catch (err) {
    process.stderr.write(`couts-sync : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
