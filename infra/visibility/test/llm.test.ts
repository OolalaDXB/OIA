import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createFakeVisibilityLLM,
  createRefusingLLM,
  llmPromptHash,
  type ExtractRequest,
  type ReviewRequest,
} from "../src/llm";

describe("VisibilityLLM contract (fictive implementation)", () => {
  it("reformulate uses the handler and returns deterministic usage", async () => {
    const llm = createFakeVisibilityLLM({
      "panel.reformulate": ({ input }) => ({ text: `(reformulé fictif) ${input}` }),
    });
    const a = await llm.reformulate({ purpose: "panel.reformulate", system: "sys", input: "une question" });
    const b = await llm.reformulate({ purpose: "panel.reformulate", system: "sys", input: "une question" });
    expect(a.data.text).toBe("(reformulé fictif) une question");
    expect(a.usage.promptHash).toBe(b.usage.promptHash);
    expect(a.usage.provider).toBe("fake");
    expect(a.usage.purpose).toBe("panel.reformulate");
    expect(a.usage.costUsd).toBe(0);
  });

  it("suggest respects the limit", async () => {
    const llm = createFakeVisibilityLLM({
      "panel.suggest": () => ({ items: ["un", "deux", "trois", "quatre"] }),
    });
    const r = await llm.suggest({ purpose: "panel.suggest", system: "s", input: "i", limit: 2 });
    expect(r.data.items).toEqual(["un", "deux"]);
  });

  it("extract parses raw output into the caller's schema", async () => {
    const schema = z.object({ name: z.string(), aliases: z.array(z.string()) });
    const llm = createFakeVisibilityLLM({
      "facts.extract": () => ({ name: "Fictive Entity", aliases: ["fe"] }),
    });
    const req: ExtractRequest<z.infer<typeof schema>> = {
      purpose: "facts.extract",
      schemaName: "entity",
      system: "extract",
      input: "about an entity",
      parse: (raw) => schema.parse(raw),
    };
    const r = await llm.extract(req);
    expect(r.data).toEqual({ name: "Fictive Entity", aliases: ["fe"] });
  });

  it("extract surfaces a schema error when the handler is wrong", async () => {
    const schema = z.object({ name: z.string() });
    const llm = createFakeVisibilityLLM({
      "facts.extract": () => ({ wrong: 1 }),
    });
    await expect(
      llm.extract({
        purpose: "facts.extract",
        schemaName: "entity",
        system: "extract",
        input: "about an entity",
        parse: (raw) => schema.parse(raw),
      }),
    ).rejects.toThrow();
  });

  it("review returns typed findings", async () => {
    const llm = createFakeVisibilityLLM({
      "report.review": ({ reviewerRole }) => ({
        findings: [
          { kind: "error", text: `${reviewerRole}: constat fictif d'erreur` },
          { kind: "missing-evidence", text: "preuve absente (fictif)" },
        ],
      }),
    });
    const req: ReviewRequest = {
      purpose: "report.review",
      system: "s",
      report: "un rapport",
      reviewerRole: "seo",
    };
    const r = await llm.review(req);
    expect(r.data.findings.map((f) => f.kind)).toEqual(["error", "missing-evidence"]);
  });

  it("a missing handler throws rather than returning silent empty data", async () => {
    const llm = createRefusingLLM();
    await expect(
      llm.write({ purpose: "content.write", system: "s", input: "i" }),
    ).rejects.toThrow(/no handler for purpose "content.write"/);
  });

  it("llmPromptHash is stable and sensitive to all inputs", () => {
    const base = { purpose: "panel.reformulate" as const, system: "A", input: "B" };
    const h0 = llmPromptHash(base);
    const h1 = llmPromptHash(base);
    const h2 = llmPromptHash({ ...base, model: "x" });
    const h3 = llmPromptHash({ ...base, input: "B " });
    expect(h0).toBe(h1);
    expect(h0).not.toBe(h2);
    expect(h0).not.toBe(h3);
  });
});
