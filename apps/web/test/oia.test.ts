import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { oiaInterfaceEnabled } from "../src/lib/oiaFlag";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("[OIA_INTERFACE] bascule /oia", () => {
  it("est éteinte par défaut et pour toute valeur autre que \"on\"", () => {
    expect(oiaInterfaceEnabled(undefined)).toBe(false);
    for (const v of ["", "1", "true", "ON", "yes", "off"]) expect(oiaInterfaceEnabled(v)).toBe(false);
    expect(oiaInterfaceEnabled("on")).toBe(true);
  });

  it("n'est allumée dans aucun fichier de configuration suivi", () => {
    // vercel.json et next.config ne doivent pas l'allumer : l'allumage est une décision de Mickaël.
    expect(read("../../../vercel.json")).not.toContain("NEXT_PUBLIC_OIA_INTERFACE");
    expect(read("../next.config.mjs")).not.toContain("NEXT_PUBLIC_OIA_INTERFACE");
  });

  it("le rail ne montre l'entrée OIA que derrière la bascule", () => {
    const rail = read("../src/app/Console.tsx");
    expect(rail).toMatch(/oiaInterfaceEnabled\(\)\s*\?/);
  });

  it("la page éteinte n'importe aucune donnée ni service", () => {
    const page = read("../src/app/oia/page.tsx");
    expect(page).not.toMatch(/loadConsoleData|supabase|fetch\(/);
  });
});

