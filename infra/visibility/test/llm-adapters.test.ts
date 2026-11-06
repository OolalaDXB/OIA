import { describe, expect, it } from "vitest";
import { composeLLM, createAdapter, readLLMConfigFromEnv } from "../src/llm-adapters";

describe("LLM adapters (G1)", () => {
  it("every real adapter refuses to execute this night", async () => {
    for (const provider of ["mistral", "anthropic", "openai", "gemini"] as const) {
      const a = createAdapter({ provider, model: "any" });
      await expect(a.reformulate({ purpose: "panel.reformulate", system: "s", input: "i" })).rejects.toThrow(/placeholder this night/);
    }
  });

  it("composeLLM throws when a purpose is not configured", async () => {
    const llm = composeLLM({});
    await expect(llm.reformulate({ purpose: "panel.reformulate", system: "s", input: "i" })).rejects.toThrow(/no adapter configured/);
  });

  it("readLLMConfigFromEnv reads only purposes whose provider AND model are set", () => {
    const env = {
      OIA_VIS_LLM_PANEL_REFORMULATE_PROVIDER: "mistral",
      OIA_VIS_LLM_PANEL_REFORMULATE_MODEL: "mistral-medium-latest",
      OIA_VIS_LLM_PANEL_REFORMULATE_MAX_COST_USD: "0.01",
      // facts.extract has a provider but no model → ignored.
      OIA_VIS_LLM_FACTS_EXTRACT_PROVIDER: "openai",
    };
    const cfg = readLLMConfigFromEnv(env);
    expect(cfg["panel.reformulate"]).toEqual({ provider: "mistral", model: "mistral-medium-latest", maxCostUsd: 0.01 });
    expect(cfg["facts.extract"]).toBeUndefined();
  });
});
