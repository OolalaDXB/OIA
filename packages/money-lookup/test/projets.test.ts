import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { PROJECT_REGISTRY, SOURCE_REGISTRY, sourcesForProject } from "@oia/registry";
import { lignesProjets, sqlProjets } from "../src/projets";
import { demarrer, ecrireTemp, postgresDisponible, type Banc } from "../../database/test/pg/banc";

/** Projets du registre vers oia_projet (migration 0008, contrat Money Lookup version 2). */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const PROJETS = PROJECT_REGISTRY.projects;

describe("lignes des projets", () => {
  it("une ligne par projet du registre, triée, avec profil complet, mots-clés, exclusions et sources", () => {
    const l = lignesProjets(PROJETS, SOURCE_REGISTRY);
    expect(l.map((x) => x.slug)).toEqual(PROJETS.map((p) => p.slug).sort());
    const p = PROJETS[0]!;
    const x = l.find((y) => y.slug === p.slug)!;
    expect(x).toMatchObject({ nom: p.name, type: p.kind, statut: p.status, revue_profil: p.profileReview.status, mots_cles: p.keywords, exclusions: p.exclusions });
    expect(x.profil).toEqual(p);
    expect(x.sources.map((s) => s.id)).toEqual(sourcesForProject(SOURCE_REGISTRY, p.slug).map((s) => s.id));
    expect(lignesProjets(PROJETS, SOURCE_REGISTRY)).toEqual(l); // empreintes stables
  });
});

describe.skipIf(!postgresDisponible)("chargement des projets (Postgres jetable)", () => {
  let b: Banc;
  const charger = (projets = PROJETS) => b.fichier(ecrireTemp(sqlProjets(projets, { sources: SOURCE_REGISTRY }).sql));
  const etat = () => b.sql("select string_agg(slug || ':' || coalesce(to_char(retire_du_registre_le, 'X'), '-') || ':' || to_char(charge_le, 'US'), ',' order by slug) from oia_projet");
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("../../database/test/pg/supabase-emulation.sql"));
    b.fichier(chemin("../../database/supabase/migrations/0002_watch_and_workspace.sql"));
    for (const m of ["0003_membres_et_politiques.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql", "0008_money_lookup_v2.sql"])
      b.fichier(chemin(`../../database/supabase/migrations/${m}`));
  });
  afterAll(() => b?.arreter());

  it("charge tout le registre, et rejouer ne change rien", () => {
    charger();
    expect(Number(b.sql("select count(*) from oia_projet"))).toBe(PROJETS.length);
    expect(Number(b.sql("select count(*) from oia_projet where jsonb_array_length(sources) > 0"))).toBeGreaterThan(0);
    const avant = etat();
    charger();
    expect(etat()).toBe(avant);
  });

  it("ne met à jour que le projet modifié ; un projet sorti du registre est marqué, pas supprimé, puis réactivé à son retour", () => {
    const avant = b.sql(`select string_agg(slug || ':' || charge_le, ',' order by slug) from oia_projet where slug <> '${PROJETS[0]!.slug}'`);
    charger([{ ...PROJETS[0]!, name: "Nom modifié fictif" }, ...PROJETS.slice(1)]);
    expect(b.sql(`select nom from oia_projet where slug = '${PROJETS[0]!.slug}'`)).toBe("Nom modifié fictif");
    expect(b.sql(`select string_agg(slug || ':' || charge_le, ',' order by slug) from oia_projet where slug <> '${PROJETS[0]!.slug}'`)).toBe(avant);
    charger(PROJETS.slice(1));
    expect(Number(b.sql("select count(*) from oia_projet"))).toBe(PROJETS.length);
    expect(b.sql(`select (retire_du_registre_le is not null)::text from oia_projet where slug = '${PROJETS[0]!.slug}'`)).toBe("true");
    charger();
    expect(b.sql(`select (retire_du_registre_le is null)::text || '|' || nom from oia_projet where slug = '${PROJETS[0]!.slug}'`)).toBe(`true|${PROJETS[0]!.name}`);
  });
});
