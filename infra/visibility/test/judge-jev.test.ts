import { describe, expect, it } from "vitest";
import type { FetchLike } from "../src/collector-oia/http";
import { MissingKeyError } from "../src/collector-oia-direct";
import { createJudge, JEV_PRICE, judgeWorstCaseUsd, matchFacts, noJudge } from "../src/judge";
import { JEV_JUDGE_VERSION, JEV_MAX_CALLS_PER_ANSWER, RULES, TYPESAFE_ENDPOINT, type MentionConfig } from "../src/judge-jev";

const KEY = "ts-test-key-000000";
const config: MentionConfig = {
  brand: { name: "Sujet Fictif", aliases: ["SF Studio"], domains: ["https://www.sujet-fictif.example/"] },
  competitors: [
    { name: "Rival Co", aliases: ["Rival"], domains: ["rival.example"] },
    { name: "Autre Maison", aliases: [], domains: ["autre.example"] },
  ],
};
const TEXT = "Top picks:\n\n1. Sujet Fictif is a great choice. It offers live sessions.\n2. Rival is cheaper ([rival.example](https://rival.example/a)).\n\nA place to start.";

type Verdicts = Record<string, Record<string, number>>;
/** Jev fictif : répond à chaque question posée ; `verdicts` donne les probabilités par entreprise (brand, c0…). */
function fakeJev(verdicts: Verdicts, replies: { status: number; body?: string; headers?: Record<string, string> }[] = []) {
  const seen: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetch: FetchLike = async (url, init) => {
    const body = JSON.parse(init.body!);
    seen.push({ url, headers: init.headers, body });
    const forced = replies.shift();
    if (forced) return { ok: false, status: forced.status, headers: { get: (n) => forced.headers?.[n.toLowerCase()] ?? null }, text: async () => forced.body ?? "" };
    const answers: Record<string, unknown> = {};
    for (const key of Object.keys(body.questions)) {
      const [company, kind] = key.split("__");
      const probabilities = kind === "verdict" ? verdicts[company!] ?? { neutral: 0.9 } : { p1: 1 };
      answers[key] = { choice: Object.entries(probabilities).sort((a, b) => b[1] - a[1])[0]![0], probabilities };
    }
    // Clé jamais demandée : ne doit rien ajouter.
    answers["c1__verdict"] = { choice: "positive", probabilities: { positive: 1 } };
    const text = JSON.stringify({ answers, usage: { input_tokens: 900, output_tokens: 8 } });
    return { ok: true, status: 200, headers: { get: () => null }, text: async () => text };
  };
  return { fetch, seen };
}
const jev = (fetch: FetchLike) => createJudge("jev", { fetch, env: { TYPESAFE_API_KEY: KEY }, sleep: async () => {} });

describe("correspondance déterministe (un fait)", () => {
  it("noms, alias et domaines en mot entier, avec le terme, la position et le passage exact", () => {
    const f = matchFacts(TEXT, config);
    expect(f.brand).toMatchObject({ name: "Sujet Fictif", term: "Sujet Fictif", mentionCount: 1 });
    expect(f.brand!.passage!.text).toBe("1. Sujet Fictif is a great choice.");
    expect(TEXT.slice(f.brand!.firstMention, f.brand!.firstMention + 12)).toBe("Sujet Fictif");
    expect(f.competitors.map((c) => c.name)).toEqual(["Rival Co"]);
    expect(f.competitors[0]!.term).toBe("Rival");
    // « Rival Coach » ne nomme pas « Rival Co » ; « place » ne nomme pas un alias « ace ».
    expect(matchFacts("Ask Rival Coach.", { brand: { name: "Ace", aliases: [], domains: [] }, competitors: [{ name: "Rival Co", aliases: [], domains: [] }] })).toEqual({ brand: null, competitors: [] });
  });

  it("sans juge : présence = correspondance, aucun coût", async () => {
    const r = await noJudge().judge({ text: TEXT, question: "q", config });
    expect(r).toMatchObject({ brandMentioned: true, competitorsMentioned: ["Rival Co"], costUsd: 0, calls: 0 });
    expect(r.mentions.judge).toBeNull();
  });
});

describe("juge Jev (D1)", () => {
  it("requête de J0 : modèle épinglé, mêmes règles, seulement les entreprises nommées", async () => {
    const j = fakeJev({});
    const r = await jev(j.fetch).judge({ text: TEXT, question: "Which coach?", config });
    expect(j.seen).toHaveLength(1);
    const { url, headers, body } = j.seen[0]!;
    expect(url).toBe(TYPESAFE_ENDPOINT);
    expect(headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(body.model).toBe("jev-1.13.0");
    expect(body.state.rules).toBe(RULES);
    expect(body.state.question).toBe("Which coach?");
    // Liens réduits à leur domaine par le nettoyage d'Elmo.
    expect(body.state.answer).toContain("Rival is cheaper (rival.example).");
    expect(Object.keys(body.questions).sort()).toEqual(["brand__evidence", "brand__verdict", "c0__evidence", "c0__verdict"]);
    // Domaines tels que configurés, comme Elmo (son site en URL complète à J0) ; normalisés pour la seule correspondance.
    expect(body.questions.brand__verdict.instructions).toBe("How does the answer portray Sujet Fictif (website https://www.sujet-fictif.example/)? A link to its website counts as a mention.");
    expect(r).toMatchObject({ brandMentioned: true, competitorsMentioned: ["Rival Co"], calls: 1 });
    const judge = r.mentions.judge as any;
    expect(judge).toMatchObject({ status: "juge", kind: "extrait (Jev 1.13)", judgeVersion: "jev-1.13.0+request-1" });
    expect(judge.usage[0].usage).toEqual({ input_tokens: 900, output_tokens: 8 });
    expect(judge.assessments.brand.passageText).toContain("Sujet Fictif");
    expect(r.mentions.stamp).toMatch(/:judge-jev-1\.13\.0\+request-1$/);
    expect(r.costUsd).toBeCloseTo(JEV_PRICE.perCallUsd, 9);
  });

  it("Jev ne peut que retirer : autre entreprise du même nom → retirée ; une clé non demandée n'ajoute rien", async () => {
    const r = await jev(fakeJev({ c0: { other_company: 0.9, neutral: 0.1 } }).fetch).judge({ text: TEXT, question: "q", config });
    expect(r.brandMentioned).toBe(true);
    expect(r.competitorsMentioned).toEqual([]);
    expect((r.mentions.judge as any).removed).toEqual({ brand: false, competitors: ["Rival Co"] });
    expect((r.mentions.facts as any).competitors.map((c: any) => c.name)).toEqual(["Rival Co"]);
  });

  it("seuil de 0,3 : un juge qui doute n'efface pas une mention", async () => {
    const r = await jev(fakeJev({ brand: { positive: 0.2, neutral: 0.15, other_company: 0.65 } }).fetch).judge({ text: TEXT, question: "q", config });
    expect(r.brandMentioned).toBe(true);
    expect((r.mentions.judge as any).assessments.brand.probability).toBeCloseTo(0.35, 9);
  });

  it("aucune entreprise suivie nommée : rien n'est envoyé à Jev", async () => {
    const j = fakeJev({});
    const r = await jev(j.fetch).judge({ text: "Nothing relevant here.", question: "q", config });
    expect(j.seen).toHaveLength(0);
    expect(r).toMatchObject({ brandMentioned: false, competitorsMentioned: [], costUsd: 0 });
    expect((r.mentions.judge as any).status).toBe("non-envoye");
  });

  it("429 puis succès ; requête trop grosse : découpée par entreprise, chaque appel compté", async () => {
    const j = fakeJev({}, [{ status: 429, body: "slow down", headers: { "retry-after": "2" } }, { status: 400, body: '{"error":"max_tokens_exceeded"}' }]);
    const r = await jev(j.fetch).judge({ text: TEXT, question: "q", config });
    expect(j.seen).toHaveLength(4);
    expect(Object.keys(j.seen[2]!.body.questions)).toEqual(["brand__verdict", "brand__evidence"]);
    expect(Object.keys(j.seen[3]!.body.questions)).toEqual(["c0__verdict", "c0__evidence"]);
    expect(r).toMatchObject({ brandMentioned: true, competitorsMentioned: ["Rival Co"], calls: 2 });
  });

  it("échec de Jev : présence non tranchée (null), faits gardés, la clé jamais dans le message", async () => {
    const r = await jev(fakeJev({}, [{ status: 401, body: `bad key ${KEY}` }]).fetch).judge({ text: TEXT, question: "q", config });
    expect(r.brandMentioned).toBeNull();
    expect(r.competitorsMentioned).toBeNull();
    const judge = r.mentions.judge as any;
    expect(judge.status).toBe("echec");
    expect(judge.error).not.toContain(KEY);
    expect((r.mentions.facts as any).brand.name).toBe("Sujet Fictif");
    expect(r.costUsd).toBeGreaterThan(0);
  });

  it("choix du juge : mistral non retenu, jev sans clé refusé, stub refusé ; majorant", () => {
    const fetch: FetchLike = async () => {
      throw new Error("aucun appel");
    };
    expect(() => createJudge("mistral", { fetch, env: {} })).toThrow(/non retenu/);
    expect(() => createJudge("jev", { fetch, env: {} })).toThrow(MissingKeyError);
    expect(() => createJudge("jev", { fetch, env: { TYPESAFE_API_KEY: "stub" } })).toThrow(/stub/);
    expect(createJudge("aucun", { fetch, env: {} }).name).toBe("aucun");
    expect(() => createJudge("autre", { fetch, env: {} })).toThrow(/inconnu/);
    expect(judgeWorstCaseUsd("jev")).toBeCloseTo(JEV_MAX_CALLS_PER_ANSWER * JEV_PRICE.perCallUsd, 9);
    expect(JEV_JUDGE_VERSION).toBe("jev-1.13.0+request-1");
  });
});
