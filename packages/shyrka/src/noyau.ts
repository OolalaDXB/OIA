import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Noyau de Shyrka (mandat v8, bloc C ; ADR docs/shyrka/adr/0003-shyrka-autonome.md).
 *
 * Indépendant de toute application hôte : identité, contexte, sources,
 * permissions, applications hôtes, journal. Version simulée, en mémoire,
 * locale : aucun appel réseau.
 *
 * Trois accès, séparés par construction :
 * - Mickaël (`AccesMickael`) : accorde et révoque les permissions, valide,
 *   retire et oublie le contexte, active le mode privé, exporte. Il ne
 *   modifie pas l'identité de Shyrka.
 * - Shyrka (`AccesShyrka`) : choisit sa voix, son apparence, son expression,
 *   et dérive des éléments. Elle n'a aucun moyen d'accorder une permission.
 * - Une application hôte (`ClientHote`) : fournit du contexte, lit, agit,
 *   seulement dans ce que Mickaël lui a accordé, vérifié à chaque appel.
 */

export const MICKAEL = "Mickaël Thomas" as const;
export const NOYAU = "noyau" as const;

export type Statut = "a_valider" | "valide" | "retire";
export type Portee = "global" | "projet" | "client";
export type Capacite = `fournir:${string}` | `lire:${string}` | `action:${string}`;

export interface ElementDeContexte {
  id: string;
  type: string;
  contenu: string;
  source: string;
  application: string;
  date: string;
  statut: Statut;
  portee: Portee;
  deriveDe: string[];
}

export interface Source {
  id: string;
  nom: string;
  application: string;
  ajouteeLe: string;
}

export interface Permission {
  application: string;
  capacite: Capacite;
  accordeePar: typeof MICKAEL;
  le: string;
}

export interface EntreeJournal {
  n: number;
  le: string;
  acteur: string;
  quoi: string;
  application: string | null;
  cible: string | null;
  resultat: "autorise" | "refuse" | "info";
}

export interface Identite {
  version: number;
  voix: string;
  apparence: string;
  expression: string;
  choisiePar: "Shyrka" | "Mickaël Thomas (version 0)";
  le: string;
}

/** Version 0, décidée par Mickaël le 7 novembre 2026 (CADRE.md, « Identité »). */
export const IDENTITE_V0: Identite = {
  version: 0,
  voix: "Aurélie",
  apparence: "Lovable Shyrka v0, présence en points",
  expression: "docs/shyrka/style.md",
  choisiePar: "Mickaël Thomas (version 0)",
  le: "2026-11-07",
};

const Nom = z.string().regex(/^[a-z0-9][a-z0-9-]{1,40}$/);
const Libre = z.string().trim().min(1).max(200);

/** Ce qu'une application déclare en s'enregistrant. Aucun champ de permission. */
export const DeclarationSchema = z
  .object({
    id: Nom,
    nom: Libre,
    fournit: z.array(Nom).max(50),
    actions: z.array(Nom).max(50),
  })
  .strict();
export type Declaration = z.infer<typeof DeclarationSchema>;

/** Ce que Shyrka peut changer de son identité : voix, apparence, expression. Rien d'autre. */
export const ChoixIdentiteSchema = z
  .object({ voix: Libre.optional(), apparence: Libre.optional(), expression: Libre.optional() })
  .strict()
  .refine((c) => Object.keys(c).length > 0, { message: "aucun changement" });

export const FournitureSchema = z
  .object({ type: Nom, contenu: z.string().min(1).max(20_000), source: Nom, portee: z.enum(["global", "projet", "client"]) })
  .strict();

export class RefusShyrka extends Error {
  constructor(
    message: string,
    readonly code: "permission_refusee" | "valeur_refusee" | "introuvable" | "oublie" | "mode_prive",
  ) {
    super(message);
  }
}

export interface Sauvegarde {
  format: "shyrka.sauvegarde";
  version: 1;
  faiteLe: string;
  elements: ElementDeContexte[];
}

export interface Export {
  format: "shyrka.contexte.export";
  version: 1;
  exporteLe: string;
  identite: Identite;
  elements: ElementDeContexte[];
  sources: Source[];
  applications: (Declaration & { enregistreeLe: string })[];
  permissions: Permission[];
  journal: EntreeJournal[];
}

export interface ClientHote {
  readonly id: string;
  fournir(f: z.input<typeof FournitureSchema>): { conserve: boolean; id: string | null };
  lire(): ElementDeContexte[];
  chercher(mot: string): ElementDeContexte[];
  agir(action: string): { fait: true };
}

export interface AccesMickael {
  accorder(application: string, capacite: Capacite): void;
  revoquer(application: string, capacite: Capacite): void;
  valider(id: string): void;
  retirer(id: string): void;
  oublier(id: string): { oublies: number };
  modePrive(actif: boolean): void;
  sauvegarder(): Sauvegarde;
  restaurer(s: Sauvegarde): { restaures: number; ecartes: number };
  exporter(): Export;
  etat(): EtatNoyau;
}

export interface AccesShyrka {
  modifierIdentite(choix: z.input<typeof ChoixIdentiteSchema>): Identite;
  deriver(depuis: string[], contenu: string): string;
}

/** Lecture interne pour les vues de l'interface (contrat Shyrka). */
export interface EtatNoyau {
  identite: Identite;
  elements: ElementDeContexte[];
  sources: Source[];
  applications: (Declaration & { enregistreeLe: string })[];
  permissions: Permission[];
  journal: EntreeJournal[];
  modePrive: boolean;
}

export interface Noyau {
  identite(): Identite;
  enregistrer(declaration: Declaration): ClientHote;
}

const empreinte = (s: string) => createHash("sha256").update(s).digest("hex");
const motsDe = (t: string) => [...new Set(t.toLowerCase().normalize("NFC").match(/[\p{L}\p{N}]{3,}/gu) ?? [])];

export function creerNoyau(opts: { horloge?: () => string } = {}): { noyau: Noyau; mickael: AccesMickael; shyrka: AccesShyrka } {
  const horloge = opts.horloge ?? (() => new Date().toISOString());
  let identite: Identite = { ...IDENTITE_V0 };
  const elements = new Map<string, ElementDeContexte>();
  const index = new Map<string, Set<string>>();
  const sources = new Map<string, Source>();
  const applications = new Map<string, Declaration & { enregistreeLe: string }>();
  let permissions: Permission[] = [];
  const journal: EntreeJournal[] = [];
  /** Empreintes des éléments oubliés (identifiant, et application + type + contenu). Jamais le contenu. */
  const oublies = new Set<string>();
  let prive = false;
  let compteur = 0;

  const noter = (e: Omit<EntreeJournal, "n" | "le">) => {
    journal.push({ n: journal.length + 1, le: horloge(), ...e });
  };
  const refuser = (application: string | null, quoi: string, cible: string | null, message: string, code: RefusShyrka["code"] = "permission_refusee"): never => {
    noter({ acteur: application ?? MICKAEL, quoi, application, cible, resultat: "refuse" });
    throw new RefusShyrka(message, code);
  };
  // Vérifiée à chaque appel, sans cache : une révocation vaut immédiatement.
  const autorise = (application: string, capacite: Capacite) => permissions.some((p) => p.application === application && p.capacite === capacite);
  // Une copie dérivée n'est visible que si toutes ses sources le sont : une
  // dérivation ne fait jamais passer le contexte d'une application à une autre.
  const visiblePar = (application: string, e: ElementDeContexte): boolean =>
    e.statut !== "retire" &&
    (e.deriveDe.length > 0
      ? e.deriveDe.every((d) => {
          const parent = elements.get(d);
          return parent !== undefined && visiblePar(application, parent);
        })
      : e.application === application || autorise(application, `lire:${e.application}`));
  const indexer = (e: ElementDeContexte) => {
    for (const m of motsDe(e.contenu)) {
      if (!index.has(m)) index.set(m, new Set());
      index.get(m)!.add(e.id);
    }
  };
  const desindexer = (id: string) => {
    for (const [m, ids] of index) {
      ids.delete(id);
      if (ids.size === 0) index.delete(m);
    }
  };
  const cleContenu = (application: string, type: string, contenu: string) => empreinte(`${application}\n${type}\n${contenu}`);
  const estOublie = (e: Pick<ElementDeContexte, "id" | "application" | "type" | "contenu">) =>
    oublies.has(empreinte(e.id)) || oublies.has(cleContenu(e.application, e.type, e.contenu));
  const ajouter = (e: ElementDeContexte) => {
    elements.set(e.id, e);
    indexer(e);
  };
  const exiger = (id: string) => elements.get(id) ?? refuser(null, "contexte.introuvable", empreinte(id).slice(0, 12), "élément introuvable", "introuvable");

  const noyau: Noyau = {
    identite: () => ({ ...identite }),
    enregistrer(declaration) {
      const d = DeclarationSchema.safeParse(declaration);
      if (!d.success) refuser(null, "application.declaration_refusee", null, `déclaration refusée : ${d.error.issues.map((i) => i.message).join(", ")}`, "valeur_refusee");
      const decl = d.data!;
      if (decl.id === NOYAU || applications.has(decl.id)) refuser(decl.id, "application.deja_enregistree", decl.id, "identifiant déjà pris", "valeur_refusee");
      applications.set(decl.id, { ...decl, enregistreeLe: horloge() });
      noter({ acteur: decl.id, quoi: "application.enregistree", application: decl.id, cible: null, resultat: "info" });
      const app = decl.id;
      return {
        id: app,
        fournir(f) {
          const p = FournitureSchema.safeParse(f);
          if (!p.success) refuser(app, "contexte.fourniture_refusee", null, "fourniture invalide", "valeur_refusee");
          const { type, contenu, source, portee } = p.data!;
          if (!autorise(app, `fournir:${type}`)) refuser(app, "contexte.fournir", `fournir:${type}`, `permission non accordée : fournir:${type}`);
          if (prive) return { conserve: false, id: null }; // Mode privé : rien n'est conservé, rien n'est journalisé du contenu.
          if (oublies.has(cleContenu(app, type, contenu))) refuser(app, "contexte.deja_oublie", null, "cet élément a été oublié", "oublie");
          const sid = `${app}:${source}`;
          if (!sources.has(sid)) sources.set(sid, { id: sid, nom: source, application: app, ajouteeLe: horloge() });
          const id = `ctx-${String(++compteur).padStart(6, "0")}`;
          ajouter({ id, type, contenu, source: sid, application: app, date: horloge(), statut: "a_valider", portee, deriveDe: [] });
          noter({ acteur: app, quoi: "contexte.fourni", application: app, cible: id, resultat: "autorise" });
          return { conserve: true, id };
        },
        lire() {
          return [...elements.values()].filter((e) => visiblePar(app, e)).map((e) => ({ ...e, deriveDe: [...e.deriveDe] }));
        },
        chercher(mot) {
          const ids = index.get(mot.toLowerCase().normalize("NFC")) ?? new Set<string>();
          return [...ids].map((id) => elements.get(id)!).filter((e) => e && visiblePar(app, e)).map((e) => ({ ...e }));
        },
        agir(action) {
          if (!applications.get(app)!.actions.includes(action) || !autorise(app, `action:${action}`)) refuser(app, "action", `action:${action}`, `permission non accordée : action:${action}`);
          noter({ acteur: app, quoi: "action", application: app, cible: `action:${action}`, resultat: "autorise" });
          return { fait: true };
        },
      };
    },
  };

  const mickael: AccesMickael = {
    accorder(application, capacite) {
      const decl = applications.get(application);
      if (!decl) refuser(null, "permission.accorder", capacite, "application inconnue", "introuvable");
      const [genre, objet] = capacite.split(":") as [string, string];
      if (genre === "fournir" && !decl!.fournit.includes(objet)) refuser(null, "permission.accorder", capacite, "type de contexte non déclaré par l'application", "valeur_refusee");
      if (genre === "action" && !decl!.actions.includes(objet)) refuser(null, "permission.accorder", capacite, "action non déclarée par l'application", "valeur_refusee");
      if (genre === "lire" && objet !== NOYAU && !applications.has(objet)) refuser(null, "permission.accorder", capacite, "application source inconnue", "introuvable");
      if (!["fournir", "lire", "action"].includes(genre)) refuser(null, "permission.accorder", capacite, "capacité inconnue", "valeur_refusee");
      if (!autorise(application, capacite)) permissions.push({ application, capacite, accordeePar: MICKAEL, le: horloge() });
      noter({ acteur: MICKAEL, quoi: "permission.accordee", application, cible: capacite, resultat: "info" });
    },
    revoquer(application, capacite) {
      permissions = permissions.filter((p) => !(p.application === application && p.capacite === capacite));
      noter({ acteur: MICKAEL, quoi: "permission.revoquee", application, cible: capacite, resultat: "info" });
    },
    valider(id) {
      exiger(id).statut = "valide";
      noter({ acteur: MICKAEL, quoi: "contexte.valide", application: null, cible: id, resultat: "info" });
    },
    retirer(id) {
      exiger(id).statut = "retire";
      noter({ acteur: MICKAEL, quoi: "contexte.retire", application: null, cible: id, resultat: "info" });
    },
    oublier(id) {
      exiger(id);
      // L'élément, puis toutes ses copies dérivées, de proche en proche.
      const aOublier = new Set([id]);
      let ajoute = true;
      while (ajoute) {
        ajoute = false;
        for (const e of elements.values()) if (!aOublier.has(e.id) && e.deriveDe.some((d) => aOublier.has(d))) aOublier.add(e.id), (ajoute = true);
      }
      for (const x of aOublier) {
        const e = elements.get(x)!;
        oublies.add(empreinte(x));
        oublies.add(cleContenu(e.application, e.type, e.contenu));
        desindexer(x);
        elements.delete(x);
      }
      // Le journal garde les faits (qui, quand, quoi). Les identifiants oubliés y
      // sont remplacés par leur empreinte : aucune entrée ne pointe plus vers eux.
      for (const j of journal) if (j.cible !== null && aOublier.has(j.cible)) j.cible = `oublie:${empreinte(j.cible).slice(0, 12)}`;
      noter({ acteur: MICKAEL, quoi: "contexte.oublie", application: null, cible: `${aOublier.size} élément(s), ${empreinte(id).slice(0, 12)}`, resultat: "info" });
      return { oublies: aOublier.size };
    },
    modePrive(actif) {
      prive = actif;
      noter({ acteur: MICKAEL, quoi: actif ? "mode_prive.debut" : "mode_prive.fin", application: null, cible: null, resultat: "info" });
    },
    sauvegarder() {
      return { format: "shyrka.sauvegarde", version: 1, faiteLe: horloge(), elements: [...elements.values()].map((e) => ({ ...e, deriveDe: [...e.deriveDe] })) };
    },
    restaurer(s) {
      // Les oublis sont rejoués avant de servir quoi que ce soit : une sauvegarde ne ressuscite rien.
      let restaures = 0;
      let ecartes = 0;
      for (const e of s.elements) {
        if (estOublie(e)) {
          ecartes++;
          continue;
        }
        if (!elements.has(e.id)) {
          ajouter({ ...e, deriveDe: [...e.deriveDe] });
          restaures++;
        }
      }
      noter({ acteur: MICKAEL, quoi: "sauvegarde.restauree", application: null, cible: `${restaures} restauré(s), ${ecartes} écarté(s) car oubliés`, resultat: "info" });
      return { restaures, ecartes };
    },
    exporter() {
      const e = mickael.etat();
      noter({ acteur: MICKAEL, quoi: "contexte.exporte", application: null, cible: null, resultat: "info" });
      return { format: "shyrka.contexte.export", version: 1, exporteLe: horloge(), identite: e.identite, elements: e.elements, sources: e.sources, applications: e.applications, permissions: e.permissions, journal: e.journal };
    },
    etat() {
      return {
        identite: { ...identite },
        elements: [...elements.values()].map((e) => ({ ...e, deriveDe: [...e.deriveDe] })),
        sources: [...sources.values()].map((x) => ({ ...x })),
        applications: [...applications.values()].map((a) => ({ ...a, fournit: [...a.fournit], actions: [...a.actions] })),
        permissions: permissions.map((p) => ({ ...p })),
        journal: journal.map((j) => ({ ...j })),
        modePrive: prive,
      };
    },
  };

  const shyrka: AccesShyrka = {
    modifierIdentite(choix) {
      const c = ChoixIdentiteSchema.safeParse(choix);
      if (!c.success) refuser(null, "identite.refusee", null, `seules la voix, l'apparence et l'expression se choisissent : ${c.error.issues.map((i) => i.message).join(", ")}`, "valeur_refusee");
      identite = { ...identite, ...c.data!, version: identite.version + 1, choisiePar: "Shyrka", le: horloge() };
      noter({ acteur: "Shyrka", quoi: "identite.modifiee", application: null, cible: `version ${identite.version}`, resultat: "info" });
      return { ...identite };
    },
    deriver(depuis, contenu) {
      if (prive) refuser(null, "contexte.derive", null, "mode privé : aucun apprentissage", "mode_prive");
      if (depuis.length === 0) refuser(null, "contexte.derive", null, "une copie dérivée cite au moins un élément", "valeur_refusee");
      for (const d of depuis) exiger(d);
      const id = `ctx-${String(++compteur).padStart(6, "0")}`;
      ajouter({ id, type: "derive", contenu, source: `${NOYAU}:derive`, application: NOYAU, date: horloge(), statut: "a_valider", portee: "global", deriveDe: [...depuis] });
      if (!sources.has(`${NOYAU}:derive`)) sources.set(`${NOYAU}:derive`, { id: `${NOYAU}:derive`, nom: "derive", application: NOYAU, ajouteeLe: horloge() });
      noter({ acteur: "Shyrka", quoi: "contexte.derive", application: null, cible: id, resultat: "info" });
      return id;
    },
  };

  return { noyau, mickael, shyrka };
}
