import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { checkCapture, parseCapture, renderCaptureTemplate } from "../src/capture";
import { checkBundle, loadSubject } from "../src/load";
import type { SubjectBundle } from "../src/schema";

const here = dirname(fileURLToPath(import.meta.url));
const bundle = (): SubjectBundle => {
  const b = structuredClone(loadSubject(join(here, "fixtures", "demo-subject")));
  b.measurement.engines.push({ model: "chatgpt-app", collection: "manual", webSearch: true });
  return b;
};

const filled = (t: string) =>
  t
    .replace('app: ""', 'app: "ChatGPT web"')
    .replace('loggedIn: ""', "loggedIn: non")
    .replace('memory: ""', "memory: coupée")
    .replace('country: ""', "country: GB")
    .replace('capturedBy: ""', "capturedBy: Tester")
    .replace('capturedAt: ""', 'capturedAt: "2026-01-02T09:00Z"');

function answer(t: string, key: string, text: string, sources = ""): string {
  const start = t.indexOf(`## ${key}`);
  const a = t.indexOf("(coller la réponse ici)", start);
  t = t.slice(0, a) + text + t.slice(a + "(coller la réponse ici)".length);
  if (sources) {
    const placeholder = "(une URL par ligne, telles qu'affichées par l'app ; laisser vide si aucune)";
    const s = t.indexOf(placeholder, start);
    t = t.slice(0, s) + sources + t.slice(s + placeholder.length);
  }
  return t;
}

describe("manual capture", () => {
  it("the fixture with a manual engine stays valid", () => {
    expect(checkBundle(bundle())).toEqual([]);
  });

  it("refuses an engine that is not declared manual", () => {
    expect(() => renderCaptureTemplate(bundle(), "chatgpt", "2026-01-02")).toThrow(/not a manual engine/);
  });

  it("round-trip: template, fill, check → raw metrics, accents and case ignored, URLs from both places", () => {
    const b = bundle();
    let t = filled(renderCaptureTemplate(b, "chatgpt-app", "2026-01-02"));
    t = answer(t, "en-01@v1", "Top picks: RIVAL CO and others. See https://rival.example/top.", "https://news.example/list");
    t = answer(t, "en-02@v1", "démo subject — I mean Demo Subject — sells demos.", "https://www.demo.example/about\nhttps://rival.example/");
    const r = checkCapture(b, t, new Date("2026-01-02T10:00:00Z"));
    expect(r.problems).toEqual([]);
    expect(r.collection).toBe("manual-app");
    expect(r.summary).toEqual({
      expected: 2,
      captured: 2,
      notCaptured: 0,
      unfilled: 0,
      brandMentioned: 1,
      brandCited: 1,
      competitorsMentioned: { "Rival Co": 1 },
      citedDomains: { "news.example": 1, "rival.example": 2, "demo.example": 1 },
    });
    expect(r.answers[0]!.brand.mentioned).toBe(false);
    expect(r.answers[0]!.competitors["Rival Co"]!.cited).toBe(true);
    expect(r.answers[1]!.brand.matchedTerms).toContain("Demo Subject");
    expect(r.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("flags unfilled answers, missing metadata, and a reworded question", () => {
    const b = bundle();
    const t = renderCaptureTemplate(b, "chatgpt-app", "2026-01-02").replace("> Which demo tools are best?", "> Which demo tools are the best?");
    const r = checkCapture(b, t);
    expect(r.problems).toEqual(
      expect.arrayContaining([
        "front matter: « app » not filled",
        "en-01@v1: answer not filled (paste it, or write « NON CAPTURÉ : <raison> »)",
        "en-01@v1: question text was changed (it must stay exactly as written)",
      ]),
    );
    expect(r.summary).toMatchObject({ captured: 0, unfilled: 2 });
  });

  it("a question marked NON CAPTURÉ is consigned, not counted as an answer", () => {
    const b = bundle();
    let t = filled(renderCaptureTemplate(b, "chatgpt-app", "2026-01-02"));
    t = answer(t, "en-01@v1", "NON CAPTURÉ : quota de l'offre gratuite atteint");
    t = answer(t, "en-02@v1", "No idea.");
    const r = checkCapture(b, t);
    expect(r.problems).toEqual([]);
    expect(r.summary.captured).toBe(1);
    expect(r.summary.notCaptured).toBe(1);
    expect(r.answers[0]).toMatchObject({ status: "not-captured", reason: "quota de l'offre gratuite atteint" });
  });

  it("a missing section is reported", () => {
    const b = bundle();
    const t = filled(renderCaptureTemplate(b, "chatgpt-app", "2026-01-02"));
    const cut = t.slice(0, t.indexOf("## en-02@v1"));
    expect(parseCapture(cut).entries.map((e) => e.key)).toEqual(["en-01@v1"]);
    expect(checkCapture(b, cut).problems).toContain("en-02@v1: missing");
  });
});
