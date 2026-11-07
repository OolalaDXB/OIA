import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/** Mandat v11, bloc E (T21) : aucune valeur fabriquée quand la donnée manque. */

const dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-prog-")));
process.env.SHYRKA_EXEC_DIR = dir;
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("progres", () => {
  it("sans données : indicateurs « non mesuré », capacités NON_TESTE, aucun gain annoncé", async () => {
    const { construireProgres, comparerAuPrecedent } = await import("../src/executive/progres.js");
    const p = construireProgres(null, dir);
    expect(p.instantane.valeur.tempsGagneMinutes).toBe("non mesuré");
    expect(p.instantane.valeur.tauxAlertesPertinentes).toBe("non mesuré");
    expect(p.instantane.valeur.missionsTerminees).toBe(0);
    expect(Object.values(p.instantane.capacites).every((s) => s === "NON_TESTE")).toBe(true);
    expect(p.lignes.map(([, t]) => t).join("\n")).toMatch(/appris avec preuve et validé par Mickaël : rien encore/);
    expect(p.lignes.map(([, t]) => t).join("\n")).not.toMatch(/\d+ ?(min|minutes|heures) gagnées/);
    expect(comparerAuPrecedent(p.instantane, join(dir, "progres"))[0]).toMatch(/première mesure/);
  });
});
