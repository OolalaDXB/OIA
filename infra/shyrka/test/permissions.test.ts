import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { PERMISSIONS_PAR_DEFAUT, autorise, loadPermissions, type Permissions } from "../src/permissions.js";

const suivi = fileURLToPath(new URL("../permissions.json", import.meta.url));
const charge = (obj: unknown) => loadPermissions("x", () => JSON.stringify(obj));
const avec = (courrier: Permissions["agents"]["courrier"]): Permissions => ({ ...PERMISSIONS_PAR_DEFAUT, agents: { courrier, whatsapp: { palier: 0, envoiSeul: [] } } });

describe("paliers de permission (mandat v6, B5)", () => {
  it("fichier suivi : courrier au palier 1 (brouillons), WhatsApp au palier 0, aucun envoi", () => {
    const { permissions, warning } = loadPermissions(suivi);
    expect(warning).toBeUndefined();
    expect(permissions.agents.courrier).toEqual({ palier: 1, envoiSeul: [] });
    expect(permissions.agents.whatsapp).toEqual({ palier: 0, envoiSeul: [] });
    for (const agent of ["courrier", "whatsapp"] as const) expect(autorise(permissions, agent, "envoyer", "rendez-vous").ok).toBe(false);
  });

  it("palier 0 : lecture ; palier 1 : brouillon ; l'envoi exige le palier 2", () => {
    expect(autorise(avec({ palier: 0, envoiSeul: [] }), "courrier", "lire").ok).toBe(true);
    expect(autorise(avec({ palier: 0, envoiSeul: [] }), "courrier", "brouillon").ok).toBe(false);
    expect(autorise(avec({ palier: 1, envoiSeul: [] }), "courrier", "brouillon").ok).toBe(true);
    expect(autorise(avec({ palier: 1, envoiSeul: [] }), "courrier", "envoyer", "x").ok).toBe(false);
  });

  it("palier 2 : envoi seulement pour une catégorie validée par Mickaël", () => {
    const p = avec({ palier: 2, envoiSeul: [{ categorie: "accuse-reception", valideePar: "Mickaël Thomas", le: "2026-11-08" }] });
    expect(autorise(p, "courrier", "envoyer", "accuse-reception").ok).toBe(true);
    expect(autorise(p, "courrier", "envoyer", "rendez-vous").ok).toBe(false);
    expect(autorise(p, "courrier", "envoyer").ok).toBe(false);
    expect(autorise(p, "whatsapp", "envoyer", "accuse-reception").ok).toBe(false);
  });

  describe("tests adverses : toute configuration douteuse retombe au palier 0", () => {
    const base = { version: 1, date: "2026-11-08", accordePar: "Mickaël Thomas", agents: { courrier: { palier: 2, envoiSeul: [{ categorie: "x", valideePar: "Mickaël Thomas", le: "2026-11-08" }] }, whatsapp: { palier: 0, envoiSeul: [] } } };
    it.each([
      ["signataire autre que Mickaël", { ...base, accordePar: "Shyrka" }],
      ["catégorie validée par un agent", { ...base, agents: { ...base.agents, courrier: { palier: 2, envoiSeul: [{ categorie: "x", valideePar: "agent-courrier", le: "2026-11-08" }] } } }],
      ["palier inventé", { ...base, agents: { ...base.agents, courrier: { palier: 3, envoiSeul: [] } } }],
      ["palier en texte", { ...base, agents: { ...base.agents, courrier: { palier: "2", envoiSeul: [] } } }],
      ["catégories d'envoi glissées sous le palier 1", { ...base, agents: { ...base.agents, courrier: { palier: 1, envoiSeul: base.agents.courrier.envoiSeul } } }],
      ["champ ajouté (« toutes catégories »)", { ...base, agents: { ...base.agents, courrier: { ...base.agents.courrier, toutes: true } } }],
      ["agent inconnu", { ...base, agents: { ...base.agents, telephone: { palier: 2, envoiSeul: [] } } }],
      ["date absente", { ...base, agents: { ...base.agents, courrier: { palier: 2, envoiSeul: [{ categorie: "x", valideePar: "Mickaël Thomas" }] } } }],
    ])("%s", (_nom, conf) => {
      const r = charge(conf);
      expect(r.warning).toMatch(/invalides/);
      expect(r.permissions).toEqual(PERMISSIONS_PAR_DEFAUT);
      expect(autorise(r.permissions, "courrier", "envoyer", "x").ok).toBe(false);
    });

    it("fichier absent ou illisible : palier 0 partout", () => {
      expect(loadPermissions("/nulle/part.json").permissions).toEqual(PERMISSIONS_PAR_DEFAUT);
      expect(charge("{").permissions).toEqual(PERMISSIONS_PAR_DEFAUT);
      expect(PERMISSIONS_PAR_DEFAUT.agents.courrier.palier).toBe(0);
    });
  });

  it("aucun code de Shyrka n'écrit la configuration des permissions", () => {
    const racines = [fileURLToPath(new URL("../src", import.meta.url)), fileURLToPath(new URL("../../../packages/shyrka-mail/src", import.meta.url))];
    const fichiers: string[] = [];
    const parcourir = (d: string) => {
      let noms: string[] = [];
      try {
        noms = readdirSync(d);
      } catch {
        return;
      }
      for (const n of noms) {
        const p = join(d, n);
        if (statSync(p).isDirectory()) parcourir(p);
        else if (/\.ts$/.test(n)) fichiers.push(p);
      }
    };
    racines.forEach(parcourir);
    expect(fichiers.length).toBeGreaterThan(5);
    for (const f of fichiers) {
      const s = readFileSync(f, "utf8");
      const ecrit = /(writeFile|appendFile|createWriteStream|rename|copyFile|unlink|chmod)/.test(s);
      if (ecrit) expect(s, f).not.toMatch(/permissions\.json|SHYRKA_PERMISSIONS/);
    }
  });
});
