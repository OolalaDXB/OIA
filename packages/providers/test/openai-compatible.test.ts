import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createGeminiProvider, createOpenAIProvider, createOpenRouterProvider, createPerplexityProvider, createProviderFromEnv, createXaiProvider, keyEnvFor } from "../src";

const Schema = z.object({ title: z.string() });
const req = { schema: Schema, schemaName: "Thing", system: "read", input: "text", purpose: "test" };

function fakeFetch(bodies: string[], onCall?: (url: string, init: RequestInit) => void, usage: Record<string, number> = { prompt_tokens: 10, completion_tokens: 5 }) {
  let i = 0;
  return (async (url: string, init: RequestInit) => {
    onCall?.(String(url), init);
    const content = bodies[Math.min(i++, bodies.length - 1)]!;
    return new Response(JSON.stringify({ choices: [{ message: { content } }], usage }), { status: 200 });
  }) as unknown as typeof fetch;
}

describe("openai-compatible providers", () => {
  it("OpenAI: endpoint, bearer key, JSON mode, temperature 0", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    let headers: Record<string, string> = {};
    const p = createOpenAIProvider({ apiKey: "k1", model: "gpt-x", fetchImpl: fakeFetch(['{"title":"A"}'], (u, i) => { url = u; body = JSON.parse(String(i.body)); headers = i.headers as Record<string, string>; }) });
    const r = await p.extract(req);
    expect(r.data.title).toBe("A");
    expect(r.run.provider).toBe("openai");
    expect(url).toBe("https://api.openai.com/v1/chat/completions");
    expect(headers.authorization).toBe("Bearer k1");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.temperature).toBe(0);
    expect(body.usage).toBeUndefined();
  });

  it("OpenRouter: endpoint, model passed through, real cost recorded", async () => {
    let url = "";
    let body: Record<string, unknown> = {};
    const p = createOpenRouterProvider({ apiKey: "k2", model: "x-ai/grok-x", fetchImpl: fakeFetch(['{"Thing":{"title":"B"}}'], (u, i) => { url = u; body = JSON.parse(String(i.body)); }, { prompt_tokens: 10, completion_tokens: 5, cost: 0.0123 }) });
    const r = await p.extract({ ...req, model: "google/gemini-3-flash-preview" });
    expect(r.data.title).toBe("B");
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(body.model).toBe("google/gemini-3-flash-preview");
    expect(body.usage).toEqual({ include: true });
    expect(r.run.costUsd).toBe(0.0123);
    expect(p.usage()).toEqual({ calls: 1, inputTokens: 10, outputTokens: 5, costUsd: 0.0123 });
  });

  it("stops at the call budget instead of spending", async () => {
    const p = createOpenRouterProvider({ apiKey: "k", model: "m", maxCalls: 1, fetchImpl: fakeFetch(['{"title":"A"}']) });
    await p.extract(req);
    await expect(p.extract(req)).rejects.toThrow("call budget of 1 exhausted");
  });

  it("retries once on unparseable output, then gives up", async () => {
    let n = 0;
    const p = createOpenAIProvider({ apiKey: "k", model: "m", fetchImpl: fakeFetch(["nope"], () => { n++; }) });
    await expect(p.extract(req)).rejects.toThrow("OpenAI extract failed");
    expect(n).toBe(2);
  });

  it("surfaces an API error with its status", async () => {
    const f = (async () => new Response("bad key", { status: 401 })) as unknown as typeof fetch;
    const p = createOpenRouterProvider({ apiKey: "k", model: "m", fetchImpl: f });
    await expect(p.extract(req)).rejects.toThrow("OpenRouter API error 401");
  });

  it("xAI, Gemini et Perplexity en direct : bonne adresse, clé en Bearer", async () => {
    const cas = [
      [createXaiProvider, "https://api.x.ai/v1/chat/completions", "xai"],
      [createGeminiProvider, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "gemini"],
      [createPerplexityProvider, "https://api.perplexity.ai/chat/completions", "perplexity"],
    ] as const;
    for (const [make, attendu, nom] of cas) {
      let url = "";
      let body: Record<string, unknown> = {};
      const p = make({ apiKey: "k", model: "m", fetchImpl: fakeFetch(['{"title":"C"}'], (u, i) => { url = u; body = JSON.parse(String(i.body)); }) });
      const r = await p.extract(req);
      expect(url).toBe(attendu);
      expect(r.run.provider).toBe(nom);
      expect(body.response_format === undefined).toBe(nom === "perplexity");
    }
    expect(keyEnvFor("xai")).toBe("XAI_API_KEY");
    expect(keyEnvFor("gemini")).toBe("GEMINI_API_KEY");
    expect(keyEnvFor("perplexity")).toBe("PERPLEXITY_API_KEY");
  });

  it("is selectable from the environment", () => {
    const base = { LLM_API_KEY: "k", LLM_MODEL: "m" } as Record<string, unknown>;
    expect(createProviderFromEnv({ ...base, LLM_PROVIDER: "openai" } as never).name).toBe("openai");
    expect(createProviderFromEnv({ ...base, LLM_PROVIDER: "openrouter" } as never).name).toBe("openrouter");
    expect(createProviderFromEnv({ ...base, LLM_PROVIDER: "mistral" } as never).name).toBe("mistral");
    for (const n of ["xai", "gemini", "perplexity"]) expect(createProviderFromEnv({ ...base, LLM_PROVIDER: n } as never).name).toBe(n);
  });
});
