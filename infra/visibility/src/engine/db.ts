/**
 * Accès du moteur à la base OIA (mandat v16, bloc B ; contrat
 * docs/interface/contrat-donnees-visibility-v2.md, « Fonctions du moteur »).
 *
 * Le moteur n'écrit jamais une table directement : il n'appelle que des fonctions `vis_moteur_*`,
 * accordées à l'identité de service du moteur seulement (révoquées pour `anon` et
 * `authenticated`). Trois viennent du contrat (`vis_moteur_prendre`, `vis_moteur_terminer`,
 * `vis_moteur_signe`) ; les autres réalisent les « écritures du moteur » du contrat et deux
 * lectures dont il a besoin. Leur liste, signatures exactes : MOTEUR_SQL ci-dessous.
 *
 * Deux implémentations :
 *  - `MemoryEngineDb` : fausse base en mémoire, pour les tests ; mêmes règles que la base
 *    (prise exclusive, retour en file après 30 minutes, demande DONE jamais reprise,
 *    propositions versionnées, décisions humaines jamais réécrites) ;
 *  - `PsqlEngineDb` : une requête par appel, par `~/.oia/bin/oia-psql` (le mot de passe n'est
 *    ni lu ni vu ici). Requêtes PARAMÉTRÉES : chaque valeur est une variable psql posée par
 *    `\set` sur l'entrée standard (jamais sur la ligne de commande, que montre `ps`) et lue
 *    par `:'nom'`, que psql cite ; aucune valeur n'est concaténée dans le SQL.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";

export const DEMANDE_TYPES = ["SITE_ADD", "RECON", "WINDOW_RUN", "REPORT", "REMEASURE_PROPOSE", "ANALYSE", "AUDIT_IA", "NOTE_CONTENU"] as const;
export type DemandeType = (typeof DEMANDE_TYPES)[number];
export type DemandeStatut = "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";

/** Une demande, dans la forme de `vis_demandes_v2`. */
export interface Demande {
  id: string;
  client_id: string;
  subject_id: string | null;
  type: DemandeType;
  charge: Record<string, unknown>;
  statut: DemandeStatut;
  demande_le: string;
  demande_par: string;
  commencee_le: string | null;
  terminee_le: string | null;
  resultat: Record<string, unknown> | null;
  erreur: string | null;
  /** Prises de la demande ; après 3, la base la passe FAILED (vis_moteur_prendre). */
  tentatives: number;
}

export type NatureProposition = "fait" | "question" | "concurrent" | "homonyme" | "audit";
export type EtatProposition = "propose" | "valide" | "rejete";

/** Proposition écrite par le moteur (`propose_par = 'moteur'`). */
export interface PropositionMoteur {
  subject_id: string;
  /** Identifiant stable de l'élément, unique dans toute la base : `<sujet>:<nature>:<local>`. */
  id: string;
  nature: NatureProposition;
  contenu: Record<string, unknown>;
  source: string | null;
}

/** Proposition lue, dans sa dernière version (forme de `vis_propositions_v2`). */
export interface PropositionLue {
  id: string;
  nature: NatureProposition;
  version: number;
  contenu: Record<string, unknown>;
  source: string | null;
  propose_par: string;
  etat: EtatProposition;
  decide_par: string | null;
  decide_le: string | null;
}

export type NatureFenetre = "reconnaissance" | "reference" | "remesure";
export type StatutFenetre = "proposee" | "go_donne" | "en_cours" | "close" | "annulee";

/** Estimation d'une fenêtre (colonnes de `vis_fenetres_v2` que le moteur remplit). */
export interface EstimationFenetre {
  subject_id: string;
  window_id: string;
  nature: NatureFenetre;
  libelle: string;
  compare_avec: string | null;
  jours_prevus: number;
  questions: number;
  moteurs: string[];
  cout_estime_usd: number;
  detail_estimation: { appels: number; par_moteur: Record<string, number>; juge: { nom: string; usd: number } };
  /** Heure UTC de la collecte quotidienne (HH:MM), ou null. */
  heure_utc?: string | null;
}

export interface JourConsigne {
  subject_id: string;
  window_id: string;
  jour: number;
  date: string;
  etat: "complet" | "partiel" | "manquant";
  detail: Record<string, unknown>;
}

/** Ligne de `vis.evidence`, inchangée (mêmes colonnes que src/vis-sync.ts). */
export interface PreuveBase {
  id: string;
  client_id: string;
  site_id: string | null;
  subject_id: string;
  window_id: string;
  prompt_id: string;
  prompt_version: number;
  prompt_language: string;
  engine: string;
  engine_version: string | null;
  collector_name: string;
  collector_run_id: string;
  received_at: string;
  raw_text: string;
  structured: Record<string, unknown>;
  citations: { url: string; label?: string }[];
  cost_usd: number;
}

export interface PageMoteur {
  subject_id: string;
  window_id: string;
  nature: "rapport" | "page_client";
  langue: string;
  html: string;
}

export type TypeAlerte = "RAPPORT_PRET" | "JOUR_PARTIEL" | "JOUR_MANQUANT" | "ECHEC_DEMANDE" | "PLAFOND" | "MOTEUR_MUET" | "COUT_ILLISIBLE";
export interface AlerteMoteur {
  client_id: string;
  subject_id: string | null;
  gravite: "info" | "alerte" | "bloquant";
  type: TypeAlerte;
  message: string;
}

/** GO d'une fenêtre et budget du mois du client, lus en base avant tout appel payant. */
export interface GoEnBase {
  window_id: string;
  statut: StatutFenetre;
  debut: string | null;
  heure_utc: string | null;
  go_par: string | null;
  go_le: string | null;
  cout_vu_au_go_usd: number | null;
  cout_estime_usd: number | null;
  plafond_usd: number | null;
  reel_usd: number;
  engage_usd: number;
  plafond_global_usd: number | null;
}

export interface FenetreEnBase {
  window_id: string;
  nature: NatureFenetre;
  libelle: string;
  statut: StatutFenetre;
  debut: string | null;
  jours_prevus: number;
  compare_avec: string | null;
  heure_utc: string | null;
}

/** Ce que le moteur lit d'un sujet pour reconstruire son cache local. */
export interface SujetEnBase {
  subject_id: string;
  client_id: string;
  client_nom: string;
  site_url: string;
  nom: string;
  langues: string[];
  marches: string[];
  propositions: PropositionLue[];
  /** Version du panel figée par vis_valider_panel, ou null. */
  panel_version: number | null;
  fenetres: FenetreEnBase[];
  /** Exécutions déclarées (vis_declarer_execution). */
  executions: { recommandation: string; date: string; fenetre: string | null }[];
  plafond_usd: number | null;
  plafond_global_usd: number | null;
}

export interface EngineDb {
  /** Prochaine demande QUEUED passée RUNNING (`for update skip locked`), après retour en file des RUNNING abandonnées. */
  prendre(hote: string): Promise<Demande | null>;
  terminer(demande: string, resultat: Record<string, unknown> | null, erreur: string | null): Promise<void>;
  signe(hote: string, version: string, prochain: Date): Promise<void>;
  sujet(subjectId: string): Promise<SujetEnBase | null>;
  go(subjectId: string, windowId: string): Promise<GoEnBase | null>;
  /** Nouvelle version si le contenu change et que l'élément est encore `propose` ; renvoie la version courante. */
  proposer(p: PropositionMoteur): Promise<number>;
  estimer(e: EstimationFenetre): Promise<void>;
  fenetre(subjectId: string, windowId: string, statut: StatutFenetre, debut: string | null): Promise<void>;
  consignerJour(j: JourConsigne): Promise<void>;
  /** Ajout seul ; renvoie le nombre de preuves nouvelles. */
  preuves(rows: PreuveBase[]): Promise<number>;
  page(p: PageMoteur): Promise<string>;
  /** Recommandation générée (format de src/recommendation.ts), en `pending` ; jamais réécrite si présente. */
  recommandation(subjectId: string, windowId: string, rec: Record<string, unknown>): Promise<boolean>;
  alerter(a: AlerteMoteur): Promise<string>;
  /** Analyse instantanée (0012) : une analyse (Lighthouse, audit) d'une demande ANALYSE en cours. */
  analyse(demande: string, a: Record<string, unknown>): Promise<string>;
  /** Constat expliqué rattaché à une demande ANALYSE (et à son analyse, si elle en vient). */
  constat(demande: string, analyseId: string | null, c: Record<string, unknown>): Promise<string>;
  /** Audit IA express (0015) : ouvre sa fenêtre (refusée sans GO en base), rend le résultat. */
  auditDebut(demande: string): Promise<string>;
  auditResultat(demande: string, r: Record<string, unknown>): Promise<string>;
  /** Note du contenu : refusée sans GO en base ; rend le dépôt lié au moment du GO. */
  noteDebut(demande: string): Promise<{ note_id: string; depot: string | null; cout_max_usd: number }>;
}

/** Délai au-delà duquel une demande RUNNING est tenue pour abandonnée, et prises au plus (en base). */
export const ABANDON_MINUTES = 30;
export const MAX_TENTATIVES = 3;

/**
 * Fonctions SQL attendues de la migration (identité de service du moteur seulement).
 * Les trois premières sont celles du contrat ; les autres sont proposées ici, à aligner.
 */
export const MOTEUR_SQL = [
  "vis_moteur_prendre(p_hote text) returns jsonb  -- ligne de vis_demandes_v2 (avec tentatives), ou null ; RUNNING de plus de 30 min : en file, ou FAILED après 3 prises ; puis for update skip locked",
  "vis_moteur_terminer(p_demande uuid, p_resultat jsonb, p_erreur text) returns void  -- RUNNING seulement ; DONE si p_erreur est null, sinon FAILED",
  "vis_moteur_signe(p_hote text, p_version text, p_prochain timestamptz) returns void",
  "vis_moteur_sujet(p_subject text) returns jsonb  -- SujetEnBase, ou null",
  "vis_moteur_go(p_subject text, p_window text) returns jsonb  -- GoEnBase, ou null",
  "vis_moteur_proposer(p_subject text, p_id text, p_nature text, p_contenu jsonb, p_source text) returns int",
  "vis_moteur_estimer(p_subject text, p_window text, p_nature text, p_libelle text, p_compare_avec text, p_jours int, p_questions int, p_moteurs text[], p_cout_usd numeric, p_detail jsonb, p_heure_utc text default null) returns void  -- crée aussi vis.window (planned)",
  "vis_moteur_fenetre(p_subject text, p_window text, p_statut text, p_debut date) returns void",
  "vis_moteur_jour(p_subject text, p_window text, p_jour int, p_date date, p_etat text, p_detail jsonb) returns void",
  "vis_moteur_preuves(p_preuves jsonb) returns int  -- insert into vis.evidence ... on conflict (id) do nothing ; une preuve existante d'un autre texte ou d'une autre fenêtre refuse tout le paquet (23514)",
  "vis_moteur_page(p_subject text, p_window text, p_nature text, p_langue text, p_html text) returns uuid",
  "vis_moteur_recommandation(p_subject text, p_window text, p_recommandation jsonb) returns boolean",
  "vis_moteur_alerter(p_client text, p_subject text, p_gravite text, p_type text, p_message text) returns uuid",
] as const;

// ---------------------------------------------------------------- fausse base, en mémoire

interface Version extends PropositionLue {
  subject_id: string;
}

/** Fausse base : mêmes règles que la base, en mémoire, pour les tests. */
export class MemoryEngineDb implements EngineDb {
  demandes: Demande[] = [];
  propositions = new Map<string, Version[]>();
  estimations = new Map<string, EstimationFenetre>();
  fenetres = new Map<string, FenetreEnBase & { subject_id: string; go?: Partial<GoEnBase> }>();
  jours = new Map<string, JourConsigne>();
  evidence = new Map<string, PreuveBase>();
  pages: (PageMoteur & { id: string })[] = [];
  recos = new Map<string, Record<string, unknown>>();
  alertes: (AlerteMoteur & { id: string })[] = [];
  signes: { hote: string; version: string; prochain: string; le: string }[] = [];
  sujets = new Map<string, Omit<SujetEnBase, "propositions" | "fenetres">>();
  budget = { plafond_global_usd: 100 as number | null, reel_usd: new Map<string, number>(), engage_usd: new Map<string, number>() };

  constructor(private now: () => Date = () => new Date()) {}

  // Gestes simulés (ceux du cockpit), pour les tests.
  demander(d: { type: DemandeType; client_id: string; subject_id?: string | null; charge?: Record<string, unknown> }): Demande {
    const row: Demande = { id: randomUUID(), client_id: d.client_id, subject_id: d.subject_id ?? null, type: d.type, charge: d.charge ?? {}, statut: "QUEUED", demande_le: this.now().toISOString(), demande_par: "mickael", commencee_le: null, terminee_le: null, resultat: null, erreur: null, tentatives: 0 };
    this.demandes.push(row);
    return row;
  }
  decider(id: string, etat: EtatProposition): void {
    const v = this.propositions.get(id);
    if (!v?.length) throw new Error(`proposition ${id} introuvable`);
    v.push({ ...v[v.length - 1]!, etat, decide_par: "mickael", decide_le: this.now().toISOString() });
  }

  async prendre(_hote: string): Promise<Demande | null> {
    const limit = this.now().getTime() - ABANDON_MINUTES * 60_000;
    for (const d of this.demandes) {
      if (d.statut !== "RUNNING" || !d.commencee_le || Date.parse(d.commencee_le) >= limit) continue;
      if (d.tentatives >= MAX_TENTATIVES) {
        Object.assign(d, { statut: "FAILED", terminee_le: this.now().toISOString(), erreur: `abandonnée ${d.tentatives} fois (plus de ${ABANDON_MINUTES} minutes sans fin)` });
        this.alertes.push({ id: randomUUID(), client_id: d.client_id, subject_id: d.subject_id, gravite: "bloquant", type: "ECHEC_DEMANDE", message: `${d.type} : ${d.erreur}` });
      } else Object.assign(d, { statut: "QUEUED", commencee_le: null });
    }
    // Sans attente entre la recherche et le passage RUNNING : deux passages ne prennent jamais la même.
    const d = this.demandes.filter((x) => x.statut === "QUEUED").sort((a, z) => a.demande_le.localeCompare(z.demande_le))[0];
    if (!d) return null;
    Object.assign(d, { statut: "RUNNING", commencee_le: this.now().toISOString(), tentatives: d.tentatives + 1 });
    return structuredClone(d);
  }
  async terminer(id: string, resultat: Record<string, unknown> | null, erreur: string | null): Promise<void> {
    const d = this.demandes.find((x) => x.id === id);
    if (!d) throw new Error(`P0002 : demande ${id} introuvable`);
    if (d.statut !== "RUNNING") throw new Error(`55000 : demande ${id} au statut ${d.statut}, pas RUNNING`);
    Object.assign(d, { statut: erreur ? "FAILED" : "DONE", terminee_le: this.now().toISOString(), resultat, erreur });
  }
  async signe(hote: string, version: string, prochain: Date): Promise<void> {
    this.signes.push({ hote, version, prochain: prochain.toISOString(), le: this.now().toISOString() });
  }
  async sujet(subjectId: string): Promise<SujetEnBase | null> {
    const s = this.sujets.get(subjectId);
    if (!s) return null;
    const propositions = [...this.propositions.values()].filter((v) => v[0]!.subject_id === subjectId).map((v) => {
      const { subject_id: _s, ...last } = v[v.length - 1]!;
      return structuredClone(last);
    });
    const fenetres = [...this.fenetres.values()].filter((f) => f.subject_id === subjectId).map(({ subject_id: _s, go: _g, ...f }) => ({ ...f }));
    return structuredClone({ ...s, propositions, fenetres });
  }
  async go(subjectId: string, windowId: string): Promise<GoEnBase | null> {
    const f = this.fenetres.get(windowId);
    const s = this.sujets.get(subjectId);
    if (!f || f.subject_id !== subjectId || !s) return null;
    return {
      window_id: windowId,
      statut: f.statut,
      debut: f.debut,
      heure_utc: f.heure_utc,
      go_par: f.go?.go_par ?? null,
      go_le: f.go?.go_le ?? null,
      cout_vu_au_go_usd: f.go?.cout_vu_au_go_usd ?? null,
      cout_estime_usd: this.estimations.get(windowId)?.cout_estime_usd ?? null,
      plafond_usd: s.plafond_usd,
      reel_usd: this.budget.reel_usd.get(s.client_id) ?? 0,
      engage_usd: this.budget.engage_usd.get(s.client_id) ?? 0,
      plafond_global_usd: this.budget.plafond_global_usd,
    };
  }
  async proposer(p: PropositionMoteur): Promise<number> {
    const v = this.propositions.get(p.id) ?? [];
    const last = v[v.length - 1];
    if (last && (last.etat !== "propose" || JSON.stringify(last.contenu) === JSON.stringify(p.contenu))) return last.version;
    v.push({ subject_id: p.subject_id, id: p.id, nature: p.nature, version: (last?.version ?? 0) + 1, contenu: structuredClone(p.contenu), source: p.source, propose_par: "moteur", etat: "propose", decide_par: null, decide_le: null });
    this.propositions.set(p.id, v);
    return v[v.length - 1]!.version;
  }
  async estimer(e: EstimationFenetre): Promise<void> {
    this.estimations.set(e.window_id, structuredClone(e));
    if (!this.fenetres.has(e.window_id)) {
      this.fenetres.set(e.window_id, { subject_id: e.subject_id, window_id: e.window_id, nature: e.nature, libelle: e.libelle, statut: "proposee", debut: null, jours_prevus: e.jours_prevus, compare_avec: e.compare_avec, heure_utc: e.heure_utc ?? null });
    } else if (e.heure_utc) this.fenetres.get(e.window_id)!.heure_utc = e.heure_utc;
  }
  async fenetre(subjectId: string, windowId: string, statut: StatutFenetre, debut: string | null): Promise<void> {
    const f = this.fenetres.get(windowId);
    if (!f || f.subject_id !== subjectId) throw new Error(`P0002 : fenêtre ${windowId} introuvable`);
    if (statut === "en_cours" && f.statut !== "go_donne" && f.statut !== "en_cours") throw new Error(`55000 : fenêtre ${windowId} au statut ${f.statut}, pas de passage en_cours sans GO`);
    f.statut = statut;
    if (debut) f.debut = debut;
  }
  async consignerJour(j: JourConsigne): Promise<void> {
    const k = `${j.window_id}#${j.jour}`;
    if (!this.jours.has(k)) this.jours.set(k, structuredClone(j));
  }
  async preuves(rows: PreuveBase[]): Promise<number> {
    // Comme la base : une preuve existante d'un autre texte ou d'une autre fenêtre refuse tout le paquet.
    for (const r of rows) {
      const e = this.evidence.get(r.id);
      if (e && (e.raw_text !== r.raw_text || e.window_id !== r.window_id)) throw new Error(`23514 : preuve ${r.id} déjà en base avec un autre texte ou une autre fenêtre ; paquet refusé`);
    }
    let n = 0;
    for (const r of rows) {
      if (this.evidence.has(r.id)) continue;
      this.evidence.set(r.id, structuredClone(r));
      n++;
    }
    return n;
  }
  async page(p: PageMoteur): Promise<string> {
    const id = randomUUID();
    this.pages.push({ ...p, id });
    return id;
  }
  async recommandation(_s: string, _w: string, rec: Record<string, unknown>): Promise<boolean> {
    const id = String(rec.id);
    if (this.recos.has(id)) return false;
    this.recos.set(id, structuredClone(rec));
    return true;
  }
  async alerter(a: AlerteMoteur): Promise<string> {
    const id = randomUUID();
    this.alertes.push({ ...a, id });
    return id;
  }
  analyses: (Record<string, unknown> & { id: string; demande: string })[] = [];
  constats: (Record<string, unknown> & { id: string; demande: string; analyse: string | null })[] = [];
  async analyse(demande: string, a: Record<string, unknown>): Promise<string> {
    const d = this.demandes.find((x) => x.id === demande);
    if (!d || (d.type !== "ANALYSE" && d.type !== "NOTE_CONTENU") || d.statut !== "RUNNING") throw new Error(`55000 : demande ${demande} : pas une analyse en cours`);
    if ((d.type === "NOTE_CONTENU") !== (a.nature === "contenu")) throw new Error("22023 : nature « contenu » réservée à la note du contenu");
    const id = randomUUID();
    this.analyses.push({ ...structuredClone(a), id, demande });
    return id;
  }
  auditsGo = new Set<string>();
  audits: (Record<string, unknown> & { id: string; demande: string })[] = [];
  async auditDebut(demande: string): Promise<string> {
    const d = this.demandes.find((x) => x.id === demande);
    if (!d || d.type !== "AUDIT_IA" || d.statut !== "RUNNING") throw new Error(`55000 : demande ${demande} : pas un audit en cours`);
    if (!this.auditsGo.has(String(d.charge.audit_id))) throw new Error("42501 : audit refusé : aucun GO enregistré");
    return `${d.subject_id}-audit-test`;
  }
  notesGo = new Map<string, { depot: string | null; cout_max_usd: number }>();
  async noteDebut(demande: string) {
    const d = this.demandes.find((x) => x.id === demande);
    if (!d || d.type !== "NOTE_CONTENU" || d.statut !== "RUNNING") throw new Error(`55000 : demande ${demande} : pas une note en cours`);
    const go = this.notesGo.get(String(d.charge.note_id));
    if (!go) throw new Error("42501 : note refusée : aucun GO enregistré");
    return { note_id: String(d.charge.note_id), ...go };
  }
  async auditResultat(demande: string, r: Record<string, unknown>): Promise<string> {
    const id = randomUUID();
    this.audits.push({ ...structuredClone(r), id, demande });
    return id;
  }
  async constat(demande: string, analyseId: string | null, c: Record<string, unknown>): Promise<string> {
    const d = this.demandes.find((x) => x.id === demande);
    if (!d || (d.type !== "ANALYSE" && d.type !== "NOTE_CONTENU")) throw new Error(`P0002 : demande d'analyse ${demande} introuvable`);
    if ((d.type === "NOTE_CONTENU") !== (c.source === "contenu")) throw new Error("22023 : source « contenu » réservée à la note du contenu");
    if (analyseId && !this.analyses.some((x) => x.id === analyseId && x.demande === demande)) throw new Error("22023 : analyse d'une autre demande");
    const id = randomUUID();
    this.constats.push({ ...structuredClone(c), id, demande, analyse: analyseId });
    return id;
  }
}

// ---------------------------------------------------------------- base réelle, par psql

export type SqlParam = string | number | boolean | null | Date | Record<string, unknown> | unknown[];

/** Commande psql du moteur : OIA_VIS_PSQL, sinon ~/.oia/bin/oia-psql (connexion et mot de passe gérés par elle). */
export function defaultPsqlCommand(env: Record<string, string | undefined> = process.env): string {
  return env.OIA_VIS_PSQL?.trim() || join(homedir(), ".oia", "bin", "oia-psql");
}

const NAME = /^p_[a-z_]+$/;

/** Valeur d'une variable psql : texte brut ; null et chaînes vides se distinguent par `nullif` côté SQL. */
function asVar(v: SqlParam): string {
  if (v === null) return "";
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Exécute une requête paramétrée ; renvoie la première ligne de sortie (`-At`), ou null. */
export type SqlRunner = (sql: string, params: Record<string, SqlParam>) => Promise<string | null>;

/**
 * Argument de `\set`, entre apostrophes, selon les règles des méta-commandes de psql :
 * apostrophe doublée, barre oblique inverse et fins de ligne échappées. La valeur n'entre
 * jamais dans le SQL : la requête la lit par `:'nom'`, que psql cite à son tour.
 */
export function psqlSetArg(value: string): string {
  if (value.includes("\0")) throw new Error("valeur SQL refusée : caractère nul");
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "''").replace(/\n/g, "\\n").replace(/\r/g, "\\r")}'`;
}

/** Script envoyé sur l'entrée standard : un `\set` par variable, puis la requête. */
export function psqlScript(sql: string, params: Record<string, SqlParam>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(params)) {
    if (!NAME.test(k)) throw new Error(`nom de paramètre SQL refusé : ${k}`);
    lines.push(`\\set ${k} ${psqlSetArg(asVar(v))}`);
  }
  return `${lines.join("\n")}${lines.length ? "\n" : ""}${sql}`;
}

export function psqlRunner(command: string = defaultPsqlCommand(), extraArgs: string[] = []): SqlRunner {
  return (sql, params) => {
    // Les valeurs passent par l'entrée standard, jamais par la ligne de commande (visible par ps).
    const input = psqlScript(sql, params);
    const args = [...extraArgs, "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1"];
    return new Promise((resolve, reject) => {
      // Aucun shell : la commande et ses arguments passent tels quels.
      const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d));
      child.stderr.on("data", (d) => (err += d));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0) {
          // Message de la base seulement (ERROR: …), jamais la requête ni ses valeurs.
          const m = /ERROR:\s+(.*)/.exec(err);
          reject(new Error(m ? m[1]!.trim() : `requête en échec (code ${code})`));
        } else resolve(out.trim() === "" ? null : out.split("\n")[0]!);
      });
      child.stdin.end(input);
    });
  };
}

/**
 * Rôle de la session du moteur : OIA_VIS_ENGINE_ROLE, défaut service_role. Toujours posé : la
 * base refuse une fonction du moteur sous le rôle de connexion (postgres) sans `set role` (42501).
 */
export function engineRole(env: Record<string, string | undefined> = process.env): string {
  const r = env.OIA_VIS_ENGINE_ROLE?.trim() || "service_role";
  if (!/^[a-z_][a-z0-9_]*$/.test(r)) throw new Error(`rôle du moteur refusé : ${r}`);
  return r;
}

/**
 * Base réelle : une fonction vis_moteur_* par appel, valeurs en variables psql. Chaque requête
 * passe d'abord au rôle du moteur (`set role service_role`), sans aucune revendication JWT :
 * auth.uid() reste nul.
 */
export class PsqlEngineDb implements EngineDb {
  private readonly run: SqlRunner;
  constructor(run: SqlRunner = psqlRunner(), role: string = engineRole()) {
    if (!/^[a-z_][a-z0-9_]*$/.test(role)) throw new Error(`rôle du moteur refusé : ${role}`);
    this.run = (sql, params) => run(`set role ${role};\n${sql}`, params);
  }

  private async json<T>(sql: string, params: Record<string, SqlParam>): Promise<T | null> {
    const line = await this.run(sql, params);
    return line === null || line === "" ? null : (JSON.parse(line) as T);
  }

  prendre(hote: string) {
    return this.json<Demande>("select vis_moteur_prendre(:'p_hote')::text;\n", { p_hote: hote });
  }
  async terminer(demande: string, resultat: Record<string, unknown> | null, erreur: string | null) {
    await this.run("select vis_moteur_terminer(:'p_demande'::uuid, nullif(:'p_resultat', '')::jsonb, nullif(:'p_erreur', ''));\n", { p_demande: demande, p_resultat: resultat, p_erreur: erreur });
  }
  async signe(hote: string, version: string, prochain: Date) {
    await this.run("select vis_moteur_signe(:'p_hote', :'p_version', :'p_prochain'::timestamptz);\n", { p_hote: hote, p_version: version, p_prochain: prochain });
  }
  sujet(subjectId: string) {
    return this.json<SujetEnBase>("select vis_moteur_sujet(:'p_subject')::text;\n", { p_subject: subjectId });
  }
  go(subjectId: string, windowId: string) {
    return this.json<GoEnBase>("select vis_moteur_go(:'p_subject', :'p_window')::text;\n", { p_subject: subjectId, p_window: windowId });
  }
  async proposer(p: PropositionMoteur) {
    const v = await this.run("select vis_moteur_proposer(:'p_subject', :'p_id', :'p_nature', :'p_contenu'::jsonb, nullif(:'p_source', ''));\n", { p_subject: p.subject_id, p_id: p.id, p_nature: p.nature, p_contenu: p.contenu, p_source: p.source });
    return Number(v);
  }
  async estimer(e: EstimationFenetre) {
    await this.run(
      "select vis_moteur_estimer(:'p_subject', :'p_window', :'p_nature', :'p_libelle', nullif(:'p_compare_avec', ''), :'p_jours'::int, :'p_questions'::int, array(select jsonb_array_elements_text(:'p_moteurs'::jsonb)), :'p_cout_usd'::numeric, :'p_detail'::jsonb, nullif(:'p_heure_utc', ''));\n",
      { p_subject: e.subject_id, p_window: e.window_id, p_nature: e.nature, p_libelle: e.libelle, p_compare_avec: e.compare_avec, p_jours: e.jours_prevus, p_questions: e.questions, p_moteurs: e.moteurs, p_cout_usd: e.cout_estime_usd, p_detail: e.detail_estimation, p_heure_utc: e.heure_utc ?? null },
    );
  }
  async fenetre(subjectId: string, windowId: string, statut: StatutFenetre, debut: string | null) {
    await this.run("select vis_moteur_fenetre(:'p_subject', :'p_window', :'p_statut', nullif(:'p_debut', '')::date);\n", { p_subject: subjectId, p_window: windowId, p_statut: statut, p_debut: debut });
  }
  async consignerJour(j: JourConsigne) {
    await this.run("select vis_moteur_jour(:'p_subject', :'p_window', :'p_jour'::int, :'p_date'::date, :'p_etat', :'p_detail'::jsonb);\n", { p_subject: j.subject_id, p_window: j.window_id, p_jour: j.jour, p_date: j.date, p_etat: j.etat, p_detail: j.detail });
  }
  async preuves(rows: PreuveBase[]) {
    // Par paquets bornés : une requête de taille raisonnable par appel.
    let added = 0;
    let batch: PreuveBase[] = [];
    let size = 0;
    const flush = async () => {
      if (!batch.length) return;
      added += Number(await this.run("select vis_moteur_preuves(:'p_preuves'::jsonb);\n", { p_preuves: batch }));
      batch = [];
      size = 0;
    };
    for (const r of rows) {
      const n = JSON.stringify(r).length;
      if (size + n > 200_000) await flush();
      batch.push(r);
      size += n;
    }
    await flush();
    return added;
  }
  async page(p: PageMoteur) {
    return String(await this.run("select vis_moteur_page(:'p_subject', :'p_window', :'p_nature', :'p_langue', :'p_html');\n", { p_subject: p.subject_id, p_window: p.window_id, p_nature: p.nature, p_langue: p.langue, p_html: p.html }));
  }
  async recommandation(subjectId: string, windowId: string, rec: Record<string, unknown>) {
    return (await this.run("select vis_moteur_recommandation(:'p_subject', :'p_window', :'p_recommandation'::jsonb);\n", { p_subject: subjectId, p_window: windowId, p_recommandation: rec })) === "t";
  }
  async auditDebut(demande: string) {
    return String(await this.run("select vis_moteur_audit_debut(:'p_demande'::uuid);\n", { p_demande: demande }));
  }
  async auditResultat(demande: string, r: Record<string, unknown>) {
    return String(await this.run("select vis_moteur_audit_resultat(:'p_demande'::uuid, :'p_resultat'::jsonb);\n", { p_demande: demande, p_resultat: r }));
  }
  async noteDebut(demande: string) {
    return JSON.parse(String(await this.run("select vis_moteur_note_debut(:'p_demande'::uuid);\n", { p_demande: demande }))) as { note_id: string; depot: string | null; cout_max_usd: number };
  }
  async analyse(demande: string, a: Record<string, unknown>) {
    return String(await this.run("select vis_moteur_analyse(:'p_demande'::uuid, :'p_analyse'::jsonb);\n", { p_demande: demande, p_analyse: a }));
  }
  async constat(demande: string, analyseId: string | null, c: Record<string, unknown>) {
    return String(await this.run("select vis_moteur_constat(:'p_demande'::uuid, nullif(:'p_analyse', '')::uuid, :'p_constat'::jsonb);\n", { p_demande: demande, p_analyse: analyseId, p_constat: c }));
  }
  async alerter(a: AlerteMoteur) {
    return String(await this.run("select vis_moteur_alerter(:'p_client', nullif(:'p_subject', ''), :'p_gravite', :'p_type', :'p_message');\n", { p_client: a.client_id, p_subject: a.subject_id, p_gravite: a.gravite, p_type: a.type, p_message: a.message }));
  }
}
