import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { VueMoteurs } from "@/components/oia/visibility-moteurs";
import { DESCRIPTION_AUDIT_IA } from "@/components/oia/visibility-audit-ia";
import { moteurs, plateformesMoteurs } from "@/data/visibility";
import { SourcesProvider } from "@/lib/donnees/provider";
import { donneesDemoVisibilityV3 } from "@/lib/donnees/visibility-v3";

type MoteurEstimation = { moteur?: string; cible?: string; appels?: number; max_usd?: number; habituel_usd?: number };

const estimation = donneesDemoVisibilityV3.estimationsAuditIa[0];
if (!estimation) throw new Error("Estimation de démonstration absente.");
const moteursEstimation: MoteurEstimation[] = Array.isArray(estimation.moteurs) ? (estimation.moteurs as MoteurEstimation[]) : [];
const somme = (cle: "max_usd" | "habituel_usd") => moteursEstimation.reduce((total, m) => total + (m[cle] ?? 0), 0);

afterEach(cleanup);

describe("Grok retiré de Visibility", () => {
  it("ne propose plus Grok dans la liste des plateformes à ajouter", () => {
    expect(plateformesMoteurs.map((p) => p.nom)).toEqual([
      "Google AI Mode", "Google AI Overview", "Copilot", "DeepSeek", "Qwen", "Kimi",
    ]);
    expect(plateformesMoteurs.some((p) => p.nom.toLowerCase().includes("grok"))).toBe(false);
  });

  it("ne mesure plus Grok parmi les assistants", () => {
    expect(moteurs.map((m) => m.assistant)).not.toContain("Grok");
    expect(moteurs.map((m) => m.assistant)).toEqual(["ChatGPT", "Claude", "Mistral", "Gemini", "Perplexity"]);
  });

  it("limite la démonstration de l'audit IA à ChatGPT, Gemini, Perplexity et Mistral gratuit", () => {
    expect(moteursEstimation.map((m) => m.moteur)).toEqual(["ChatGPT", "Gemini", "Perplexity", "Mistral"]);
    expect(moteursEstimation.find((m) => m.moteur === "Mistral")).toMatchObject({ max_usd: 0, habituel_usd: 0 });
    expect(estimation.cout_habituel_usd).toBeCloseTo(2.06, 2);
    expect(estimation.cout_max_usd).toBeCloseTo(4.1, 2);
    expect(somme("max_usd")).toBeCloseTo(estimation.cout_max_usd ?? 0, 2);
    expect(somme("habituel_usd")).toBeCloseTo(estimation.cout_habituel_usd ?? 0, 2);
    expect(estimation.questions).toBe(20);
    expect(estimation.appels).toBe(80);
  });

  it("ne cite plus Grok dans le texte contractuel de l'audit IA", () => {
    expect(DESCRIPTION_AUDIT_IA.toLowerCase()).not.toContain("grok");
    expect(DESCRIPTION_AUDIT_IA).toContain("Claude en option");
  });

  it("n'affiche aucune ligne Grok à l'écran des moteurs", () => {
    const vue = render(<SourcesProvider><VueMoteurs /></SourcesProvider>);
    expect(vue.container.textContent).not.toContain("Grok");
    expect(vue.getByText("Kimi")).toBeInTheDocument();
    expect(vue.getByText("DeepSeek")).toBeInTheDocument();
  });
});
