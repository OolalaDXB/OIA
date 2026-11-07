import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { describe, expect, it } from "vitest";
import { checkTargetsMatch, markWindowRunning, parseScrapeTargets, toElmoCreateBrand } from "../src/elmo-load.js";
import { loadSubject } from "../src/load.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixtureDir = join(here, "fixtures", "demo-subject");
const validated = () => {
  const b = loadSubject(fixtureDir);
  b.panel.status = "validated";
  return b;
};

describe("corps de POST /api/v1/brands (Elmo 0.7.7)", () => {
  it("refuse un panel non validé", () => {
    expect(() => toElmoCreateBrand(loadSubject(fixtureDir), "org_1")).toThrow(/validé/);
  });

  it("a exactement les champs de createBrandInputSchema, dans l'organisation du compte", () => {
    const body = toElmoCreateBrand(validated(), "org_1");
    expect(Object.keys(body).sort()).toEqual(["aliases", "competitors", "domains", "id", "name", "organizationId", "prompts"]);
    expect(body.organizationId).toBe("org_1");
    expect(body.domains.length).toBeGreaterThan(0);
    expect(new Set(body.domains).size).toBe(body.domains.length);
    for (const d of body.domains) expect(d).not.toMatch(/^https?:|^www\./);
  });

  it("charge les seules questions actives, avec les tags de traçabilité OIA en minuscules", () => {
    const b = validated();
    const body = toElmoCreateBrand(b, "org_1");
    const active = b.panel.prompts.filter((p) => p.status === "active");
    expect(body.prompts.map((p) => p.value)).toEqual(active.map((p) => p.text));
    for (const p of body.prompts) {
      expect(p.enabled).toBe(true);
      expect(p.tags.some((t) => t.startsWith("oia:"))).toBe(true);
      for (const t of p.tags) expect(t).toBe(t.toLowerCase());
    }
  });

  it("refuse une organisation vide", () => {
    expect(() => toElmoCreateBrand(validated(), " ")).toThrow();
  });
});

describe("contrôle de SCRAPE_TARGETS avant lancement", () => {
  it("découpe les cibles comme Elmo, slug OpenRouter avec « / » compris", () => {
    expect(parseScrapeTargets("gemini:openrouter:google/gemini-3-flash-preview:online")).toEqual([
      { model: "gemini", provider: "openrouter", version: "google/gemini-3-flash-preview", webSearch: true },
    ]);
  });

  it("accepte des cibles qui couvrent exactement les moteurs du sujet, dans la grille, avec recherche", () => {
    expect(checkTargetsMatch(validated(), "chatgpt:openai-api:gpt-6-luna:online")).toEqual([]);
  });

  it("refuse un moteur en trop (il serait mesuré et payé, enabledModels restant null)", () => {
    const errors = checkTargetsMatch(validated(), "chatgpt:openai-api:gpt-6-luna:online,grok:openrouter:x-ai/grok-4.5:online");
    expect(errors.join("\n")).toMatch(/hors du sujet : grok/);
    expect(errors.join("\n")).toMatch(/grille de prix/);
  });

  it("refuse une cible sans recherche web, ou hors de la grille de prix", () => {
    expect(checkTargetsMatch(validated(), "chatgpt:openai-api:gpt-6-luna").join("\n")).toMatch(/recherche web/);
    expect(checkTargetsMatch(validated(), "chatgpt:openai-api:gpt-6-sol:online").join("\n")).toMatch(/grille de prix/);
  });
});

describe("début de fenêtre dans measurement.yaml", () => {
  const text = readFileSync(join(fixtureDir, "measurement.yaml"), "utf8");
  const at = new Date("2026-11-08T09:12:34Z");

  it("passe la fenêtre en running, avec la date et l'heure UTC", () => {
    const out = parse(markWindowRunning(text, "j0", at));
    const w = out.windows.find((x: { id: string }) => x.id === "j0");
    expect(w.status).toBe("running");
    expect(w.start).toBe("2026-11-08");
    expect(w.note).toMatch(/2026-11-08 à 09:12 UTC/);
  });

  it("ne reformate rien d'autre que la fenêtre (collections en ligne, lignes longues)", () => {
    const long = `${text.trimEnd()}\n# ${"x".repeat(150)}\n`;
    const out = markWindowRunning(long, "j0", at);
    const changed = out.split("\n").filter((l) => !long.split("\n").includes(l));
    expect(changed.every((l) => /status: running|start:|note:/.test(l))).toBe(true);
  });

  it("refuse une fenêtre déjà démarrée ou absente", () => {
    const once = markWindowRunning(text, "j0", at);
    expect(() => markWindowRunning(once, "j0", at)).toThrow(/running/);
    expect(() => markWindowRunning(text, "j9", at)).toThrow(/absente/);
  });
});
