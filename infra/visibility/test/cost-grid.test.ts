import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { type CostLine, findPrice, monthCostUsd, PRICE_GRID, runCostUsd, worstCaseRunUsd } from "../src/cost-grid.js";

const ROOT = resolve(__dirname, "..");

// Réponses types, au format que chaque fournisseur renvoie et qu'Elmo garde dans raw_output.
const sonnetRun: Extract<CostLine, { kind: "run" }> = {
  kind: "run",
  provider: "anthropic-api",
  version: "claude-sonnet-5-5",
  webSearch: true,
  usage: { input_tokens: 10_000, output_tokens: 2_500, server_tool_use: { web_search_requests: 1 } },
  searchItems: 0,
};

describe("grille de prix", () => {
  it("claude-sonnet-5-5 est au prix officiel : 2 $ en entrée, 10 $ en sortie par million de tokens", () => {
    const e = findPrice("anthropic-api", "claude-sonnet-5-5");
    expect(e?.inputPerMTok).toBe(2);
    expect(e?.outputPerMTok).toBe(10);
    expect(e?.perSearchUsd).toBe(0.01);
  });

  it("un run Sonnet 5.5 typique coûte 0,055 $, près de 3 fois l'estimation d'Elmo (0,02 $)", () => {
    // 10 000 × 2 $/M + 2 500 × 10 $/M + 1 recherche × 0,01 $
    expect(runCostUsd(sonnetRun)?.usd).toBeCloseTo(0.055, 6);
  });

  it("couvre les cinq moteurs retenus pour J0, et eux seuls", () => {
    expect(PRICE_GRID.map((e) => `${e.provider}:${e.id}`).sort()).toEqual([
      "anthropic-api:claude-sonnet-5-5",
      "mistral-api:mistral-medium-latest",
      "openai-api:gpt-6-luna",
      "openrouter:google/gemini-3-flash-preview",
      "openrouter:perplexity/sonar",
    ]);
  });

  it("reconnaît les versions telles qu'Elmo les enregistre, sans confondre les modèles voisins", () => {
    expect(findPrice("openrouter", "perplexity/sonar")?.id).toBe("perplexity/sonar");
    expect(findPrice("openrouter", "perplexity/sonar-pro")).toBeUndefined();
    expect(findPrice("openrouter", "google/gemini-3-flash-preview")?.id).toBe("google/gemini-3-flash-preview");
    expect(findPrice("openrouter", "google/gemini-3.5-flash")).toBeUndefined();
    expect(findPrice("mistral-api", "mistral-medium-latest")?.id).toBe("mistral-medium-latest");
    expect(findPrice("mistral-api", "mistral-large-latest")).toBeUndefined();
    expect(findPrice("anthropic-api", "claude-haiku-5-5")).toBeUndefined();
    expect(findPrice("anthropic-api", "claude-opus-5-5")).toBeUndefined();
  });

  it("lit les compteurs de chaque format de réponse", () => {
    const openai = runCostUsd({
      provider: "openai-api",
      version: "gpt-6-luna",
      webSearch: true,
      usage: { input_tokens: 10_000, output_tokens: 1_500 },
      searchItems: 2,
    });
    expect(openai?.usd).toBeCloseTo(0.001 + 0.00075 + 0.02, 6);
    const mistral = runCostUsd({
      provider: "mistral-api",
      version: "mistral-medium-latest",
      webSearch: true,
      usage: { prompt_tokens: 3_000, completion_tokens: 1_000, connector_tokens: 7_000, connectors: { web_search: 1 } },
      searchItems: 1,
    });
    expect(mistral?.usd).toBeCloseTo((10_000 * 0.7 + 1_000 * 2.1) / 1e6 + 0.03, 6);
    const gemini = runCostUsd({
      provider: "openrouter",
      version: "google/gemini-3-flash-preview",
      webSearch: true,
      usage: { prompt_tokens: 10_000, completion_tokens: 1_500 },
      searchItems: 0,
    });
    expect(gemini?.usd).toBeCloseTo(0.005 + 0.0045 + 0.014, 6);
  });

  it("garde le montant facturé par OpenRouter s'il dépasse le calcul, jamais s'il est inférieur", () => {
    const base = { provider: "openrouter", version: "perplexity/sonar", webSearch: true, searchItems: 0 };
    const calc = (2_000 * 1 + 1_000 * 1) / 1e6 + 0.005;
    expect(runCostUsd({ ...base, usage: { prompt_tokens: 2_000, completion_tokens: 1_000, cost: 0.5 } })?.usd).toBe(0.5);
    expect(runCostUsd({ ...base, usage: { prompt_tokens: 2_000, completion_tokens: 1_000, cost: 0 } })?.usd).toBeCloseTo(calc, 6);
  });

  it("compte au majorant un run sans compteurs, et un run échoué au majorant de son fournisseur", () => {
    const sonnet = findPrice("anthropic-api", "claude-sonnet-5-5")!;
    // 20 000 × 2 $/M + 8 000 × 10 $/M + 2 recherches × 0,01 $
    expect(worstCaseRunUsd(sonnet)).toBeCloseTo(0.04 + 0.08 + 0.02, 6);
    const noUsage = runCostUsd({ ...sonnetRun, usage: null });
    expect(noUsage?.fromUsage).toBe(false);
    expect(noUsage?.usd).toBeCloseTo(0.14, 6);
    const m = monthCostUsd([{ kind: "failed", provider: "anthropic-api", count: 2 }]);
    expect(m.usd).toBeCloseTo(0.28, 6);
    expect(m.worstCaseRuns).toBe(2);
  });

  it("signale un modèle absent de la grille au lieu de le compter à zéro", () => {
    const m = monthCostUsd([{ ...sonnetRun, version: "claude-opus-5-5" } as CostLine]);
    expect(m.unknown).toEqual(["anthropic-api:claude-opus-5-5"]);
  });

  it("signale les prix provisoires (Mistral Medium non tarifé par Mistral)", () => {
    const m = monthCostUsd([
      { kind: "run", provider: "mistral-api", version: "mistral-medium-latest", webSearch: false, usage: { prompt_tokens: 1, completion_tokens: 1 }, searchItems: 0 },
    ]);
    expect(m.provisional).toHaveLength(1);
  });
});

describe("cost-guard.sh avec la grille (à blanc : ni Docker, ni réseau, ni base)", () => {
  function guard(lines: CostLine[], est: string) {
    const dir = mkdtempSync(join(tmpdir(), "cost-guard-"));
    const runs = join(dir, "runs.jsonl");
    writeFileSync(runs, lines.map((l) => JSON.stringify(l)).join("\n"));
    const r = spawnSync("bash", [join(ROOT, "scripts/cost-guard.sh")], {
      encoding: "utf8",
      env: {
        ...process.env,
        OIA_VIS_DATA: dir,
        OIA_VIS_COST_GUARD_DRYRUN: "1",
        OIA_VIS_COST_GUARD_DRYRUN_EST: est,
        OIA_VIS_COST_GUARD_DRYRUN_ORR: "0",
        OIA_VIS_COST_GUARD_DRYRUN_MANUAL: "0",
        OIA_VIS_COST_GUARD_DRYRUN_RUNS: runs,
        OIA_VIS_MONTHLY_CAP_USD: "30",
        OIA_VIS_MONTHLY_ALERT_USD: "24",
        OIA_VIS_COST_SOURCE: "max",
      },
    });
    const journal = readFileSync(join(dir, "cost-journal.csv"), "utf8").trim().split("\n");
    return { status: r.status, header: journal[0] ?? "", last: (journal[journal.length - 1] ?? "").split(",") };
  }

  it("retient la grille quand l'estimation d'Elmo sous-estime Sonnet 5.5", () => {
    // 50 runs Sonnet typiques : Elmo estime 50 × 0,02 = 1 $ ; la grille donne 2,75 $.
    const { status, header, last } = guard(Array(50).fill(sonnetRun), "1.0");
    expect(status).toBe(0);
    expect(header.split(",")[3]).toBe("grid_usd");
    expect(Number(last[3])).toBeCloseTo(2.75, 4);
    expect(Number(last[6])).toBeCloseTo(2.75, 4);
  });

  it("arrête le worker (à blanc) quand la grille seule dépasse le plafond", () => {
    // 600 runs Sonnet au majorant (0,14 $) = 84 $ ; l'estimation d'Elmo reste à 12 $.
    const { status, last } = guard(Array(600).fill({ ...sonnetRun, usage: null }), "12");
    expect(status).toBe(3);
    expect(last[last.length - 1]).toBe("stop-worker(cap-reached)");
  });

  it("arrête le worker quand un modèle n'est pas dans la grille", () => {
    const { status, last } = guard([{ ...sonnetRun, version: "claude-opus-5-5" } as CostLine], "0");
    expect(status).toBe(4);
    expect(last[last.length - 1]).toBe("stop-worker(model-not-in-price-grid)");
  });
});
