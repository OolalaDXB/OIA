import type { AccesMickael } from "./noyau";

/**
 * Vues de l'interface, onglet par onglet (contrat docs/interface/contrat-donnees-shyrka.md,
 * version 1). Lecture seule, pour Mickaël : une application hôte n'y a pas accès.
 */
export interface SectionCadre {
  titre: string;
}

export function vuesShyrkaV1(mickael: AccesMickael, cadre: { fichier: string; version: string; sections: SectionCadre[] }) {
  const e = mickael.etat();
  return {
    contexte_v1: e.elements.map((x) => ({
      id: x.id,
      type: x.type,
      contenu: x.contenu,
      source: x.source,
      application: x.application,
      date: x.date,
      statut: x.statut,
      portee: x.portee,
      derive_de: x.deriveDe,
    })),
    sources_v1: e.sources.map((s) => ({
      id: s.id,
      nom: s.nom,
      application: s.application,
      ajoutee_le: s.ajouteeLe,
      elements: e.elements.filter((x) => x.source === s.id).length,
    })),
    permissions_v1: e.permissions.map((p) => ({ application: p.application, capacite: p.capacite, accordee_par: p.accordeePar, le: p.le })),
    cadre_v1: cadre.sections.map((s, i) => ({ ordre: i + 1, section: s.titre, fichier: cadre.fichier, version: cadre.version })),
    identite_v1: [
      {
        version: e.identite.version,
        voix: e.identite.voix,
        apparence: e.identite.apparence,
        expression: e.identite.expression,
        choisie_par: e.identite.choisiePar,
        le: e.identite.le,
      },
    ],
    applications_v1: e.applications.map((a) => ({
      id: a.id,
      nom: a.nom,
      fournit: a.fournit,
      actions: a.actions,
      enregistree_le: a.enregistreeLe,
      permissions: e.permissions.filter((p) => p.application === a.id).map((p) => p.capacite),
    })),
    journal_v1: e.journal.map((j) => ({ n: j.n, le: j.le, acteur: j.acteur, quoi: j.quoi, application: j.application, cible: j.cible, resultat: j.resultat })),
    mode_prive_v1: [{ actif: e.modePrive }],
  };
}

/** Sections de premier niveau (« ## ») d'un fichier Markdown, dans l'ordre. */
export function sectionsDuCadre(markdown: string): SectionCadre[] {
  return markdown
    .split("\n")
    .map((l) => /^## (.+)$/.exec(l)?.[1]?.trim())
    .filter((t): t is string => Boolean(t))
    .map((titre) => ({ titre }));
}
