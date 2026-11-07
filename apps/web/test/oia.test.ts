import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
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
    const { modules } = await import("../src/oia/config/navigation");
    const { existsSync } = await import("node:fs");
    const pages = modules.flatMap((m) => m.pages ?? []);
    expect(pages.map((p) => p.href).sort()).toEqual(["/alerts/", "/contacts/", "/grants/", "/investors/", "/money/", "/projects/", "/tenders/"]);
    for (const p of pages) {
      const dossier = p.href.replace(/^\/|\/$/g, "");
      expect(existsSync(fileURLToPath(new URL(`../src/app/(console)/${dossier}/page.tsx`, import.meta.url))), p.href).toBe(true);
    }
  });

  it("navigation proposée par le mandat v7 (F2), dans un fichier unique", async () => {
    const { modules, modulesPersonnels } = await import("../src/oia/config/navigation");
    expect(modules.map((m) => m.nom)).toEqual(["Visibility", "Opportunités", "CRM", "Portefeuille", "Data", "Training"]);
    expect(modules.find((m) => m.slug === "opportunites")?.pages?.map((p) => p.label)).toEqual(["Financements", "Appels d'offres", "Investisseurs", "Veille", "Montants"]);
    expect(modulesPersonnels.map((m) => m.nom)).toEqual(["Agenda", "Santé", "Famille"]);
    for (const m of modules) expect(existsSync(fileURLToPath(new URL(`../src/app/(oia)/oia/${m.slug}/page.tsx`, import.meta.url))), m.slug).toBe(true);
  });

  it("bascule F6 désactivée, sans effet même /oia allumée ; elle ne redirige jamais tant qu'elle est éteinte", async () => {
    const { BASCULE_ACCUEIL, REDIRECTIONS } = await import("../src/oia/config/navigation");
    const { destinationApresBascule } = await import("../src/oia/lib/bascule");
    expect(BASCULE_ACCUEIL).toBe(false);
    for (const ancienne of Object.keys(REDIRECTIONS)) {
      expect(destinationApresBascule(ancienne)).toBeNull();
      expect(destinationApresBascule(ancienne, false, true)).toBeNull();
    }
    expect(destinationApresBascule("/grants", true, false)).toBeNull();
    expect(destinationApresBascule("/grants", true, true)).toBe("/oia/opportunites/?onglet=financements");
    expect(read("../src/oia/lib/bascule.tsx")).toContain("window.self !== window.top");
  });

  it("/oia passe derrière l'écran de connexion de la console et prend les jetons de ui-tokens", () => {
    const layout = read("../src/app/(oia)/layout.tsx");
    expect(layout).toMatch(/<AuthGate>/);
    expect(layout).toContain('import "@oia/ui-tokens/tokens.css"');
    expect(read("../src/app/(oia)/oia.css")).toContain("var(--oia-module-visibility)");
  });

  it("aucune donnée réelle de client dans les fichiers publics de /oia (amendement, § 6)", async () => {
    const { readdirSync, statSync } = await import("node:fs");
    const { join } = await import("node:path");
    const racines = ["../src/oia", "../src/app/(oia)", "../public"].map((r) => fileURLToPath(new URL(r, import.meta.url)));
    const fichiers: string[] = [];
    const parcourir = (d: string) => {
      if (!existsSync(d)) return;
      for (const n of readdirSync(d)) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (/\.(tsx?|css|json|md|html)$/.test(n)) fichiers.push(p);
      }
    };
    racines.forEach(parcourir);
    expect(fichiers.length).toBeGreaterThan(10);
    for (const f of fichiers) {
      const s = readFileSync(f, "utf8").toLowerCase();
      for (const client of ["coach gari", "coach-gari", "coachgari", "maisons.co", "maisons-co", "moë-kan", "moe-kan"]) expect(s.includes(client), `${f} cite ${client}`).toBe(false);
    }
    expect(existsSync(fileURLToPath(new URL("../public/oia/data/visibility.json", import.meta.url)))).toBe(false);
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
