import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createMistralProvider, unwrapEnvelope } from "../src/mistral";

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

/**
 * The failure that looked like the model's fault and was ours.
 *
 * A funding portal listing twenty programmes does not fit in 4096 output
 * tokens. The JSON came back cut off mid-array and surfaced as
 * "SyntaxError: Expected ',' or ']' after array element at position 12035" —
 * which reads like a model that cannot follow instructions, and is a ceiling
 * nobody set high enough.
 */
describe("output truncation", () => {
  const truncated = '{"calls":[{"title":"A","sourceUrl":"https://x.fr/a"},{"title":"B","sourceU';

  it("names the ceiling instead of reporting a parse error", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      maxOutputTokens: 4096,
      fetchImpl: fakeFetch([truncated]) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/cut off at \d+ characters — raise maxOutputTokens \(currently 4096\)/);
  });

  it("does not burn a second call retrying something that will truncate identically", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch([truncated]) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/cut off/);
    expect(p.usage().calls).toBe(1);
  });

  it("still retries output that is merely wrong rather than cut off", async () => {
    // Ends cleanly, so it is a model mistake and worth one more attempt.
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch(['{"wrong":"shape"}']) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/failed to produce valid Thing/);
    expect(p.usage().calls).toBe(2);
  });

  it("asks for enough room by default", async () => {
    let sent: Record<string, unknown> = {};
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch(['{"title":"ok"}'], (b) => (sent = b as Record<string, unknown>)) as unknown as typeof fetch,
    });
    await p.extract(req);
    expect(Number(sent["max_tokens"])).toBeGreaterThanOrEqual(16_000);
  });
});

/**
 * The envelope that cost two full runs before it was recognised as ONE problem.
 *
 * The system suffix says 'a single JSON object for "X"', and the model obeys
 * exactly: {"X": {...}}. It broke the scout, was fixed there, then broke the
 * analyst identically. It is a quirk of how we ASK, so it is handled next to the
 * asking — and asserted against a real captured response.
 */
describe("the schema-name envelope", () => {
  const real = JSON.parse(
    readFileSync(join(__dirname, "fixtures", "mistral-envelope.json"), "utf8"),
  ) as Record<string, unknown>;

  it("unwraps a real captured response", () => {
    expect(Object.keys(real)).toEqual(["EligibilityVerdict"]); // the shape that broke it
    const inner = unwrapEnvelope(real, "EligibilityVerdict") as Record<string, unknown>;
    expect(inner["verdict"]).toBe("NOT_ELIGIBLE");
    expect(inner["reason"]).toBeTypeOf("object");
  });

  it("unwraps whatever the wrapper was called", () => {
    const inner = unwrapEnvelope({ result: { a: 1 } }, "Thing") as Record<string, unknown>;
    expect(inner["a"]).toBe(1);
  });

  it("leaves a correctly shaped response alone", () => {
    const flat = { verdict: "ELIGIBLE", reason: { fr: "x", en: "x" } };
    expect(unwrapEnvelope(flat, "EligibilityVerdict")).toBe(flat);
  });

  it("never unwraps when there is content beside the wrapper", () => {
    // Two keys means the outer object is the answer, not an envelope.
    const both = { EligibilityVerdict: { a: 1 }, note: "x" };
    expect(unwrapEnvelope(both, "EligibilityVerdict")).toBe(both);
  });

  it("never unwraps a lone key holding an array — that is the payload", () => {
    const list = { calls: [{ a: 1 }] };
    expect(unwrapEnvelope(list, "ScoutResult")).toBe(list);
  });

  it("parses an enveloped response end to end", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      fetchImpl: fakeFetch(['{"Thing":{"title":"Wrapped"}}']) as unknown as typeof fetch,
    });
    expect((await p.extract(req)).data.title).toBe("Wrapped");
    expect(p.usage().calls).toBe(1); // no retry needed
  });
});

/**
 * 40 calls, 0 tokens, 7 seconds, no verdicts, and no reason anywhere.
 *
 * Forty sequential calls with no pause is how a run turns its own impatience
 * into an empty result. 429 and 5xx mean "come back later", not "you asked
 * wrongly", and they are the one class worth waiting out.
 */
describe("transient failures", () => {
  function failThenSucceed(status: number, failures: number) {
    let n = 0;
    return (async () => {
      if (n++ < failures) return new Response("slow down", { status, headers: { "retry-after": "0" } });
      return new Response(
        JSON.stringify({ choices: [{ message: { content: '{"title":"ok"}' } }], usage: {} }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
  }

  it("waits out a 429 instead of reporting an empty result", async () => {
    const p = createMistralProvider({ apiKey: "k", model: "m", retryBaseMs: 1, fetchImpl: failThenSucceed(429, 2) });
    expect((await p.extract(req)).data.title).toBe("ok");
  });

  it("waits out a 503 too", async () => {
    const p = createMistralProvider({ apiKey: "k", model: "m", retryBaseMs: 1, fetchImpl: failThenSucceed(503, 1) });
    expect((await p.extract(req)).data.title).toBe("ok");
  });

  it("does not charge a retry against the call budget", async () => {
    // Otherwise a rate limit silently eats the budget and the run stops early
    // for a reason that has nothing to do with spending.
    const p = createMistralProvider({ apiKey: "k", model: "m", maxCalls: 1, retryBaseMs: 1, fetchImpl: failThenSucceed(429, 2) });
    await p.extract(req);
    expect(p.usage().calls).toBe(1);
  });

  it("gives up rather than retrying forever, and says the status", async () => {
    const p = createMistralProvider({
      apiKey: "k",
      model: "m",
      retryBaseMs: 1,
      fetchImpl: (async () => new Response("nope", { status: 429, headers: { "retry-after": "0" } })) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/Mistral API error 429/);
  });

  it("never retries a 401 — a wrong key does not fix itself", async () => {
    let calls = 0;
    const p = createMistralProvider({
      apiKey: "bad",
      model: "m",
      fetchImpl: (async () => {
        calls++;
        return new Response("unauthorized", { status: 401 });
      }) as unknown as typeof fetch,
    });
    await expect(p.extract(req)).rejects.toThrow(/401/);
    expect(calls).toBeLessThanOrEqual(2); // the schema retry only, no backoff loop
  });
});
