import { randomBytes } from "node:crypto";
import { appendFileSync, chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CompartimentSchema, NIVEAUX, niveauDe, RefusMemoire, restrictionsPour, type Acteur, type ElementMemoire, type Niveau, type Resultat } from "@oia/shyrka-noyau";
import type { Corpus, ExtraitCorpus } from "../executive/corpus.js";
import type { MemoireLocale } from "../memoire/sqlite.js";
import { controler, proposerNiveau, type Verdict } from "./admission.js";
import { CataloguePrive, nouvelId, type Origine, type SourcePrivee } from "./catalogue-prive.js";
import { empreinte, LOT_MAX, lireDocument, nomAffichage, RefusDocument, type DocumentLu, type Parseurs, parseursMac } from "./extraction.js";
import { normaliserCitation, proposer, type Generateur } from "./propositions.js";
import { produit, type Vectoriseur } from "./sens.js";
import type { Surveillance } from "./surveillance.js";

/**
 * Module Corpus de Shyrka (mandat Corpus local du 8 novembre 2026) :
 * déposer → vérifier → confirmer → consulter → valider.
 *
 * - Préparer : le document est lu EN MÉMOIRE (aucune copie disque), contrôlé
 *   (type réel, secrets, Swift, pièces d'identité, données de tiers), et
 *   présenté. Rien n'est écrit. Une préparation expire au bout de 30 minutes
 *   et disparaît avec le processus.
 * - Confirmer : le fichier admis est écrit dans `brut/depots/` (volume
 *   chiffré), inscrit au catalogue privé, indexé ; le sens (bge-m3) puis les
 *   propositions (modèle local) sont calculés en tâche de fond, observables.
 * - Valider : les propositions vivent dans la mémoire canonique, statut « à
 *   confirmer » ; Mickaël valide, corrige, refuse (oubli, sans retour) ou reporte.
 * - Retirer : index, fichier admis et propositions en attente supprimés tout
 *   de suite ; les souvenirs déjà validés restent (ils sont à Mickaël) et le
 *   retrait le dit.
 *
 * Mode privé : ni préparation, ni import, ni proposition, ni surveillance.
 * Journaux (`journal/imports.md`, `journal/retraits.md`) : identifiant opaque,
 * action, empreinte tronquée ; jamais un titre ni un contenu.
 */

const EXPIRATION_MS = 30 * 60_000;
const LOT_PROPOSITIONS = 8;
/** Écran de Mickaël : proximité minimale (mesurée le 8 novembre : hors sujet franc ≤ 0,36 ; vrais résultats courts dès 0,45). */
const PLANCHER_ECRAN = 0.4;
/** Deux énoncés au moins aussi proches sont la même information reformulée. */
const SEUIL_REFORMULATION = 0.9;
const MICKAEL: Acteur = { type: "mickael", via: "corpus-local" };
const OUTIL: Acteur = { type: "outil", id: "corpus" };

/** Tous les éléments de mémoire de ces statuts (la mémoire rend 100 éléments au plus par page). */
function tousLes(m: MemoireLocale, statuts: ElementMemoire["statut"][]): Resultat[] {
  const out: Resultat[] = [];
  for (let apres = 0; ; apres += 100) {
    const page = m.retrouver({ limite: 100, apres, statuts }, { type: "mickael" });
    out.push(...page);
    if (page.length < 100) return out;
  }
}

export class ErreurCorpus extends Error {
  constructor(readonly statut: number, readonly code: string, message: string) {
    super(message);
  }
}

interface Preparation {
  jeton: string;
  nom: string;
  /** Octets reçus, gardés en mémoire seulement jusqu'à la confirmation ou l'expiration. */
  octets: Uint8Array;
  doc: DocumentLu;
  verdict: Verdict;
  origine: Origine;
  dateSource: string;
  fichierDossier?: string;
  expire: number;
}

export interface Apercu {
  jeton: string;
  nom: string;
  type: string;
  taille: number;
  pages?: number;
  passages: number;
  apercu: string;
  etat: "pret" | "a_verifier";
  motifs: string[];
  avertissements: string[];
  dejaPresent: { id: string; nom: string } | null;
  memeNom: { id: string; nom: string; version: number } | null;
  retireLe: string | null;
  /** Niveau proposé par Shyrka (compartiment personnel, puis pour un projet) ; Mickaël confirme ou change. */
  niveauPropose: { niveau: Niveau; raison: string };
  niveauProposeProjet: { niveau: Niveau; raison: string };
}

/** État d'un document pour l'écran. */
export type EtatDocument = "disponible" | "analyse_en_cours" | "propositions_pretes" | "echec";

export interface Tache {
  etape: "indexation" | "sens" | "propositions" | "fini" | "erreur";
  fait: number;
  total: number;
  propositions?: number;
  ecartees?: number;
  message?: string;
}

export interface ChoixConfirmation {
  compartiment: string;
  /** Shyrka peut s'en servir dans les conversations sur le Mac (modèle local). Jamais coché d'office. */
  conversation: boolean;
  /** Nouvelle version d'une source existante (même identité). */
  nouvelleVersionDe?: string;
  /** Mickaël atteste avoir le droit de garder ce document malgré les motifs de quarantaine. */
  attestation?: boolean;
  /** Niveau de confidentialité confirmé par Mickaël. */
  niveau: Niveau;
}

export interface DepsDepot {
  corpus: Corpus;
  catalogue: CataloguePrive;
  memoire: MemoireLocale | null;
  /** Dossier `brut/depots` vérifié (volume chiffré). */
  brut: string;
  /** Dossier `journal` vérifié, ou null. */
  journal: string | null;
  vectoriser: Vectoriseur;
  generer: Generateur | null;
  surveillance?: Surveillance;
  parseurs?: Parseurs;
  prive: () => boolean;
  /** Niveaux visibles dans le mode de présence courant (tous si absent) : appliqué à tout ce qui est rendu. */
  niveaux?: () => Niveau[];
  horloge?: () => Date;
  /** Fin de chaque tâche de fond (tests). */
  surFin?: (source: string, t: Tache) => void;
}

export class DepotCorpus {
  private preparations = new Map<string, Preparation>();
  readonly taches = new Map<string, Tache>();
  private enCours: Promise<unknown> = Promise.resolve();

  constructor(private readonly d: DepsDepot) {}

  private maintenant(): Date {
    return this.d.horloge?.() ?? new Date();
  }

  private permis(): Niveau[] {
    return this.d.niveaux?.() ?? [...NIVEAUX];
  }

  private visible(restrictions: readonly string[]): boolean {
    return this.permis().includes(niveauDe(restrictions));
  }

  /** Éléments de mémoire issus d'une source (propositions comprises). */
  private issusDe(id: string, statuts: ElementMemoire["statut"][]): Resultat[] {
    return this.d.memoire ? tousLes(this.d.memoire, statuts).filter((x) => x.element.source.ref.startsWith(`corpus:${id} `)) : [];
  }

  private exigerPublic(action: string): void {
    if (this.d.prive()) throw new ErreurCorpus(423, "mode_prive", `Mode privé : ${action} impossible tant qu'il est actif (rien n'est enregistré).`);
  }

  private journal(fichier: "imports.md" | "retraits.md", ligne: string): void {
    if (!this.d.journal || this.d.prive()) return;
    appendFileSync(join(this.d.journal, fichier), `- ${this.maintenant().toISOString()} · ${ligne}\n`, { mode: 0o600 });
  }

  private purger(): void {
    const t = this.maintenant().getTime();
    for (const [k, p] of this.preparations) if (p.expire < t) this.preparations.delete(k);
  }

  /** Analyse un document, en mémoire seulement. Refus : rien n'est gardé, seul un code est journalisé. */
  async preparer(nomBrut: string, octets: Uint8Array, origine: Origine = "depot", dateSource?: string, fichierDossier?: string): Promise<Apercu> {
    this.exigerPublic("ajouter un document");
    this.purger();
    const enAttente = [...this.preparations.values()].reduce((n, p) => n + p.doc.taille, 0);
    if (enAttente + octets.byteLength > LOT_MAX) throw new ErreurCorpus(413, "lot_plein", "100 Mo en attente au plus : confirme ou annule les documents déjà préparés.");
    const nom = nomAffichage(nomBrut);
    let doc: DocumentLu;
    try {
      doc = await lireDocument(nom, octets, this.d.parseurs ?? parseursMac);
    } catch (e) {
      if (e instanceof RefusDocument) {
        this.journal("imports.md", `refus ${e.code}`);
        throw new ErreurCorpus(422, e.code, e.message);
      }
      throw e;
    }
    const verdict = controler(doc.texte, nom);
    if (verdict.decision === "refus") {
      this.journal("imports.md", `refus ${verdict.code}`);
      throw new ErreurCorpus(422, verdict.code, `Refusé : ${verdict.motif}. Rien n'a été conservé ; dépose une version nettoyée si besoin.`);
    }
    const jeton = randomBytes(12).toString("hex");
    this.preparations.set(jeton, { jeton, nom, octets, doc, verdict, origine, dateSource: dateSource ?? this.maintenant().toISOString(), ...(fichierDossier ? { fichierDossier } : {}), expire: this.maintenant().getTime() + EXPIRATION_MS });
    const deja = this.d.catalogue.parEmpreinte(doc.empreinte);
    const meme = deja ? null : this.d.catalogue.parNom(nom);
    return {
      jeton, nom, type: doc.type, taille: doc.taille, ...(doc.pages ? { pages: doc.pages } : {}), passages: doc.passages.length,
      apercu: doc.texte.slice(0, 1500), etat: verdict.decision === "quarantaine" ? "a_verifier" : "pret",
      motifs: verdict.decision === "quarantaine" ? verdict.motifs : [], avertissements: verdict.decision === "admis" ? verdict.avertissements : [],
      dejaPresent: deja ? { id: deja.id, nom: deja.nom } : null, memeNom: meme ? { id: meme.id, nom: meme.nom, version: meme.version } : null,
      retireLe: this.d.catalogue.revoqueeAvec(doc.empreinte)?.revoqueLe ?? null,
      niveauPropose: proposerNiveau(doc.texte, verdict, "personnel", nom), niveauProposeProjet: proposerNiveau(doc.texte, verdict, "projet:oia", nom),
    };
  }

  annuler(jeton: string): { annule: boolean } {
    return { annule: this.preparations.delete(jeton) };
  }

  /** Note courte volontaire : un document Markdown comme un autre, préparé puis confirmé. */
  note(titre: string, texte: string): Promise<Apercu> {
    const t = titre.trim().replace(/[\\/]/g, " ").slice(0, 80) || "Note";
    if (!texte.trim()) throw new ErreurCorpus(400, "note_vide", "La note est vide.");
    if (texte.length > 20_000) throw new ErreurCorpus(413, "note_trop_longue", "20 000 caractères au plus : dépose un fichier.");
    return this.preparer(`${t}.md`, new TextEncoder().encode(`# ${t}\n\n${texte.trim()}\n`), "note");
  }

  /** Confirme l'import : écriture du fichier admis, catalogue, index ; sens et propositions en tâche de fond. */
  async confirmer(jeton: string, choix: ChoixConfirmation): Promise<{ source: string; version: number; extraits: number; deja?: boolean }> {
    this.exigerPublic("ajouter au Corpus");
    this.purger();
    const p = this.preparations.get(jeton);
    if (!p) throw new ErreurCorpus(404, "preparation_inconnue", "Préparation expirée ou inconnue : dépose le document de nouveau.");
    const comp = CompartimentSchema.safeParse(choix.compartiment);
    if (!comp.success) throw new ErreurCorpus(400, "compartiment_invalide", "Compartiment : personnel, projet:<nom> ou module:<nom>.");
    if (!NIVEAUX.includes(choix.niveau)) throw new ErreurCorpus(400, "niveau_requis", "Niveau de confidentialité à confirmer : public, interne, confidentiel ou personnel.");
    if (p.verdict.decision === "quarantaine" && choix.attestation !== true) throw new ErreurCorpus(409, "attestation_requise", "Ce document contient peut-être des données de tiers : confirme explicitement que tu as le droit de le garder, ou dépose une version nettoyée.");
    const deja = this.d.catalogue.parEmpreinte(p.doc.empreinte);
    if (deja) {
      this.preparations.delete(jeton);
      return { source: deja.id, version: deja.version, extraits: 0, deja: true };
    }
    let ancienne: SourcePrivee | null = null;
    if (choix.nouvelleVersionDe) {
      ancienne = this.d.catalogue.lire(choix.nouvelleVersionDe);
      if (!ancienne || ancienne.statut === "revoque") throw new ErreurCorpus(404, "source_inconnue", "La source à remplacer n'existe plus.");
    }
    const id = ancienne?.id ?? nouvelId();
    const version = (ancienne?.version ?? 0) + 1;
    const ext = p.doc.type;
    const dossier = join(this.d.brut, id);
    mkdirSync(dossier, { recursive: true, mode: 0o700 });
    const fichier = join(id, `${p.doc.empreinte.slice(0, 16)}.${ext}`);
    // Le contenu n'arrive sur disque qu'ici, et seulement dans le volume chiffré.
    writeFileSync(join(this.d.brut, fichier), p.octets, { mode: 0o600 });
    chmodSync(join(this.d.brut, fichier), 0o600);
    const titre = p.nom.replace(/\.[^.]+$/, "");
    const source: SourcePrivee = {
      id, nom: p.nom, origine: p.origine, type: ext, compartiment: comp.data, lecteurs: choix.conversation ? ["mickael", "conversation"] : ["mickael"],
      empreinte: p.doc.empreinte, taille: p.doc.taille, fichier, dateSource: p.dateSource, dateImport: this.maintenant().toISOString(), version, statut: "indexe",
      attestation: p.verdict.decision === "quarantaine" ? p.verdict.motifs.join(" ; ") : null, revoqueLe: null, niveau: choix.niveau,
    };
    this.d.catalogue.enregistrer(source);
    const extraits = this.d.corpus.indexerPassages(id, `prive/${id}`, titre, p.doc.empreinte, p.dateSource, p.doc.passages);
    if (ancienne && ancienne.fichier !== fichier) rmSync(join(this.d.brut, ancienne.fichier), { force: true });
    if (ancienne) this.retirerPropositionsEnAttente(id, "citation absente de la nouvelle version", p.doc.texte);
    if (p.fichierDossier) this.d.surveillance?.effacer(p.fichierDossier);
    this.preparations.delete(jeton);
    this.journal("imports.md", `${id} · importé v${version} · ${ext} · ${p.doc.empreinte.slice(0, 12)}${source.attestation ? " · attestation de Mickaël" : ""}`);
    this.fondDe(id, true, titre, p.doc);
    return { source: id, version, extraits };
  }

  /** Tâche de fond observable : sens (bge-m3), puis propositions (modèle local). */
  private fondDe(id: string, proposer: boolean, titre: string, doc: DocumentLu): void {
    const t: Tache = { etape: "sens", fait: 0, total: doc.passages.length };
    this.taches.set(id, t);
    this.enCours = this.enCours.then(async () => {
      try {
        await this.d.corpus.calculerSens(this.d.vectoriser, (f, n) => Object.assign(t, { fait: f, total: n }));
        if (proposer && this.d.generer && this.d.memoire && !this.d.prive() && this.d.catalogue.lire(id)?.statut === "indexe") {
          Object.assign(t, { etape: "propositions", fait: 0, total: 1 });
          const r = await this.creerPropositions(id, titre, doc);
          Object.assign(t, { propositions: r.creees, ecartees: r.ecartees });
        }
        Object.assign(t, { etape: "fini", fait: t.total });
      } catch (e) {
        Object.assign(t, { etape: "erreur", message: (e as Error).message.slice(0, 200) });
      }
      this.d.surFin?.(id, t);
    });
  }

  /** Attend la fin des tâches de fond (tests, arrêt propre). */
  attendre(): Promise<unknown> {
    return this.enCours;
  }

  private async creerPropositions(id: string, titre: string, doc: DocumentLu): Promise<{ creees: number; ecartees: number }> {
    const m = this.d.memoire!;
    const src = this.d.catalogue.lire(id)!;
    // Garde anti-réintroduction : un énoncé déjà connu pour cette source (même corrigé depuis) ne revient pas.
    const connus = new Set<string>();
    const actuels: string[] = [];
    for (const x of tousLes(m, ["valide", "a_confirmer", "observe", "retire"])) {
      if (!x.element.source.ref.startsWith(`corpus:${id} `)) continue;
      if (x.element.statut !== "retire") actuels.push(x.element.contenu);
      for (const v of m.historique(x.element.id)) connus.add(normaliserCitation(v.contenu));
    }
    // Le modèle (local) reçoit ce qui est déjà connu, pour chercher ce qui manque plutôt que le redire.
    const r = await proposer(titre, doc.passages, this.d.generer!, actuels);
    // Même garde par le sens (bge-m3) : une reformulation d'un énoncé déjà connu (corrigé depuis, par exemple)
    // ou d'une proposition du même lot ne revient pas. bge-m3 injoignable : garde exacte seulement.
    const anciens = [...connus];
    let vecteurs: Float32Array[] = [];
    try {
      vecteurs = await this.d.vectoriser([...r.retenues.map((p) => p.enonce), ...anciens]);
    } catch {
      vecteurs = [];
    }
    const proche = (i: number, deja: number[]) =>
      vecteurs.length > 0 && [...deja.map((k) => vecteurs[k]!), ...vecteurs.slice(r.retenues.length)].some((v) => produit(vecteurs[i]!, v) >= SEUIL_REFORMULATION);
    const gardees: number[] = [];
    let creees = 0;
    let ecartees = r.ecartees;
    for (const [i, p] of r.retenues.entries()) {
      if (connus.has(normaliserCitation(p.enonce)) || proche(i, gardees) || this.d.catalogue.citationOubliee(empreinte(normaliserCitation(p.citation)))) {
        ecartees++;
        continue;
      }
      gardees.push(i);
      try {
        m.enregistrer(
          {
            compartiment: src.compartiment as never, forme: p.forme, contenu: p.enonce,
            details: { citation: p.citation, source_id: id, document: titre, ref: p.ref, raison: p.raison, incertitude: p.incertitude, version: doc.empreinte.slice(0, 12) },
            source: { voie: "proposition", ref: `corpus:${id} ${p.ref} v${src.version}`, affirmeParIA: true },
            portee: "local_seulement", restrictions: restrictionsPour([], src.niveau),
          },
          OUTIL,
        );
        creees++;
      } catch (e) {
        if (!(e instanceof RefusMemoire)) throw e;
        ecartees++; // doublon, oublié ou exclu : jamais réintroduit
      }
    }
    this.journal("imports.md", `${id} · ${creees} proposition(s), ${ecartees} écartée(s), ${r.ms} ms`);
    return { creees, ecartees };
  }

  /**
   * Propositions en attente d'une source : toutes retirées (source retirée), ou, pour une nouvelle version,
   * seulement celles dont la citation n'est plus dans le texte (les autres restent valables, inchangées).
   */
  private retirerPropositionsEnAttente(id: string, motif: string, nouveauTexte?: string): number {
    const m = this.d.memoire;
    if (!m) return 0;
    const texte = nouveauTexte === undefined ? null : normaliserCitation(nouveauTexte);
    let n = 0;
    for (const x of tousLes(m, ["a_confirmer"])) {
      if (!x.element.source.ref.startsWith(`corpus:${id} `)) continue;
      const citation = normaliserCitation(x.element.details["citation"] ?? "");
      if (texte !== null && citation && texte.includes(citation)) continue;
      m.retirer(x.element.id, motif, MICKAEL);
      n++;
    }
    return n;
  }

  /** Oublie un élément de mémoire et garde l'empreinte de sa citation (anti-retour, même reformulé). */
  private oublier(id: string, citation: string | undefined): number {
    if (citation) this.d.catalogue.oublierCitation(empreinte(normaliserCitation(citation)), this.maintenant().toISOString());
    return this.d.memoire!.oublier(id, MICKAEL).oublies;
  }

  /** Souvenirs validés issus d'une source : nombre à montrer avant de retirer (« garder ou oublier aussi »). */
  souvenirsDe(id: string): { valides: number; enAttente: number } {
    return { valides: this.issusDe(id, ["valide"]).length, enAttente: this.issusDe(id, ["a_confirmer"]).length };
  }

  /**
   * Retire une source : invisible tout de suite, fichier admis effacé, propositions en attente retirées.
   * Souvenirs validés qui en viennent : « garder » (ils portent « source retirée le … ») ou « oublier »
   * (effacés de la mémoire, de ses index et dérivés, empreintes anti-retour comprises).
   */
  retirer(id: string, souvenirs: "garder" | "oublier" = "garder"): { retire: true; propositionsRetirees: number; souvenirsGardes: number; souvenirsOublies: number } {
    const s = this.d.catalogue.lire(id);
    if (!s || s.statut === "revoque") throw new ErreurCorpus(404, "source_inconnue", "Source inconnue ou déjà retirée.");
    const quand = this.maintenant().toISOString();
    this.d.catalogue.statut(id, "revoque", quand);
    this.d.corpus.retirerSource(id);
    rmSync(join(this.d.brut, id), { recursive: true, force: true });
    const propositionsRetirees = this.retirerPropositionsEnAttente(id, "source retirée du Corpus");
    let souvenirsGardes = 0;
    let souvenirsOublies = 0;
    for (const x of this.issusDe(id, ["valide"])) {
      if (souvenirs === "oublier") souvenirsOublies += this.oublier(x.element.id, x.element.details["citation"]);
      else {
        this.d.memoire!.annoter(x.element.id, { source_retiree_le: quand }, MICKAEL);
        souvenirsGardes++;
      }
    }
    this.taches.delete(id);
    this.journal("retraits.md", `${id} · retiré · ${propositionsRetirees} proposition(s) retirée(s), ${souvenirsGardes} souvenir(s) gardé(s), ${souvenirsOublies} oublié(s)`);
    return { retire: true, propositionsRetirees, souvenirsGardes, souvenirsOublies };
  }

  /** Change le niveau d'un document (et de ses propositions en attente, qui en héritent). */
  fixerNiveau(id: string, niveau: Niveau): { id: string; niveau: Niveau } {
    const s = this.d.catalogue.lire(id);
    if (!s || s.statut === "revoque") throw new ErreurCorpus(404, "source_inconnue", "Source inconnue ou retirée.");
    if (!NIVEAUX.includes(niveau)) throw new ErreurCorpus(400, "niveau_inconnu", "Niveau : public, interne, confidentiel ou personnel.");
    this.d.catalogue.fixerNiveau(id, niveau);
    for (const x of this.issusDe(id, ["a_confirmer"])) this.d.memoire!.fixerNiveau(x.element.id, niveau, MICKAEL);
    this.journal("imports.md", `${id} · niveau ${niveau}`);
    return { id, niveau };
  }

  /** Relit le fichier admis et réindexe (sans nouvelles propositions). */
  async reindexer(id: string): Promise<{ extraits: number }> {
    this.exigerPublic("réindexer");
    const s = this.d.catalogue.lire(id);
    if (!s || s.statut === "revoque") throw new ErreurCorpus(404, "source_inconnue", "Source inconnue ou retirée.");
    let doc: DocumentLu;
    try {
      doc = await lireDocument(s.nom, readFileSync(join(this.d.brut, s.fichier)), this.d.parseurs ?? parseursMac);
    } catch (e) {
      this.d.catalogue.statut(id, "echec");
      throw new ErreurCorpus(422, "reindexation_impossible", `Réindexation impossible : ${(e as Error).message}`);
    }
    const extraits = this.d.corpus.indexerPassages(id, `prive/${id}`, s.nom.replace(/\.[^.]+$/, ""), doc.empreinte, s.dateSource, doc.passages);
    if (s.statut === "echec") this.d.catalogue.statut(id, "indexe");
    this.fondDe(id, false, s.nom, doc);
    return { extraits };
  }

  /** Sources privées dont l'index a disparu (index reconstruit) : réindexées depuis les fichiers admis. */
  async rattraper(): Promise<number> {
    let n = 0;
    for (const e of this.d.corpus.indexer()) {
      if (e.etat !== "a_reindexer" || !this.d.catalogue.lire(e.id)) continue;
      try {
        await this.reindexer(e.id);
        n++;
      } catch {
        /* état « echec » inscrit au catalogue */
      }
    }
    return n;
  }

  /** Sources privées visibles dans le mode courant, avec leur état : disponible, analyse en cours, propositions prêtes. */
  sources(): (Omit<SourcePrivee, "fichier"> & { tache: Tache | null; etat: EtatDocument; propositionsEnAttente: number })[] {
    const p = this.permis();
    const attente = new Map<string, number>();
    if (this.d.memoire && !this.d.prive())
      for (const x of tousLes(this.d.memoire, ["a_confirmer"])) {
        const m = /^corpus:(prive-[0-9a-f]{12}) /.exec(x.element.source.ref);
        if (m && this.visible(x.element.restrictions)) attente.set(m[1]!, (attente.get(m[1]!) ?? 0) + 1);
      }
    return this.d.catalogue
      .lister()
      .filter((s) => p.includes(s.niveau))
      .map(({ fichier: _f, ...s }) => {
        const tache = this.taches.get(s.id) ?? null;
        const n = attente.get(s.id) ?? 0;
        const etat: EtatDocument = s.statut === "echec" ? "echec" : tache && (tache.etape === "sens" || tache.etape === "propositions" || tache.etape === "indexation") ? "analyse_en_cours" : n > 0 ? "propositions_pretes" : "disponible";
        return { ...s, tache, etat, propositionsEnAttente: n };
      });
  }

  /** Comptes visibles dans le mode courant (ligne d'état) : rien n'y trahit un niveau masqué. */
  comptes(): { sourcesPrivees: number; propositions: number | null } {
    const p = this.permis();
    const sources = this.d.catalogue.lister().filter((s) => s.statut !== "revoque" && p.includes(s.niveau)).length;
    let propositions: number | null = null;
    if (this.d.memoire && !this.d.prive()) propositions = this.propositions().total;
    return { sourcesPrivees: sources, propositions };
  }

  /** Connaissances validées visibles (les plus récentes), pour en voir et changer le niveau. */
  connaissances(limite = 30): { id: string; contenu: string; forme: string; compartiment: string; niveau: Niveau; valideLe: string | null; provenance: string }[] {
    this.exigerPublic("consulter la mémoire");
    const m = this.d.memoire;
    if (!m) throw new ErreurCorpus(503, "memoire_indisponible", "Mémoire indisponible : volume chiffré absent.");
    return tousLes(m, ["valide"])
      .filter((x) => this.visible(x.element.restrictions))
      .sort((a, b) => (b.element.valideLe ?? "").localeCompare(a.element.valideLe ?? ""))
      .slice(0, limite)
      .map((x) => ({ id: x.element.id, contenu: x.element.contenu, forme: x.element.forme, compartiment: x.element.compartiment, niveau: niveauDe(x.element.restrictions), valideLe: x.element.valideLe, provenance: x.provenance }));
  }

  /** Change le niveau d'une connaissance validée (Mickaël). Masquée dans ce mode : introuvable, sans le dire. */
  fixerNiveauConnaissance(id: string, niveau: Niveau): { id: string; niveau: Niveau } {
    this.exigerPublic("modifier la mémoire");
    const m = this.d.memoire;
    if (!m) throw new ErreurCorpus(503, "memoire_indisponible", "Mémoire indisponible : volume chiffré absent.");
    const e = m.historique(id).at(-1);
    if (!e || !this.visible(e.restrictions)) throw new ErreurCorpus(404, "connaissance_inconnue", "Connaissance introuvable.");
    if (!NIVEAUX.includes(niveau)) throw new ErreurCorpus(400, "niveau_inconnu", "Niveau : public, interne, confidentiel ou personnel.");
    m.fixerNiveau(id, niveau, MICKAEL);
    return { id, niveau };
  }

  /** Lot de propositions à confirmer (8 au plus), avec les souvenirs validés proches (doublons, contradictions). */
  propositions(): { total: number; reportees: number; lot: unknown[] } {
    this.exigerPublic("consulter les propositions");
    const m = this.d.memoire;
    if (!m) throw new ErreurCorpus(503, "memoire_indisponible", "Mémoire indisponible : volume chiffré absent.");
    const reportes = this.d.catalogue.reportes(this.maintenant().toISOString());
    const tous = tousLes(m, ["a_confirmer"]).filter((x) => this.visible(x.element.restrictions));
    const actifs = tous.filter((x) => !reportes.has(x.element.id));
    const lot = actifs.slice(0, LOT_PROPOSITIONS).map((x) => {
      const e = x.element;
      const proches = m
        .retrouver({ texte: e.contenu, compartiment: e.compartiment as never, statuts: ["valide"], limite: 3 }, { type: "mickael" })
        .filter((y) => y.element.id !== e.id && this.visible(y.element.restrictions))
        .map((y) => ({ id: y.element.id, contenu: y.element.contenu, forme: y.element.forme, valideLe: y.element.valideLe }));
      return { id: e.id, enonce: e.contenu, forme: e.forme, compartiment: e.compartiment, niveau: niveauDe(e.restrictions), date: e.date, portee: e.portee, provenance: x.provenance, details: e.details, proches };
    });
    return { total: actifs.length, reportees: tous.length - actifs.length, lot };
  }

  /** Décision explicite de Mickaël sur une proposition. Aucune validation automatique. */
  decider(id: string, action: "valider" | "corriger" | "refuser" | "reporter", contenu?: string, niveau?: Niveau): Record<string, unknown> {
    this.exigerPublic("valider une proposition");
    const m = this.d.memoire;
    if (!m) throw new ErreurCorpus(503, "memoire_indisponible", "Mémoire indisponible : volume chiffré absent.");
    const e = m.historique(id).at(-1);
    if (!e || !this.visible(e.restrictions)) throw new ErreurCorpus(404, "proposition_inconnue", "Proposition introuvable.");
    if (niveau !== undefined && !NIVEAUX.includes(niveau)) throw new ErreurCorpus(400, "niveau_inconnu", "Niveau : public, interne, confidentiel ou personnel.");
    if (e.statut !== "a_confirmer") throw new ErreurCorpus(409, "deja_decidee", `Cette proposition est déjà « ${e.statut} ».`);
    try {
      switch (action) {
        case "valider": {
          const v = m.corriger(id, { valider: true }, MICKAEL);
          // Niveau confirmé par Mickaël à la validation (proposé : celui du document).
          const n = niveau ? m.fixerNiveau(id, niveau, MICKAEL) : v;
          return { id, statut: v.statut, version: v.version, valideLe: v.valideLe, niveau: niveauDe(n.restrictions) };
        }
        case "corriger": {
          if (!contenu?.trim()) throw new ErreurCorpus(400, "contenu_requis", "Nouvel énoncé requis.");
          const v = m.corriger(id, { contenu: contenu.trim(), valider: true }, MICKAEL);
          const n = niveau ? m.fixerNiveau(id, niveau, MICKAEL) : v;
          return { id, statut: v.statut, version: v.version, contenu: v.contenu, niveau: niveauDe(n.restrictions) };
        }
        case "refuser":
          // Oubli : la proposition et son empreinte disparaissent ; ni une réindexation ni un redépôt ne la ramènent.
          return { id, oublies: this.oublier(id, e.details["citation"]), statut: "refusee" };
        case "reporter": {
          const jusquAu = new Date(this.maintenant().getTime() + 7 * 86_400_000).toISOString();
          this.d.catalogue.reporter(id, jusquAu);
          return { id, statut: "reportee", jusquAu };
        }
      }
    } catch (err) {
      if (err instanceof RefusMemoire) throw new ErreurCorpus(422, err.code, err.message);
      throw err;
    }
  }

  /** « Voir l'origine » : tous les extraits d'une source privée, dans l'ordre, avec leurs références. */
  extraits(id: string): ExtraitCorpus[] {
    return this.d.corpus.extraitsDe(id, { type: "mickael" }, this.permis());
  }

  /** Recherche pour l'écran (Mickaël) ; le vecteur de la question est calculé par l'appelant. */
  chercher(q: string, vecteur: Float32Array | null, opts: { sources?: string[]; compartiment?: string; limite?: number } = {}): { mode: "sens" | "mots"; resultats: ExtraitCorpus[] } {
    const r = this.d.corpus
      .chercher(q, { type: "mickael" }, opts.limite ?? 20, { vecteur, plancher: PLANCHER_ECRAN, niveaux: this.permis(), parDocument: opts.sources?.length === 1 ? 20 : 3, ...(opts.sources ? { sources: opts.sources } : {}) })
      .filter((x) => !opts.compartiment || x.compartiment === opts.compartiment);
    return { mode: vecteur && this.d.corpus.comptes().avecSens > 0 ? "sens" : "mots", resultats: r };
  }
}
