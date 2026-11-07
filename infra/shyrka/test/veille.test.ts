import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Produit } from "../src/executive/config.js";
import { BaseOps } from "../src/executive/operations.js";
import { collecterGithub, collecterHttp, type Executeur } from "../src/executive/veille.js";

let dir: string;
let t = 0;
const horloge = () => new Date(Date.UTC(2026, 10, 9, 0, t++)).toISOString();
beforeEach(() => (dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-veille-")))));
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const BANC: Produit = {
  slug: "banc", nom: "Banc fictif", noms: [], priorite: "standard", depots: [{ repo: "exemple/banc", branche: "main", confirme: true }],
  http: [{ url: "https://banc.invalid/", confirme: true, preuve: "fictif" }], vercel: [], ambiguites: [],
};
const reponse = (status: number, location?: string) => new Response(status >= 300 && status < 400 ? null : "corps", { status, headers: location ? { location } : {} });

describe("C3 · incident rejoué plusieurs fois (banc local, aucun produit touché)", () => {
  it("une alerte après deux observations, aucune répétition, résolution puis réapparition traçables", async () => {
    const ops = new BaseOps(join(dir, "ops"), horloge);
    let statut = 503;
    const f = (async () => reponse(statut)) as typeof fetch;
    const autorises = new Set(["banc.invalid"]);
    const notifs: unknown[] = [];
    const passe = async () => {
      const p = ops.debutPassage();
      for (const o of await collecterHttp(BANC, autorises, f)) {
        const r = ops.observer(p, o, 2);
        if (r.notification) notifs.push(r.notification);
      }
    };
    await passe();
    expect(ops.incidents()[0]).toMatchObject({ statut: "nouveau", consecutives: 1 });
    expect(notifs).toHaveLength(0);
    await passe();
    await passe();
    await passe();
    expect(ops.incidents()).toHaveLength(1);
    expect(ops.incidents()[0]).toMatchObject({ statut: "confirme", occurrences: 4, gravite: "critique" });
    expect(notifs).toHaveLength(1);
    statut = 200;
    await passe();
    expect(ops.incidents()[0]).toMatchObject({ statut: "resolu" });
    statut = 503;
    await passe();
    await passe();
    expect(ops.incidents()).toHaveLength(1);
    expect(ops.incidents()[0]).toMatchObject({ statut: "confirme", reapparitions: 1 });
    expect(ops.notifications().map((n) => n.niveau)).toEqual(["urgent", "a_connaitre", "urgent"]);
    ops.fermer();
  });
  it("ignorer exige un motif ; un constat ignoré ne notifie plus", async () => {
    const ops = new BaseOps(join(dir, "ops"), horloge);
    const f = (async () => reponse(404)) as typeof fetch;
    const p = ops.debutPassage();
    for (const o of await collecterHttp(BANC, new Set(["banc.invalid"]), f)) ops.observer(p, o, 2);
    const id = ops.incidents()[0]!.id;
    expect(() => ops.changerIncident(id, "ignore_avec_motif")).toThrow(/motif/);
    ops.changerIncident(id.slice(0, 8), "ignore_avec_motif", "page retirée volontairement (fictif)");
    for (const o of await collecterHttp(BANC, new Set(["banc.invalid"]), f)) expect(ops.observer(p, o, 2).notification).toBeNull();
    ops.fermer();
  });
});

describe("C2 · source inaccessible ou hors liste", () => {
  it("redirection vers un hôte non autorisé : erreur, jamais « sain »", async () => {
    const f = (async () => reponse(302, "https://ailleurs.invalid/")) as typeof fetch;
    const [o] = await collecterHttp(BANC, new Set(["banc.invalid"]), f);
    expect(o).toMatchObject({ etat: "erreur", resultat: "inconnu" });
  });
  it("401/403 GitHub : accès manquant, pas une panne ; aucun incident ouvert", async () => {
    const run: Executeur = async () => ({ code: 1, stdout: "", stderr: "gh: Not Found (HTTP 404)" });
    const [o] = await collecterGithub(BANC, run);
    expect(o).toMatchObject({ etat: "acces_manquant", resultat: "inconnu" });
    const ops = new BaseOps(join(dir, "ops"), horloge);
    expect(ops.observer(ops.debutPassage(), o!, 2)).toEqual({ incident: null, notification: null });
    ops.fermer();
  });
  it("CI en échec : anomalie avec la preuve du check", async () => {
    const run: Executeur = async (_c, a) => {
      const u = a[1]!;
      if (u.endsWith("/commits/main")) return { code: 0, stdout: JSON.stringify({ sha: "abc1234def", date: "2026-11-08T00:00:00Z" }), stderr: "" };
      if (u.includes("check-runs")) return { code: 0, stdout: JSON.stringify([{ name: "test", status: "completed", conclusion: "failure", url: "https://x/1" }]), stderr: "" };
      return { code: 0, stdout: "[]", stderr: "" };
    };
    const o = await collecterGithub(BANC, run);
    expect(o.find((x) => x.controle === "github.checks")).toMatchObject({ resultat: "anomalie", preuve: "https://x/1" });
  });
});
