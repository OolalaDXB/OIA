import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Rafraîchissement quotidien (mandat v9, bloc B) : aucune base, psql remplacé. */
const script = fileURLToPath(new URL("../scripts/rafraichir.sh", import.meta.url));
const origine = spawnSync("git", ["rev-parse", "--verify", "-q", "origin/main:apps/web/src/data/console.json"], { encoding: "utf8" }).status === 0;

function lancer(sql: string) {
  const data = mkdtempSync(join(tmpdir(), "ml-"));
  const r = spawnSync("bash", [script], { encoding: "utf8", env: { ...process.env, OIA_ML_DATA: data, OIA_ML_SQL: sql, OIA_ML_SANS_FETCH: "1" } });
  const journal = readFileSync(join(data, "rafraichir.log"), "utf8");
  rmSync(data, { recursive: true, force: true });
  return { code: r.status, journal };
}

describe.skipIf(!origine)("rafraîchissement quotidien de Money Lookup", () => {
  it("produit un script transactionnel et le passe à la base", () => {
    const r = lancer("grep -c ^commit;");
    expect(r.code).toBe(0);
    expect(r.journal).toMatch(/^1$/m);
    expect(r.journal).toMatch(/ok : Chargement Money Lookup/);
    // Puis les projets du registre (migration 0008), passés à la base de la même façon.
    expect(r.journal).toMatch(/ok : projets du registre/);
    expect(r.journal.match(/^1$/gm)).toHaveLength(2);
  });

  it("un refus de la base est un échec consigné, code de sortie 1", () => {
    const r = lancer("false");
    expect(r.code).toBe(1);
    expect(r.journal).toMatch(/ÉCHEC : application sur la base OIA refusée/);
  });
});
