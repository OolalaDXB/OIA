import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { consoliderPlan, type EntreePlan } from "../src/plan/consolider";
import { MemoryEngineDb } from "../src/engine/db";
import { runEngine } from "../src/engine/run";
import { noJudge } from "../src/judge";

const ENTREE: EntreePlan = {
  site: { nom: "Studio Fictif", url: "https://studio-fictif.example" },
  depot: "o/site",
  actions: [
    { cle: "recommandation:rec-pplx-1", origine: "Audit externe · Perplexity", priorite: "P1", titre: "Relier les offres depuis l'accueil", quoi: "Lier chaque offre.", pourquoi: "Pages orphelines.", effort: "S", qui: "equipe", suivi: "a_planifier" },
    { cle: "constat:contenu:accueil-vers-offres", origine: "Note du contenu", priorite: "P0", titre: "À corriger : l'accueil mène à chaque page d'offre", quoi: "Bloc Nos offres.", pourquoi: "", effort: "XS", qui: "equipe", suivi: "a_planifier" },
    { cle: "constat:indexation:llms-txt", origine: "Hygiène d'indexation", priorite: "P2", titre: "À corriger : llms.txt servi", quoi: "Publier /llms.txt.", pourquoi: "", effort: "S", qui: "equipe", suivi: "a_planifier" },
    { cle: "recommandation:rec-gbp", origine: "Rapport externe · Agence", priorite: "P1", titre: "Fiche Google Business", quoi: "Créer la fiche.", pourquoi: "", effort: "S", qui: "client", suivi: "a_planifier" },
  ],
  rapports: [{ outil: "Perplexity", date: "2026-11-16", resume: "r", extrait: "e" }],
  etat: { score_indexation: 85 },
};

function fauxLlm(groupes: unknown[]) {
  return {
    name: "faux", defaultModel: "faux", usage: () => ({ inputTokens: 0, outputTokens: 0 }),
    async extract(req: { schema: { parse: (x: unknown) => unknown } }) {
      return { data: req.schema.parse({ resume: "Trois chantiers.", groupes }) as never, run: { provider: "faux", model: "faux", promptHash: "x" } };
    },
  };
}

describe("plan consolidé : garde-fous", () => {
  it("regroupe, ignore les clés inventées et les doublons, remet ce qui est oublié, garde la priorité la plus urgente", async () => {
    const p = await consoliderPlan(fauxLlm([
      { titre: "Relier les offres", pourquoi: "Moins de pages orphelines.", priorite: "p2", impact: "High", effort: "s", qui: "Equipe", actions: ["recommandation:rec-pplx-1", "constat:contenu:accueil-vers-offres", "constat:inventee"], etapes: ["Ajouter le bloc", "Lier chaque offre"], critere_reussite: "Le contrôle trouve 4/4 offres liées.", prompt_execution: "Dans le dépôt o/site, sur une branche…" },
      { titre: "Doublon", priorite: "P0", actions: ["constat:contenu:accueil-vers-offres"] },
      { titre: "llms.txt", priorite: "P2", actions: ["constat:indexation:llms-txt"], prompt_execution: "Créer /llms.txt [à fournir]." },
    ]) as never, ENTREE, "faux");
    expect(p.groupes.map((g) => g.titre)).toEqual(["Relier les offres", "Fiche Google Business", "llms.txt"]);
    const offres = p.groupes[0]!;
    expect(offres.actions).toEqual(["recommandation:rec-pplx-1", "constat:contenu:accueil-vers-offres"]);
    expect(offres.priorite).toBe("P0"); // l'action la plus urgente du groupe
    expect(offres.sources).toEqual(["Audit externe · Perplexity", "Note du contenu"]);
    expect(offres).toMatchObject({ impact: "high", effort: "S", qui: "equipe" });
    expect(p.groupes[1]).toMatchObject({ actions: ["recommandation:rec-gbp"], qui: "client" }); // oubliée : remise seule
    expect(p.groupes.flatMap((g) => g.actions).sort()).toEqual(ENTREE.actions.map((a) => a.cle).sort());
  });
});

describe("moteur : demande CONSOLIDER_PLAN", () => {
  it("lit les actions, écrit le plan consolidé", async () => {
    const db = new MemoryEngineDb(() => new Date("2026-11-18T12:00:00Z"));
    db.entreesPlan.set("studio-fictif", ENTREE as never);
    const d = db.demander({ type: "CONSOLIDER_PLAN", client_id: "client-fictif", subject_id: "studio-fictif", charge: {} });
    const r = await runEngine({
      db, dir: join(mkdtempSync(join(tmpdir(), "oia-plan-")), "m"), hote: "t", version: "v", env: {}, now: () => new Date("2026-11-18T12:00:00Z"),
      fetch: async () => { throw new Error("aucune lecture"); }, crawlie: ["faux"], auditLlm: () => fauxLlm([{ titre: "Tout", actions: ENTREE.actions.map((a) => a.cle) }]),
      collector: () => { throw new Error("aucune collecte"); }, judge: () => noJudge(),
    } as never);
    expect(r.traitees[0]).toMatchObject({ id: d.id, type: "CONSOLIDER_PLAN", statut: "DONE" });
    expect(r.traitees[0]!.resultat).toMatchObject({ groupes: 1, actions: 4, multi_sources: 1 });
    expect((db.plansConsolides[0]!.groupes as unknown[]).length).toBe(1);
  });
});
