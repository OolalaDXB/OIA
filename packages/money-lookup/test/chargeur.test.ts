import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ConsoleData, ConsoleRecord } from "@oia/ingestion/console";
import { ESPACE_STUDIO, lignes, sqlAnnulation, sqlChargement, uuidStable } from "../src/chargeur";
import { baseAutorisee } from "../src/cli";
import { demarrer, ecrireTemp, postgresDisponible, type Banc } from "../../database/test/pg/banc";

const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const A = "aaaaaaaa-0000-4000-8000-000000000001";

/** Enregistrement fictif minimal, au format ConsoleRecord. */
function rec(id: string, p: Partial<ConsoleRecord> & { montant?: string } = {}): ConsoleRecord {
  const { montant, ...reste } = p;
  return {
    id,
    title: `Opportunité fictive ${id}`,
    issuer: "Émetteur fictif",
    recommendation: "INVESTIGATE",
    verificationStatus: "UNVERIFIED",
    humanReview: "PENDING",
    scores: { relevance: null, winPotential: null, infoConfidence: 40 },
    facts: montant ? [{ field: "estimated_value", normalizedValue: montant }] : [],
    deadlines: [{ normalized: "2026-12-01" }, { normalized: "2026-11-20" }],
    gate: { pursueEligible: false, failedReasons: ["source non vérifiée"] },
    opportunityKind: "GRANT",
    ...reste,
  } as unknown as ConsoleRecord;
}

const donnees = (records: ConsoleRecord[]): ConsoleData => ({ note: "fictif", run: {}, records }) as unknown as ConsoleData;

describe("chargeur : lignes", () => {
  it("identifiant stable, échéance la plus tardive, montant inconnu jamais zéro", () => {
    const [a, b2, c] = lignes(donnees([rec("r1", { montant: "50 000 EUR" }), rec("r2", { montant: "0 EUR" }), rec("r3", { montant: "environ deux millions" })]));
    expect(a!.id).toBe(uuidStable("r1"));
    expect(a!.deadline_at).toBe("2026-12-01");
    expect(a!.valeur).toBe(50000);
    expect(a!.devise).toBe("EUR");
    expect(b2!.valeur).toBeNull();
    expect(c!.valeur).toBeNull();
    expect(c!.devise).toBeNull();
  });

  it("une clé de veille = une opportunité (dédoublonnage)", () => {
    expect(lignes(donnees([rec("r1", { dedupKey: "k" } as Partial<ConsoleRecord>), rec("r2", { dedupKey: "k" } as Partial<ConsoleRecord>)]))).toHaveLength(1);
  });

  it("une base Supabase est refusée sans l'autorisation explicite de Mickaël", () => {
    expect(baseAutorisee("postgresql://postgres@db.iywmvyebuikxyvnrcnoy.supabase.co:5432/postgres", {})).toBe(false);
    expect(baseAutorisee("postgresql://u@aws-0-eu.pooler.supabase.com:6543/postgres", {})).toBe(false);
    expect(baseAutorisee("postgresql://postgres@db.x.supabase.co/postgres", { OIA_CHARGEMENT_SUPABASE: "oui" })).toBe(true);
    expect(baseAutorisee("postgresql://localhost/test", {})).toBe(true);
  });
});

describe.skipIf(!postgresDisponible)("chargeur sur Postgres jetable", () => {
  let b: Banc;
  const charger = (d: ConsoleData) => {
    const r = sqlChargement(d, { source: "test" });
    b.fichier(ecrireTemp(r.sql));
    return r;
  };
  const n = (sql: string) => Number(b.sql(sql));

  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("../../database/test/pg/supabase-emulation.sql"));
    b.fichier(chemin("../../../docs/architecture/schema/0002_watch_and_workspace.sql"));
    for (const m of ["0003_membres_et_politiques.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(chemin(`../../database/supabase/migrations/${m}`));
    b.sql(`insert into oia_membre (user_id, espace_id, role) values ('${A}', '${ESPACE_STUDIO}', 'editeur');`);
  });
  afterAll(() => b?.arreter());

  it("charge, puis rejoue sans rien ajouter ni modifier", () => {
    const d = donnees([rec("r1", { montant: "50 000 EUR" }), rec("r2", { opportunityKind: "TENDER_RFP" } as Partial<ConsoleRecord>)]);
    charger(d);
    expect(n(`select count(*) from watch_opportunities`)).toBe(2);
    const vu = b.sql(`select last_seen_at from watch_opportunities where record_id = 'r1'`);
    charger(d);
    expect(n(`select count(*) from watch_opportunities`)).toBe(2);
    expect(n(`select count(*) from ml_montant`)).toBe(2);
    expect(n(`select count(*) from ml_lot`)).toBe(1);
    expect(b.sql(`select last_seen_at from watch_opportunities where record_id = 'r1'`)).toBe(vu);
    expect(b.sql(`select categorie || '|' || coalesce(montant::text, 'inconnu') from ml_toutes_v1 order by record_id`, { role: "authenticated", utilisateur: A }).split("\n"))
      .toEqual(["subvention|50000", "chiffre_affaires_potentiel|inconnu"]);
  });

  it("un contenu modifié met la ligne à jour, sans doublon", () => {
    charger(donnees([rec("r1", { montant: "60 000 EUR", title: "Titre corrigé" }), rec("r2", { opportunityKind: "TENDER_RFP" } as Partial<ConsoleRecord>)]));
    expect(n(`select count(*) from watch_opportunities`)).toBe(2);
    expect(b.sql(`select title || '|' || (select valeur from ml_montant where opportunity_id = o.id) from watch_opportunities o where record_id = 'r1'`)).toBe("Titre corrigé|60000");
  });

  it("retour arrière d'un lot : retire ses opportunités, garde celles qui portent du travail humain", () => {
    const r = charger(donnees([rec("r3"), rec("r4")]));
    b.sql(`select oia_noter('${ESPACE_STUDIO}', 'note sur r4', 'r4')`, { role: "authenticated", utilisateur: A });
    const sortie = b.sql(sqlAnnulation(r.lot));
    expect(sortie).toBe("1");
    expect(b.sql(`select string_agg(record_id, ',' order by record_id) from watch_opportunities`)).toBe("r1,r2,r4");
    expect(n(`select count(*) from notes where record_id = 'r4'`)).toBe(1);
    expect(b.sql(`select annule_le is not null from ml_lot where id = '${r.lot}'`)).toBe("t");
  });

  it("l'instantané réel de la console se charge (appels publics, aucune donnée de client)", () => {
    const reel = JSON.parse(readFileSync(chemin("../../../apps/web/src/data/console.json"), "utf8")) as ConsoleData;
    const r = charger(reel);
    expect(r.lignes).toBeGreaterThan(100);
    expect(n(`select count(*) from watch_opportunities where lot_initial = '${r.lot}'`)).toBe(r.lignes);
    expect(n(`select count(*) from ml_montant where valeur = 0`)).toBe(0);
    charger(reel);
    expect(n(`select count(*) from watch_opportunities where lot_initial = '${r.lot}'`)).toBe(r.lignes);
  });
});
