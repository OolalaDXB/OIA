import { describe, expect, it } from "vitest";
import { anchorViolations, scoutPrompt, ScoutedCallSchema, ScoutResultSchema, type ScoutPage } from "../src/scout";

/**
 * The guard that decides whether this feature is trustworthy or dangerous.
 *
 * A model asked to list funding calls on a thin page will supply the ones it
 * remembers instead — real names, real issuers, dead links, invented deadlines.
 * Those are worse than no answer, because they read as credible. The prompt
 * asks the model not to; this is what actually stops it.
 */

const page: ScoutPage = {
  url: "https://www.bretagne.bzh/aides/",
  text:
    "Aides de la Région Bretagne. " +
    "Le dispositif Pass Investissement soutient les PME bretonnes jusqu'à 50 000 €. " +
    "Candidatures ouvertes en continu.",
  links: [
    "https://www.bretagne.bzh/aides/pass-investissement/",
    "https://www.bretagne.bzh/aides/innovation/",
    "https://www.bretagne.bzh/contact/",
  ],
};

const call = (over: Record<string, unknown> = {}) =>
  ScoutedCallSchema.parse({
    title: "Pass Investissement",
    sourceUrl: "https://www.bretagne.bzh/aides/pass-investissement/",
    ...over,
  });

describe("anchoring a scouted call to the page it came from", () => {
  it("keeps a call whose link the page actually carries", () => {
    const { kept, dropped } = anchorViolations(page, [call()]);
    expect(kept).toHaveLength(1);
    expect(dropped).toHaveLength(0);
  });

  it("drops a plausible scheme the page never mentions", () => {
    // The dangerous case: a real French aid programme, correctly named, that
    // simply is not on this page. It must not survive.
    const { kept, dropped } = anchorViolations(page, [
      call({ title: "Bourse French Tech", sourceUrl: "https://www.bpifrance.fr/bourse-french-tech" }),
    ]);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toMatch(/not on the page/);
  });

  it("resolves a relative link against the page instead of rejecting it", () => {
    const { kept } = anchorViolations(page, [call({ sourceUrl: "/aides/innovation/" })]);
    expect(kept[0]!.sourceUrl).toBe("https://www.bretagne.bzh/aides/innovation/");
  });

  it("ignores www, trailing slashes and fragments when matching", () => {
    const { kept } = anchorViolations(page, [
      call({ sourceUrl: "https://bretagne.bzh/aides/pass-investissement#dates" }),
    ]);
    expect(kept).toHaveLength(1);
  });

  it("accepts the page's own URL as an anchor", () => {
    const { kept } = anchorViolations(page, [call({ sourceUrl: "https://www.bretagne.bzh/aides/" })]);
    expect(kept).toHaveLength(1);
  });

  it("drops a call with no link at all", () => {
    const { dropped } = anchorViolations(page, [
      ScoutedCallSchema.parse({ title: "Something", sourceUrl: " " }),
    ]);
    expect(dropped[0]!.reason).toMatch(/no source link/);
  });

  it("drops a quote the page does not contain, even when the link is real", () => {
    // Right link, invented supporting sentence — the subtler failure.
    const { kept, dropped } = anchorViolations(page, [
      call({ quote: "Le dispositif finance jusqu'à 2 millions d'euros sur trois ans sans condition." }),
    ]);
    expect(kept).toHaveLength(0);
    expect(dropped[0]!.reason).toMatch(/quoted text does not appear/);
  });

  it("keeps a quote the page really contains", () => {
    const { kept } = anchorViolations(page, [
      call({ quote: "Le dispositif Pass Investissement soutient les PME bretonnes jusqu'à 50 000 €." }),
    ]);
    expect(kept).toHaveLength(1);
  });
});

describe("what the model is shown", () => {
  it("gives it the page URL, the text and the link universe it must cite from", () => {
    const prompt = scoutPrompt(page);
    expect(prompt).toContain("https://www.bretagne.bzh/aides/");
    expect(prompt).toContain("Pass Investissement");
    expect(prompt).toContain("- https://www.bretagne.bzh/aides/innovation/");
  });

  it("truncates an enormous portal rather than sending the whole thing", () => {
    const huge = { ...page, text: "x".repeat(100_000) };
    expect(scoutPrompt(huge).length).toBeLessThan(40_000);
  });
});

/**
 * The silent-drop bug, which cost a full run and produced no error at all.
 *
 * Mistral returned 36,823 output tokens of extracted programmes and the scout
 * reported zero calls. `calls` had a default of `[]`, so a response keyed
 * `opportunities` parsed CLEANLY into an empty result: valid, successful, and
 * completely wrong. A schema that discards its input and reports success is
 * worse than one that rejects it, because rejection is visible.
 */
describe("taking the model's list whatever it called it", () => {
  const one = {
    title: "PIA 4",
    sourceUrl: "https://aides-territoires.beta.gouv.fr/programmes/pia-4/",
    issuer: "État",
  };

  it("still prefers a correctly keyed response", () => {
    const parsed = ScoutResultSchema.parse({ calls: [one], note: "" });
    expect(parsed.calls).toHaveLength(1);
  });

  it("rescues a list the model keyed 'opportunities'", () => {
    const parsed = ScoutResultSchema.parse({ opportunities: [one, one] });
    expect(parsed.calls).toHaveLength(2);
    expect(parsed.note).toMatch(/opportunities/);
  });

  it("rescues a list keyed in French", () => {
    expect(ScoutResultSchema.parse({ aides: [one] }).calls).toHaveLength(1);
  });

  it("rescues a single opportunity returned unwrapped", () => {
    const parsed = ScoutResultSchema.parse(one);
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]!.title).toBe("PIA 4");
  });

  it("says what the keys actually were when no list can be found", () => {
    // The next person debugging this should not have to guess either.
    const parsed = ScoutResultSchema.parse({ summary: "nothing here", page: "x" });
    expect(parsed.calls).toHaveLength(0);
    expect(parsed.note).toMatch(/keys were: summary, page/);
  });

  it("does not mistake a list of strings for a list of opportunities", () => {
    const parsed = ScoutResultSchema.parse({ links: ["https://a.fr", "https://b.fr"] });
    expect(parsed.calls).toHaveLength(0);
  });

  it("reports an empty page as empty, not as a failure", () => {
    const parsed = ScoutResultSchema.parse({ calls: [], note: "this is a contact page" });
    expect(parsed.calls).toHaveLength(0);
    expect(parsed.note).toBe("this is a contact page");
  });
});
