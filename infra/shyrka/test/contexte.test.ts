import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { etatOia, lectureAutorisee, resumeDuJour } from "../src/contexte.js";
import { RACINE_DEPOT } from "../src/local.js";
import { promptSysteme, sectionDuCadre } from "../src/persona.js";

describe("contexte en lecture seule (rapports, J0, décisions, budget)", () => {
  it("liste blanche : rapports, fenêtres de mesure, roadmap, garde-fou de coût", () => {
    expect(lectureAutorisee(join(RACINE_DEPOT, "infra/visibility/reports/runbook-j0.md"))).toBe(true);
    expect(lectureAutorisee(join(RACINE_DEPOT, "infra/visibility/subjects/coach-gari/measurement.yaml"))).toBe(true);
    expect(lectureAutorisee(join(RACINE_DEPOT, "docs/roadmap-oia-shyrka-souffleur.md"))).toBe(true);
  });

  it("refuse tout le reste : secrets, faits du client, code, chemins détournés", () => {
    for (const p of [
      "infra/visibility/elmo/.env",
      "infra/visibility/subjects/coach-gari/facts.yaml",
      "infra/visibility/subjects/coach-gari/panel.yaml",
      "infra/shyrka/permissions.json",
      "apps/web/src/data/console.json",
      "infra/visibility/reports/../elmo/.env",
      "../etc/passwd",
    ]) expect(lectureAutorisee(join(RACINE_DEPOT, p)), p).toBe(false);
  });

  it("construit l'état d'OIA depuis le dépôt et en tire un résumé lisible à voix haute", () => {
    const e = etatOia();
    expect(e.budget).toEqual({ plafond: 30, alerte: 24 });
    expect(e.fenetres.some((f) => f.id === "j0")).toBe(true);
    expect(e.rapports.length).toBeGreaterThan(0);
    const texte = resumeDuJour(e, new Date("2026-11-09T10:00:00Z"));
    expect(texte).toMatch(/plafond de 30 dollars/);
    expect(texte).not.toMatch(/—/);
  });

  it("résumé : jour de la fenêtre en cours, décisions", () => {
    const texte = resumeDuJour({ rapports: [], fenetres: [{ sujet: "demo", id: "j0", statut: "running", debut: "2026-11-07", jours: 5 }], decisions: ["Choisir le serveur."], budget: { plafond: 30, alerte: 24 } }, new Date("2026-11-09T10:00:00Z"));
    expect(texte).toContain("jour 3 sur 5");
    expect(texte).toContain("1 décisions t'attendent. La première : Choisir le serveur.");
  });

  it("le prompt reprend le rôle et le style du cadre, et le tutoiement", () => {
    const cadre = "## Rôle\nOrchestrer.\n\n## Style\nPhrases courtes.\n\n## Autre\nNon.";
    expect(sectionDuCadre(cadre, "Style")).toBe("Phrases courtes.");
    const p = promptSysteme("J0 en cours.", cadre);
    expect(p).toContain("Tu le tutoies");
    expect(p).toContain("Orchestrer.");
    expect(p).toContain("Phrases courtes.");
    expect(p).not.toContain("Non.");
    expect(p).toContain("J0 en cours.");
  });
});
