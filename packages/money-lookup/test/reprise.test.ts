import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { createLocalStorageStore, exportWorkspace, type AuditEvent, type TaskItem, type WorkspaceBackup } from "@oia/workspace";
import { demarrer, erreur, postgresDisponible, type Banc } from "../../database/test/pg/banc";

/**
 * Reprise du navigateur (A4), corrigée par 0008. La sauvegarde est produite
 * par le code de l'ancienne console (`exportWorkspace` sur un stockage du
 * navigateur) : chaque clé jamais initialisée y vaut `null`. Données fictives.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../../database/supabase/migrations/${n}`);
const STUDIO = "00000000-0000-4000-8000-000000000001";
const M1 = "11111111-aaaa-4000-8000-000000000001";

/** Le stockage du navigateur, tel que la console le lit et l'écrit. */
function navigateur() {
  const items = new Map<string, string>();
  const storage = { getItem: (k: string) => items.get(k) ?? null, setItem: (k: string, v: string) => void items.set(k, v) };
  return createLocalStorageStore(storage);
}

const DECISIONS: AuditEvent[] = [
  { id: "audit-kx1-1", recordId: "rec-fictif-1", action: "APPROVE", comment: "Bon candidat fictif", at: "2026-10-02T09:00:00.000Z", actor: "mickael", gatePursueEligibleAtDecision: true },
  { id: "audit-kx1-2", recordId: "rec-fictif-1", action: "COMMENT", comment: "Relancer l'organisme", at: "2026-10-03T09:00:00.000Z", actor: "mickael", gatePursueEligibleAtDecision: true },
];
const TACHES: TaskItem[] = [
  { id: "tasks-kx2-1", at: "2026-10-02T10:00:00.000Z", actor: "mickael", title: "Préparer le dossier fictif", due: "2026-12-01", status: "OPEN", recordId: "rec-fictif-1", projectSlug: "projet-fictif" },
  { id: "tasks-kx2-2", at: "2026-10-01T10:00:00.000Z", actor: "mickael", title: "Lire le règlement fictif", status: "DONE", completedAt: "2026-10-04T08:00:00.000Z" },
];

/** Sauvegarde réelle de la console : seules les décisions, les tâches et les étiquettes ont été utilisées. */
function sauvegardePartielle(taches = TACHES): WorkspaceBackup {
  const s = navigateur();
  s.write("oia.audit.v1", DECISIONS);
  s.write("oia.tasks.v1", taches);
  s.write("oia.tags.v1", { "rec-fictif-1": "projet-fictif" });
  return exportWorkspace(s, "2026-11-08T07:00:00.000Z");
}

let b: Banc;
const en = { role: "authenticated", utilisateur: M1 };
const sql = (q: string) => b.sql(q, en);
const json = (q: string) => JSON.parse(sql(q));
const importer = (s: WorkspaceBackup) => json(`select oia_importer_sauvegarde('${STUDIO}', $j$${JSON.stringify(s)}$j$::jsonb)`);
let erreurAvant0008 = "";
let importAncien = "";

describe.skipIf(!postgresDisponible)("A4 · reprise du navigateur, sauvegarde réelle de la console", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("../../database/test/pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    for (const m of ["0003_membres_et_politiques.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(MIG(m));
    b.sql(`insert into auth.users (id, email) values ('${M1}', 'm1@exemple.test'); insert into oia_membre (user_id, espace_id, role) values ('${M1}', '${STUDIO}', 'proprietaire');`);
    // Avant 0008 : la sauvegarde partielle échoue ; une sauvegarde complète passe (import « ancien »).
    erreurAvant0008 = erreur(b, `select oia_importer_sauvegarde('${STUDIO}', $j$${JSON.stringify(sauvegardePartielle())}$j$::jsonb)`, en) ?? "";
    const complete = navigateur();
    for (const k of ["oia.audit.v1", "oia.views.v1", "oia.notes.v1", "oia.tasks.v1", "oia.contacts.v1"]) complete.write(k, []);
    complete.write("oia.notes.v1", [{ id: "notes-old-1", at: "2026-09-01T10:00:00.000Z", actor: "mickael", text: "Note d'un import ancien" }]);
    complete.write("oia.tags.v1", {});
    importAncien = String(importer(exportWorkspace(complete, "2026-09-02T07:00:00.000Z")).import_id);
    b.fichier(MIG("0008_money_lookup_v2.sql"));
  });
  afterAll(() => b?.arreter());

  it("la sauvegarde de la console contient des clés à null, et l'import de la v1 la refusait", () => {
    const s = sauvegardePartielle();
    expect(s.data["oia.notes.v1"]).toBeNull();
    expect(s.data["oia.contacts.v1"]).toBeNull();
    expect(s.data["oia.views.v1"]).toBeNull();
    expect(erreurAvant0008).toMatch(/cannot extract elements from a scalar|cannot call jsonb_each on a non-object/);
  });

  it("0008 l'accepte : les clés à null valent « vide », rien n'est perdu, l'auteur d'origine est relu", () => {
    const bilan = importer(sauvegardePartielle());
    expect(bilan).toMatchObject({ decisions: 2, taches: 2, notes: 0, contacts: 0, vues: 0, etiquettes: 1 });
    expect(json(`select json_agg(json_build_object('a', action, 'o', auteur_origine, 'g', gate_ok_au_moment) order by le) from ml_avis_v1 where id_origine like 'audit-kx1%'`))
      .toEqual([{ a: "APPROVE", o: "mickael", g: true }, { a: "COMMENT", o: "mickael", g: true }]);
    expect(json(`select json_agg(json_build_object('t', titre, 's', statut, 'f', faite_le is not null, 'o', auteur_origine) order by titre) from ml_taches_v1 where import_id = '${bilan.import_id}'`))
      .toEqual([{ t: "Lire le règlement fictif", s: "DONE", f: true, o: "mickael" }, { t: "Préparer le dossier fictif", s: "OPEN", f: false, o: "mickael" }]);
    expect(sql(`select decision from ml_decision_v2 where record_id = 'rec-fictif-1'`)).toBe("APPROVE");
  });

  it("rejouer le même fichier n'ajoute rien ; le bilan compte les éléments déjà présents", () => {
    const bilan = importer(sauvegardePartielle());
    expect(bilan).toMatchObject({ decisions: 0, taches: 0, etiquettes: 0 });
    expect(bilan.deja_presents).toMatchObject({ decisions: 2, taches: 2, etiquettes: 1 });
    expect(bilan.conflits).toMatchObject({ decisions: [], taches: [], etiquettes: [] });
  });

  it("un même identifiant au contenu différent est un conflit : signalé, jamais écrasé", () => {
    const modifiees = [{ ...TACHES[0]!, title: "Titre changé dans le navigateur" }, TACHES[1]!];
    const bilan = importer(sauvegardePartielle(modifiees));
    expect(bilan.conflits.taches).toEqual(["tasks-kx2-1"]);
    expect(sql(`select count(*) from ml_taches_v1 where titre = 'Titre changé dans le navigateur'`)).toBe("0");
  });

  it("une valeur d'un autre type est refusée, et rien n'est importé", () => {
    const s = sauvegardePartielle();
    const avant = sql(`select count(*) from ml_imports_v1`);
    expect(erreur(b, `select oia_importer_sauvegarde('${STUDIO}', $j$${JSON.stringify({ ...s, data: { ...s.data, "oia.notes.v1": "texte" } })}$j$::jsonb)`, en)).toMatch(/une liste était attendue/);
    expect(sql(`select count(*) from ml_imports_v1`)).toBe(avant);
  });

  it("annulation : aperçu des éléments modifiés depuis l'import, refus sans confirmation, puis suppression confirmée", () => {
    const id = sql(`select id from ml_imports_v1 where (bilan ->> 'taches')::int = 2`);
    // Modifications après import : tâche terminée, étiquette déplacée.
    const tache = sql(`select id from ml_taches_v1 where import_id = '${id}' and statut = 'OPEN'`);
    sql(`select oia_basculer_tache('${tache}')`);
    sql(`select oia_etiqueter('${STUDIO}', 'rec-fictif-1', 'autre-projet-fictif')`);
    const apercu = json(`select oia_apercu_annulation('${id}')`);
    expect(apercu.a_supprimer).toMatchObject({ reviews: 2, tasks: 2, project_tags: 1 });
    expect(apercu.modifies_depuis_import.map((m: { table: string }) => m.table).sort()).toEqual(["project_tags", "tasks"]);
    expect(apercu.non_verifiables).toBe(0);
    expect(erreur(b, `select oia_annuler_import('${id}')`, en)).toMatch(/2 élément\(s\) importé\(s\) modifié\(s\) depuis l'import/);
    expect(sql(`select count(*) from ml_taches_v1 where import_id = '${id}'`)).toBe("2");
    const bilan = json(`select oia_annuler_import('${id}', true)`);
    expect(bilan).toMatchObject({ decisions: 2, taches: 2, etiquettes: 1 });
    expect(bilan.modifies_confirmes).toHaveLength(2);
    expect(sql(`select count(*) from ml_taches_v1 where import_id = '${id}'`)).toBe("0");
    expect(sql(`select actif::text from ml_imports_v1 where id = '${id}'`)).toBe("false");
  });

  it("un import antérieur à 0008 n'est pas vérifiable : l'annulation demande aussi confirmation", () => {
    const apercu = json(`select oia_apercu_annulation('${importAncien}')`);
    expect(apercu).toMatchObject({ a_supprimer: { notes: 1 }, non_verifiables: 1 });
    expect(erreur(b, `select oia_annuler_import('${importAncien}')`, en)).toMatch(/1 non vérifiable\(s\)/);
    expect(json(`select oia_annuler_import('${importAncien}', true)`)).toMatchObject({ notes: 1 });
  });
});
