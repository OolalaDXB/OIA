import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMistralProvider } from "../src/mistral";

const Schema = z.object({ title: z.string(), amount: z.number().optional() });

function fakeFetch(bodies: string[], onCall?: (body: unknown) => void) {
  let i = 0;
  return async (_url: string | URL | Request, init?: RequestInit) => {
    onCall?.(JSON.parse(String(init?.body)));
    const content = bodies[Math.min(i++, bodies.length - 1)]!;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 100, completion_tokens: 20 },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
}

const req = {
  schema: Schema,
  schemaName: "Thing",
  system: "read the page",
  input: "some page text",
  purpose: "test",
};

describe("mistral provider", () => {
  it("asks for native JSON mode rather than hoping the prompt is obeyed", async () => {
    let sent: Record<string, unknown> = {};
    const p = createMistralProvider({
      apiKey: "k",
      model: "mistral-large-latest",
      fetchImpl: fakeFetch(['{"title":"A call"}'], (b) => (sent = b as Record<string, unknown>)) as unknown as typeof fetch,
    });
    await p.extract(req);
    expect(sent["response_format"]).toEqual({ type: "json_object" });
    // Determinism matters more than flair when extracting facts from a page.
    expect(sent["temperature"]).toBe(0);
  });

  it("still survives a model that fences its JSON anyway", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch(['```json\n{"title":"Fenced"}\n```']) as unknown as typeof fetch,
    });
    expect((await p.extract(req)).data.title).toBe("Fenced");
  });

  it("retries once on unparseable output, then gives up rather than looping", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch(["not json at all"]) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/failed to produce valid Thing/);
    expect(p.usage().calls).toBe(2);
  });

  /**
   * The budget is the difference between an agent and a runaway bill. It must
   * stop the run, not warn about it — and a parse failure must not be able to
   * retry its way past the ceiling.
   */
  it("stops when the call budget is exhausted instead of spending more", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      maxCalls: 2,
      fetchImpl: fakeFetch(['{"title":"ok"}']) as unknown as typeof fetch,
    });
    await p.extract(req);
    await p.extract(req);
    await expect(p.extract(req)).rejects.toThrow(/call budget of 2 exhausted/);
    expect(p.usage().calls).toBe(2);
  });

  it("reports what it actually spent, so a run can print it instead of guessing", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch(['{"title":"ok"}']) as unknown as typeof fetch,
    });
    await p.extract(req);
    expect(p.usage()).toEqual({ calls: 1, inputTokens: 100, outputTokens: 20 });
  });

  it("surfaces an API error with its status rather than a generic failure", async () => {
    const p = createMistralProvider({
      apiKey: "bad",
      model: "m",
      fetchImpl: (async () => new Response("unauthorized", { status: 401 })) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/Mistral API error 401/);
  });
});
