import { describe, expect, it } from "vitest";
import { anchorViolations, scoutPrompt, ScoutedCallSchema, type ScoutPage } from "../src/scout";

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
