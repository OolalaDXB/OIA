import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { lireCleMistral, MistralTextModel } from "../src/adapters/mistral";

/** Mode texte avec Mistral quand Ollama est absent (mandat v9, G5). Réseau simulé, clé fictive. */
function faux() {
  const corps: string[] = [];
  const entetes: Record<string, string>[] = [];
  const fetch = async (_u: string, init: { body: string; headers: Record<string, string> }) => {
    corps.push(init.body);
    entetes.push(init.headers);
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: " Salut. " } }] }) };
  };
  return { corps, entetes, fetch };
}

describe("MistralTextModel", () => {
  it("répond, clé en en-tête seulement", async () => {
    const f = faux();
    const m = new MistralTextModel({ cle: "cle-fictive", fetch: f.fetch });
    expect(await m.chat([{ role: "system", content: "Cadre" }, { role: "user", content: "Bonjour" }])).toBe("Salut.");
    expect(f.corps[0]).not.toContain("cle-fictive");
    expect(f.entetes[0]!.Authorization).toBe("Bearer cle-fictive");
  });

  it("un message sur Swift n'est jamais envoyé ; le contexte est purgé de Swift et des données sensibles", async () => {
    const f = faux();
    const m = new MistralTextModel({ cle: "k", fetch: f.fetch });
    expect(await m.chat([{ role: "user", content: "Le point Swift ?" }])).toMatch(/Rien n'a été envoyé/);
    expect(f.corps).toHaveLength(0);
    await m.chat([
      { role: "system", content: "Décision A\nRéunion SWIFT jeudi\nDécision B" },
      { role: "user", content: "Mon IBAN FR76 3000 6000 0112 3456 7890 189, ok ?" },
    ]);
    expect(f.corps[0]).not.toMatch(/swift|3000 6000/i);
    expect(f.corps[0]).toContain("Décision A");
  });

  it("clé lue dans un fichier local ; absente : null", () => {
    const d = mkdtempSync(join(tmpdir(), "mistral-"));
    writeFileSync(join(d, "m.env"), "AUTRE=1\nMISTRAL_API_KEY='cle-fictive'\n");
    expect(lireCleMistral(join(d, "m.env"))).toBe("cle-fictive");
    expect(lireCleMistral(join(d, "absent.env"))).toBeNull();
  });
});
