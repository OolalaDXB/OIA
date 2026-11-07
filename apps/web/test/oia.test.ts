import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { oiaInterfaceEnabled } from "../src/lib/oiaFlag";
// @ts-expect-error module JavaScript sans déclaration de types
import { resolveOiaInterface } from "../oia-flag.mjs";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("[OIA_INTERFACE] bascule /oia", () => {
  it("est éteinte par défaut et pour toute valeur autre que \"on\"", () => {
    expect(oiaInterfaceEnabled(undefined)).toBe(false);
    for (const v of ["", "1", "true", "ON", "yes", "off"]) expect(oiaInterfaceEnabled(v)).toBe(false);
    expect(oiaInterfaceEnabled("on")).toBe(true);
  });

  it("Preview Vercel : allumée ; production : jamais, même avec la variable", () => {
    expect(resolveOiaInterface({ vercelEnv: "preview" })).toBe("on");
    expect(resolveOiaInterface({ vercelEnv: "production" })).toBe("off");
    expect(resolveOiaInterface({ vercelEnv: "production", flag: "on" })).toBe("off");
    expect(resolveOiaInterface({ vercelEnv: "development" })).toBe("off");
    expect(resolveOiaInterface({})).toBe("off");
    expect(resolveOiaInterface({ flag: "on" })).toBe("on");
    expect(resolveOiaInterface({ flag: "1" })).toBe("off");
  });

  it("next.config fige la bascule au build et vercel.json ne la force pas", () => {
    expect(read("../next.config.mjs")).toMatch(/OIA_INTERFACE: resolveOiaInterface\(\{ vercelEnv: process\.env\.VERCEL_ENV/);
    expect(read("../../../vercel.json")).not.toContain("OIA_INTERFACE");
  });

  it("le rail ne montre l'entrée OIA que derrière la bascule", () => {
    const rail = read("../src/app/(console)/Console.tsx");
    expect(rail).toMatch(/oiaInterfaceEnabled\(\)\s*\?/);
  });

  it("éteinte, l'interface n'affiche qu'un avis, sans données ni Shyrka", () => {
    const layout = read("../src/app/(oia)/layout.tsx");
    expect(layout).toMatch(/allumee \? \(/);
    expect(layout).toContain("Interface OIA désactivée");
    expect(layout).not.toMatch(/loadConsoleData|supabase/);
  });
});

describe("[OIA_INTERFACE] interface portée du prototype Lovable", () => {
  it("console et interface OIA ont chacune leur layout racine et leurs styles", () => {
    const consoleLayout = read("../src/app/(console)/layout.tsx");
    const oiaLayout = read("../src/app/(oia)/layout.tsx");
    expect(consoleLayout).toContain('import "./globals.css"');
    expect(consoleLayout).not.toContain("oia.css");
    expect(oiaLayout).toContain('import "./oia.css"');
    expect(oiaLayout).not.toContain("globals.css");
    expect(read("../src/app/(oia)/oia.css")).toContain('@import "tailwindcss"');
    expect(read("../src/app/(console)/globals.css")).not.toContain("tailwindcss");
  });

  it("les pages existantes réutilisées existent bien dans la console", async () => {
    const { consoleExistante } = await import("../src/oia/data/console-existante");
    const { existsSync } = await import("node:fs");
    for (const pages of Object.values(consoleExistante)) {
      for (const p of pages) {
        const dossier = p.href === "/" ? "" : p.href.replace(/^\/|\/$/g, "");
        expect(existsSync(fileURLToPath(new URL(`../src/app/(console)/${dossier ? `${dossier}/` : ""}page.tsx`, import.meta.url)))).toBe(true);
      }
    }
  });

  it("la cale de routage place toutes les routes sous /oia", async () => {
    const { href, cheminRelatif } = await import("../src/oia/lib/router");
    expect(href("/")).toBe("/oia/");
    expect(href("/visibility")).toBe("/oia/visibility/");
    expect(href("/sites/$slug", { slug: "studio-ardoise" })).toBe("/oia/sites/studio-ardoise/");
    expect(cheminRelatif("/oia/shyrka/")).toBe("/shyrka");
    expect(cheminRelatif("/oia/")).toBe("/");
  });

  it("Lovable Shyrka v0 n'est pas modifiée par Claude Code (CADRE.md)", async () => {
    // Empreintes des fichiers portés. Si ce test casse, la présence de Shyrka a été modifiée :
    // seule une nouvelle version venue de Lovable, choisie par Shyrka et consignée, justifie de les changer.
    const { createHash } = await import("node:crypto");
    const sha = (rel: string) => createHash("sha256").update(readFileSync(fileURLToPath(new URL(rel, import.meta.url)))).digest("hex");
    expect(sha("../src/oia/components/oia/shyrka-particles.tsx")).toBe("4a9c0e6c5793cac6ade7140d1132c2f15ba5bb2858dd9da5f96529428ff430ab");
    expect(sha("../src/oia/components/oia/shyrka.tsx")).toBe("1f75db3ca7fa2b113856edaabc5f5cf9629172373e28e34b8c182262d2b44681");
  });
});
