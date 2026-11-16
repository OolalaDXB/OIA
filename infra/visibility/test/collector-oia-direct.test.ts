import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectRequest } from "../src/collector";
import { MissingKeyError, createOiaDirectCollector, parseTarget, targetWorstCaseUsd } from "../src/collector-oia-direct";
import { ProviderError } from "../src/collector-oia/http";
import { MISTRAL_MAX_CONTINUATIONS } from "../src/collector-oia/mistral";
import { runCostUsd } from "../src/cost-grid";
import {
  anthropicResponse,
  anthropicSearchError,
  fakeFetch,
  geminiResponse,
  mistralContinuation,
  mistralFinalAfterContinuation,
  mistralNoFinalAnswer,
  mistralResponse,
  mistralStopsOnTool,
  ok,
  openaiResponse,
  perplexityResponse,
} from "./collector-oia-fixtures";

const KEYS = { OPENAI_API_KEY: "sk-test-openai-0000", ANTHROPIC_API_KEY: "sk-test-anthropic-0000", MISTRAL_API_KEY: "test-mistral-0000", OPENROUTER_API_KEY: "sk-or-test-0000" };
/** Option de suite des conversations Mistral (désactivée par défaut). */
const CONT = { ...KEYS, OIA_VIS_MISTRAL_CONTINUATION: "1" };
const URL_OPENAI = "https://api.openai.com/v1/responses";
const URL_ANTHROPIC = "https://api.anthropic.com/v1/messages";
const URL_MISTRAL = "https://api.mistral.ai/v1/conversations";
const URL_OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";

const req = (engine: string, target: string): CollectRequest => ({
  clientId: "c",
  siteId: "s",
  subjectId: "s",
  windowId: "w1",
  promptId: "en-01",
  promptVersion: 1,
  promptLanguage: "en",
  promptText: "Which demo tools are best?",
  engine,
  engineOptions: { target },
});

const sleeps: number[] = [];
const sleep = async (ms: number) => {
  sleeps.push(ms);
};
const now = () => new Date("2026-12-01T15:27:00Z");
const make = (fetch: ReturnType<typeof fakeFetch>["fetch"], env: Record<string, string | undefined> = KEYS) => createOiaDirectCollector({ fetch, env, sleep, now });

// Aucune requête réseau : le vrai fetch échoue s'il est appelé.
const realFetch = globalThis.fetch;
beforeEach(() => {
  sleeps.length = 0;
  globalThis.fetch = (() => {
    throw new Error("réseau interdit dans les tests");
  }) as unknown as typeof fetch;
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("cibles", () => {
  it("découpe une cible comme Elmo (SCRAPE_TARGETS)", () => {
    expect(parseTarget("gemini:openrouter:google/gemini-3-flash-preview:online")).toMatchObject({ engine: "gemini", provider: "openrouter", model: "google/gemini-3-flash-preview", webSearch: true });
    expect(parseTarget("chatgpt:openai-api:gpt-6-luna")).toMatchObject({ model: "gpt-6-luna", webSearch: false });
    expect(() => parseTarget("grok:xai:grok-5:online")).toThrow(/non pris en charge/);
    expect(() => parseTarget("chatgpt:openai-api")).toThrow(/format/);
  });
});

describe("OpenAI (Responses API)", () => {
  it("envoie les réglages d'Elmo et garde la réponse brute complète, compteurs compris", async () => {
    const f = fakeFetch({ [URL_OPENAI]: [ok(openaiResponse)] });
    const r = await make(f.fetch).collect(req("chatgpt", "chatgpt:openai-api:gpt-6-luna:online"));
    expect(f.seen[0]!.body).toEqual({
      model: "gpt-6-luna",
      input: [{ role: "user", content: [{ type: "input_text", text: "Which demo tools are best?" }] }],
      max_output_tokens: 8000,
      tool_choice: "auto",
      tools: [{ type: "web_search", search_context_size: "low" }],
      max_tool_calls: 2,
    });
    expect(f.seen[0]!.headers.Authorization).toBe(`Bearer ${KEYS.OPENAI_API_KEY}`);
    expect(r.collectorName).toBe("oia-direct");
    expect(r.collectorRunId).toBe("resp_fictif_1");
    expect(r.engineVersion).toBe("gpt-6-luna-2026-10-01");
    expect(r.rawText).toBe(openaiResponse.output[2]!.content![0]!.text);
    expect(r.citations).toEqual([{ url: "https://rival.example/?utm_source=openai", label: "Rival" }]);
    expect(r.structured.webQueries).toEqual(["demo tools", "best demo tools"]);
    expect((r.structured.raw as any[])[0].body).toEqual(openaiResponse);
    const expected = runCostUsd({ provider: "openai-api", version: "gpt-6-luna-2026-10-01", webSearch: true, usage: openaiResponse.usage, searchItems: 1 })!;
    expect(expected.fromUsage).toBe(true);
    expect(r.costUsd).toBeCloseTo(expected.usd, 6);
  });
});

describe("Anthropic (Messages API)", () => {
  it("max_uses 1, et garde tout le contenu des pages trouvées", async () => {
    const f = fakeFetch({ [URL_ANTHROPIC]: [ok(anthropicResponse)] });
    const r = await make(f.fetch).collect(req("claude", "claude:anthropic-api:claude-sonnet-5-5:online"));
    expect(f.seen[0]!.body).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 8000,
      messages: [{ role: "user", content: "Which demo tools are best?" }],
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
    });
    expect(f.seen[0]!.headers["x-api-key"]).toBe(KEYS.ANTHROPIC_API_KEY);
    expect(f.seen[0]!.headers["anthropic-version"]).toBe("2023-06-01");
    // Jointure par "\n" des blocs de texte, comme Elmo.
    expect(r.rawText).toBe("Voici ce que j'ai trouvé.\nA est cité.");
    expect(r.citations.map((c) => c.url)).toEqual(["https://a.example/page", "https://b.example/"]);
    expect(JSON.stringify(r.structured.raw)).toContain("CONTENU-COMPLET");
    expect(r.structured.webQueries).toEqual(["demo tools"]);
  });

  it("recherche en erreur : un nouvel appel 10 s plus tard, les deux réponses gardées et payées", async () => {
    const f = fakeFetch({ [URL_ANTHROPIC]: [ok(anthropicSearchError), ok(anthropicResponse)] });
    const r = await make(f.fetch).collect(req("claude", "claude:anthropic-api:claude-sonnet-5-5:online"));
    expect(f.seen).toHaveLength(2);
    expect(sleeps).toEqual([10_000]);
    expect((r.structured.raw as any[]).map((x) => x.role)).toEqual(["initial", "retry-web-search-error"]);
    expect(r.rawText).toBe("Voici ce que j'ai trouvé.\nA est cité.");
    const one = (u: unknown) => runCostUsd({ provider: "anthropic-api", version: "claude-sonnet-5-5", webSearch: true, usage: u, searchItems: 0 })!.usd;
    expect(r.costUsd).toBeCloseTo(one(anthropicSearchError.usage) + one(anthropicResponse.usage), 6);
  });
});

describe("Mistral (Conversations API)", () => {
  const target = "mistral:mistral-api:mistral-large-4:online";

  it("réglages d'Elmo ; texte sans le raisonnement ; aucune source renvoyée (pages consultées à part)", async () => {
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralResponse)] });
    const r = await make(f.fetch).collect(req("mistral", target));
    expect(f.seen[0]!.body).toEqual({ model: "mistral-large-4", inputs: "Which demo tools are best?", tools: [{ type: "web_search" }], completion_args: { max_tokens: 8000 } });
    expect(r.rawText).toBe("Rival Co est une option.");
    expect(r.citations).toEqual([]);
    expect(r.structured.searchResults).toEqual([{ url: "https://c.example/", title: "Page consultée" }]);
    expect(r.structured.thinking).toContain("Je dois chercher");
    expect(r.structured.sourcesReturned).toBe(false);
    expect(r.engineVersion).toBe("mistral-large-4");
    expect(r.collectorRunId).toBe("conv_fictif_1");
    expect(r.structured.searchItems).toBe(1);
  });

  it("par défaut (comme Elmo, comparabilité avec J0) : aucune suite, réponse consignée vide, finalAnswer false, avec sa raison", async () => {
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralNoFinalAnswer)] });
    const r = await make(f.fetch).collect(req("mistral", target));
    expect(f.seen).toHaveLength(1);
    expect(r.rawText).toBe("");
    expect(r.structured).toMatchObject({ finalAnswer: false, continuationEnabled: false, continuations: 0 });
    expect(String(r.structured.noTextReason)).toMatch(/^sans réponse finale.*désactivée/);
    expect(r.costUsd).toBeCloseTo(runCostUsd({ provider: "mistral-api", version: "mistral-large-4", webSearch: true, usage: mistralNoFinalAnswer.usage, searchItems: 5 })!.usd, 6);
  });

  it("option OIA_VIS_MISTRAL_CONTINUATION=1 : réponse arrêtée sur une recherche (vide dans Elmo), suite de la même conversation, texte récupéré", async () => {
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralStopsOnTool)], [`${URL_MISTRAL}/conv_fictif_2`]: [ok(mistralContinuation)] });
    const r = await make(f.fetch, CONT).collect(req("mistral", target));
    expect(f.seen.map((s) => s.url)).toEqual([URL_MISTRAL, `${URL_MISTRAL}/conv_fictif_2`]);
    // Aucune question ajoutée dans la suite.
    expect(f.seen[1]!.body).toEqual({ completion_args: { max_tokens: 8000 } });
    expect(r.rawText).toBe("Réponse rédigée après la recherche.");
    expect(r.structured.continuations).toBe(1);
    expect((r.structured.raw as any[]).map((x) => x.role)).toEqual(["initial", "continuation"]);
    const c = (u: unknown, s: number) => runCostUsd({ provider: "mistral-api", version: "mistral-large-4", webSearch: true, usage: u, searchItems: s })!.usd;
    expect(r.costUsd).toBeCloseTo(c(mistralStopsOnTool.usage, 2) + c(mistralContinuation.usage, 0), 6);
  });

  it("toujours sans texte après les suites : texte vide et raison consignée, jamais de texte de remplacement", async () => {
    const f = fakeFetch({
      [URL_MISTRAL]: [ok(mistralStopsOnTool)],
      [`${URL_MISTRAL}/conv_fictif_2`]: Array.from({ length: MISTRAL_MAX_CONTINUATIONS }, () => ok({ ...mistralStopsOnTool, outputs: [mistralStopsOnTool.outputs[1]] })),
    });
    const r = await make(f.fetch, CONT).collect(req("mistral", target));
    expect(f.seen).toHaveLength(1 + MISTRAL_MAX_CONTINUATIONS);
    expect(r.rawText).toBe("");
    expect(r.structured.answered).toBe(false);
    expect(String(r.structured.noTextReason)).toMatch(/^sans réponse finale/);
  });
});

describe("Mistral : réponses sans réponse finale (forme exacte de la base d'Elmo)", () => {
  const target = "mistral:mistral-api:mistral-large-4:online";
  const URL_CONV3 = `${URL_MISTRAL}/conv_fictif_3`;

  it("thinking > 3 tool.execution > thinking > 2 tool.execution : détectée, une suite donne la réponse finale, coût des deux appels", async () => {
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralNoFinalAnswer)], [URL_CONV3]: [ok(mistralFinalAfterContinuation)] });
    const r = await make(f.fetch, CONT).collect(req("mistral", target));
    expect(f.seen.map((s) => s.url)).toEqual([URL_MISTRAL, URL_CONV3]);
    expect(r.rawText).toBe("Réponse finale.");
    expect(r.structured).toMatchObject({ finalAnswer: true, continuations: 1, searchItems: 5 });
    expect(r.structured.thinking).toContain("Je cherche encore.");
    expect((r.structured.searchResults as any[]).map((x) => x.url)).toHaveLength(5);
    expect(r.citations).toEqual([]);
    const c = (u: unknown, s: number) => runCostUsd({ provider: "mistral-api", version: "mistral-large-4", webSearch: true, usage: u, searchItems: s })!.usd;
    expect(r.costUsd).toBeCloseTo(c(mistralNoFinalAnswer.usage, 5) + c(mistralFinalAfterContinuation.usage, 0), 6);
  });

  it("aucune réponse finale après les suites : consignée « sans réponse finale », texte vide, rien d'inventé", async () => {
    const f = fakeFetch({
      [URL_MISTRAL]: [ok(mistralNoFinalAnswer)],
      [URL_CONV3]: Array.from({ length: MISTRAL_MAX_CONTINUATIONS }, () => ok({ ...mistralNoFinalAnswer, outputs: mistralNoFinalAnswer.outputs.slice(4) })),
    });
    const r = await make(f.fetch, CONT).collect(req("mistral", target));
    expect(f.seen).toHaveLength(1 + MISTRAL_MAX_CONTINUATIONS);
    expect(r.rawText).toBe("");
    expect(r.structured.finalAnswer).toBe(false);
    expect(String(r.structured.noTextReason)).toMatch(/^sans réponse finale/);
    expect((r.structured.raw as any[]).map((x) => x.role)).toEqual(["initial", "continuation", "continuation"]);
  });

  it("suite vide : arrêt sans nouvel appel", async () => {
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralNoFinalAnswer)], [URL_CONV3]: [ok({ conversation_id: "conv_fictif_3", outputs: [], usage: {} })] });
    const r = await make(f.fetch, CONT).collect(req("mistral", target));
    expect(f.seen).toHaveLength(2);
    expect(r.structured.finalAnswer).toBe(false);
  });

  it("une réponse complète (finit par thinking + text) ne déclenche aucune suite", async () => {
    const f = fakeFetch({ [URL_MISTRAL]: [ok(mistralResponse)] });
    const r = await make(f.fetch).collect(req("mistral", target));
    expect(f.seen).toHaveLength(1);
    expect(r.structured).toMatchObject({ finalAnswer: true, continuations: 0 });
  });
});

describe("OpenRouter (Gemini, Perplexity)", () => {
  it("Gemini : :online ajouté, liens de redirection gardés, coût facturé retenu quand il est plus élevé", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [ok(geminiResponse)] });
    const r = await make(f.fetch).collect(req("gemini", "gemini:openrouter:google/gemini-3-flash-preview:online"));
    expect(f.seen[0]!.body).toEqual({ model: "google/gemini-3-flash-preview:online", messages: [{ role: "user", content: "Which demo tools are best?" }], max_tokens: 8000 });
    expect(r.citations.map((c) => c.url)).toEqual([
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA",
      "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB",
    ]);
    expect(r.costUsd).toBeCloseTo(0.058, 6);
    const perCall = (r.structured.cost as any).perCall[0];
    expect(perCall).toMatchObject({ billedUsd: 0.058, fromUsage: true, readable: true });
    expect(r.structured.billedUsd).toBe(0.058);
  });

  it("Perplexity : une recherche par appel, citations url_citation", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [ok(perplexityResponse)] });
    const r = await make(f.fetch).collect(req("perplexity", "perplexity:openrouter:perplexity/sonar:online"));
    expect(f.seen[0]!.body.model).toBe("perplexity/sonar:online");
    expect(r.citations).toEqual([{ url: "https://rival.example/coaching/", label: "Rival" }]);
    expect(r.structured.searchItems).toBe(1);
    expect(r.costUsd).toBeGreaterThanOrEqual(0.01519);
  });

  it("réponse sans texte ni citation : consignée telle quelle", async () => {
    const empty = { ...perplexityResponse, choices: [{ finish_reason: "stop", message: { role: "assistant", content: "" } }] };
    const r = await make(fakeFetch({ [URL_OPENROUTER]: [ok(empty)] }).fetch).collect(req("perplexity", "perplexity:openrouter:perplexity/sonar:online"));
    expect(r.rawText).toBe("");
    expect(r.citations).toEqual([]);
    expect(r.structured.notes).toContain("réponse sans texte");
  });
});

describe("erreurs et reprises", () => {
  const t = "perplexity:openrouter:perplexity/sonar:online";

  it("429 puis succès : reprise après Retry-After", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [{ status: 429, body: "rate limited", headers: { "retry-after": "3" } }, ok(perplexityResponse)] });
    const r = await make(f.fetch).collect(req("perplexity", t));
    expect(f.seen).toHaveLength(2);
    expect(sleeps).toEqual([3000]);
    expect(r.structured.httpAttempts).toEqual([2]);
  });

  it("5xx à chaque essai : échec définitif après 3 essais, backoff 2 s puis 4 s", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [{ status: 502, body: "bad gateway" }, { status: 503, body: "x" }, { status: 500, body: "y" }] });
    const err = await make(f.fetch).collect(req("perplexity", t)).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err).toMatchObject({ attempts: 3, transient: true, status: 500 });
    expect(sleeps).toEqual([2000, 4000]);
  });

  it("erreur réseau puis succès : reprise", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [new Error("ECONNRESET"), ok(perplexityResponse)] });
    const r = await make(f.fetch).collect(req("perplexity", t));
    expect(r.rawText).toBe("Rival Co [1].");
  });

  it("400 : aucune reprise, et la clé n'apparaît jamais dans le message", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [{ status: 400, body: `invalid key ${KEYS.OPENROUTER_API_KEY}` }] });
    const err = await make(f.fetch).collect(req("perplexity", t)).catch((e) => e);
    expect(f.seen).toHaveLength(1);
    expect(err).toMatchObject({ transient: false, status: 400 });
    expect(err.message).not.toContain(KEYS.OPENROUTER_API_KEY);
    expect(err.message).toContain("[clé masquée]");
  });

  it("clé absente : refus avant tout appel", async () => {
    const f = fakeFetch({});
    await expect(make(f.fetch, {}).collect(req("perplexity", t))).rejects.toBeInstanceOf(MissingKeyError);
    expect(f.seen).toHaveLength(0);
  });

  it("version servie absente de la grille : coût au majorant, marqué illisible", async () => {
    const f = fakeFetch({ [URL_OPENROUTER]: [ok({ ...perplexityResponse, model: "perplexity/sonar-nouveau", usage: { prompt_tokens: 1, completion_tokens: 1 } })] });
    const r = await make(f.fetch).collect(req("perplexity", t));
    expect((r.structured.cost as any).readable).toBe(false);
    expect(r.costUsd).toBeGreaterThan(0.1);
  });

  it("majorant d'une cible : un appel pour Mistral sans l'option, trois avec ; deux pour Anthropic", () => {
    const t = parseTarget("mistral:mistral-api:mistral-large-4:online");
    const one = targetWorstCaseUsd(t)!;
    expect(targetWorstCaseUsd(t, { mistralContinuation: true })).toBeCloseTo(one * (1 + MISTRAL_MAX_CONTINUATIONS), 9);
    const p = targetWorstCaseUsd(parseTarget("perplexity:openrouter:perplexity/sonar:online"))!;
    expect(one).toBeGreaterThan(p);
    expect(vi.isMockFunction(globalThis.fetch)).toBe(false);
  });
});
