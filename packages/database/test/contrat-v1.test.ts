import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { demarrer, postgresDisponible, type Banc } from "./pg/banc";

/**
 * Contrat de données v1 figé (mandat v9, bloc E) : chaque vue et chaque table
 * décrite dans docs/interface/contrat-donnees-v1.md a exactement ces colonnes,
 * dans cet ordre et avec ces types, après la séquence de migrations de
 * production. Un écart casse ce test : on ne change pas le contrat en silence.
 */
const chemin = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const MIG = (n: string) => chemin(`../supabase/migrations/${n}`);
const VIS = (n: string) => chemin(`../../../infra/visibility/migrations/${n}.sql`);
const CONTRAT = chemin("../../../docs/interface/contrat-donnees-v1.md");

function contrat(): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  let vue: string | null = null;
  for (const l of readFileSync(CONTRAT, "utf8").split("\n")) {
    const t = /^### `([a-z0-9_]+)`$/.exec(l);
    if (t) { vue = t[1]!; out[vue] = []; continue; }
    if (/^#{1,3} /.test(l)) vue = null;
    const c = vue ? /^\| `([a-z0-9_]+)` \| ([A-Za-z -]+) \|$/.exec(l) : null;
    if (vue && c) out[vue]!.push(`${c[1]}:${c[2]}`);
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v.length > 0));
}

let b: Banc;
describe.skipIf(!postgresDisponible)("contrat de données v1 (figé)", () => {
  beforeAll(() => {
    b = demarrer();
    b.fichier(chemin("./pg/supabase-emulation.sql"));
    b.fichier(MIG("0002_watch_and_workspace.sql"));
    for (const m of ["0003_membres_et_politiques.sql", "0003a_transition_console.sql", "0004_money_lookup.sql", "0005_reprise_navigateur.sql"]) b.fichier(MIG(m));
    for (const v of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity"]) b.fichier(VIS(v));
    for (const m of ["0006_visibility_vues.sql", "0007_shyrka.sql"]) b.fichier(MIG(m));
  });
  afterAll(() => b?.arreter());

  it("couvre les vues de Money Lookup, de Visibility et de Shyrka", () => {
    const vues = Object.keys(contrat());
    expect(vues.filter((v) => v.startsWith("ml_"))).toHaveLength(9);
    expect(vues.filter((v) => v.startsWith("vis_"))).toHaveLength(12);
    expect(vues).toEqual(expect.arrayContaining(["shy_message", "shy_brouillon", "oia_ia_budget_v1"]));
  });

  it("chaque colonne du contrat existe en base, dans l'ordre, avec son type", () => {
    for (const [vue, colonnes] of Object.entries(contrat())) {
      const reel = b.sql(`select string_agg(column_name || ':' || data_type, '|' order by ordinal_position) from information_schema.columns where table_schema = 'public' and table_name = '${vue}'`);
      expect(reel.split("|"), vue).toEqual(colonnes);
    }
  });
});
