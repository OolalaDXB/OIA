import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { EvidenceRow } from "../src/elmo-import.js";
import { sha256Hex } from "../src/evidence-store.js";
import type { ReportFigures } from "../src/j0-report.js";
import { loadSubject } from "../src/load.js";
import { parityCheck, renderParityMarkdown, writeParity, type ParityReference } from "../src/parity-check.js";
import type { SubjectBundle } from "../src/schema.js";
import type { WindowSpan } from "../src/window-compare.js";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(here, "..");
const REF: WindowSpan = { startedAt: "2026-11-01T09:00:00Z", days: 5 };
const PARITY_START = "2026-12-01";
const TARGETS = ["chatgpt:openai-api:gpt-6-luna:online", "claude:anthropic-api:claude-sonnet-5-5:online"];
/** 4 questions non marquées, 1 marquée : 5 attendues par moteur et par jour. */
const UNBRANDED = ["en-01", "en-03", "en-04", "en-05"];

/** Sujet fictif : référence j0 (5 jours) et mesure croisée p1 (2 jours), deux moteurs. */
function bundle(): SubjectBundle {
  const b = loadSubject(join(ROOT, "test/fixtures/demo-subject"));
  const base = b.panel.prompts.find((p) => p.id === "en-01")!;
  const w0 = b.measurement.windows[0]!;
  return {
    ...b,
    panel: { ...b.panel, prompts: [...b.panel.prompts, ...["en-03", "en-04", "en-05"].map((id) => ({ ...base, id, text: `Question ${id}?` }))] },
    measurement: {
      ...b.measurement,
      engines: ["chatgpt", "claude"].map((model) => ({ ...b.measurement.engines[0]!, model, collection: "api" as const })),
      windows: [
        { ...w0, status: "done", start: "2026-11-01", end: "2026-11-05", targets: TARGETS, runTimeUtc: "09:00" },
        { ...w0, id: "p1", kind: "follow-up", days: 2, status: "running", start: PARITY_START, targets: TARGETS, runTimeUtc: "09:00", comparesWith: "j0" },
      ],
    },
  };
}

let n = 0;
interface Day {
  /** Réponses mesurées aux questions non marquées (≤ 4), dont `mentions` nomment la marque. */
  answered?: number;
  mentions?: number;
  /** Réponses sans texte, en plus (non mesurées). */
  empty?: number;
  citations?: number;
  length?: number;
  /** Réponse à la question marquée (nomme la marque). */
  branded?: boolean;
}
function rows(window: "j0" | "p1", collector: string, engine: string, day: number, d: Day): EvidenceRow[] {
  const t0 = window === "j0" ? Date.parse(REF.startedAt) : Date.parse(`${PARITY_START}T09:00:00Z`);
  const { answered = 4, mentions = 1, empty = 0, citations = 3, length = 1000, branded = true } = d;
  const mk = (promptId: string, text: string, mentioned: boolean | null): EvidenceRow => {
    n++;
    return {
      id: `${collector}:${window}-${n}`, clientId: "demo-subject", siteId: "demo-subject", subjectId: "demo-subject", windowId: window,
      promptId, promptVersion: 1, promptLanguage: "en", engine, engineVersion: `${engine}-v1`, collectorName: collector, collectorRunId: String(n),
      receivedAt: new Date(t0 + (day - 1) * 86_400_000 + n * 1000).toISOString(),
      rawText: text, rawSha256Hex: sha256Hex(text),
      structured: { brandMentioned: text ? mentioned : null, ...(collector === "oia-direct" ? { mentions: { judgeName: "jev" } } : { fromElmo: true }) },
      citations: Array.from({ length: citations }, (_, i) => ({ url: `https://s${i}.example/` })), costUsd: 0,
    };
  };
  const body = (m: boolean) => (m ? "Demo Subject is good. " : "Many tools exist. ").padEnd(length, "x");
  const out = UNBRANDED.slice(0, answered).map((p, i) => mk(p, body(i < mentions), i < mentions));
  for (let i = 0; i < empty; i++) out.push(mk(UNBRANDED[answered + i] ?? UNBRANDED[0]!, "", null));
  if (branded) out.push(mk("en-02", body(true), true));
  return out;
}

/** J0 : mentions par jour [1, 2, 1, 2, 1] sur 4, 3 citations, 1 000 caractères, deux moteurs, par Elmo. */
const j0Days: Day[] = [{ mentions: 1, length: 900 }, { mentions: 2, length: 1100 }, { mentions: 1 }, { mentions: 2, citations: 4 }, { mentions: 1, citations: 2 }];
function j0(): ParityReference {
  const evidence = ["chatgpt", "claude"].flatMap((e) => j0Days.flatMap((d, i) => rows("j0", "elmo", e, i + 1, d)));
  return { kind: "evidence", windowId: "j0", evidence, span: REF };
}
/** Mesure croisée : même jour, Elmo et OIA ; `oia` remplace les jours d'OIA du moteur donné. */
function parity(oia: Partial<Record<string, (Day | null)[]>> = {}): EvidenceRow[] {
  const normal: Day[] = [{ mentions: 1 }, { mentions: 2 }];
  return ["chatgpt", "claude"].flatMap((e) => [
    ...normal.flatMap((d, i) => rows("p1", "elmo-0.7.7", e, i + 1, d)),
    ...(oia[e] ?? normal).flatMap((d, i) => (d ? rows("p1", "oia-direct", e, i + 1, d) : [])),
  ]);
}

describe("bloc E1 : mesure croisée Elmo / OIA", () => {
  it("parité : tous les critères d'OIA dans les intervalles de J0 et près d'Elmo le même jour", () => {
    const p = parityCheck(bundle(), "p1", parity(), j0());
    expect(p.perEngine.map((e) => [e.engine, e.verdict])).toEqual([["chatgpt", "parité"], ["claude", "parité"]]);
    const e = p.perEngine[0]!;
    expect(e.counts.oia).toMatchObject({ expected: 10, received: 10, unmeasured: 0, judges: ["jev"] });
    const cov = e.criteria.find((c) => c.criterion === "couverture")!;
    expect(cov.reference).toMatchObject({ min: 100, max: 100 });
    expect(cov.oia.daily).toEqual([{ day: 1, value: 100 }, { day: 2, value: 100 }]);
    const m = e.criteria.find((c) => c.criterion === "mention-non-marquees")!;
    expect(m.reference).toMatchObject({ min: 25, max: 50 });
    expect(m.oia.window!.mean).toBe(37.5);
    const len = e.criteria.find((c) => c.criterion === "longueur")!;
    expect(len.reference).toMatchObject({ min: 900, max: 1100 });
    expect(e.criteria.every((c) => c.status === "dans l'intervalle")).toBe(true);
    expect(p.judge).toContain("OIA : jev");
    const md = renderParityMarkdown(bundle(), p);
    expect(md).toContain("| chatgpt | **parité** | — |");
    expect(md).toContain("à valider par Mickaël");
  });

  it("écart de couverture : une question sans réponse un jour suffit, le critère est nommé", () => {
    const p = parityCheck(bundle(), "p1", parity({ claude: [{ mentions: 1 }, { mentions: 2, answered: 3 }] }), j0());
    const e = p.perEngine.find((x) => x.engine === "claude")!;
    expect(e.verdict).toBe("écart");
    expect(e.failing.map((f) => `${f.criterion}/${f.check}`)).toContain("couverture/jours");
    expect(e.failing.find((f) => f.check === "jours")!.detail).toContain("jour 2 : 80 hors de [100 – 100]");
    expect(p.perEngine.find((x) => x.engine === "chatgpt")!.verdict).toBe("parité");
  });

  it("une couverture plus haute que celle de J0 n'est pas un écart (contrôle à sens unique)", () => {
    const ref = j0();
    // J0 de claude à 80 % un jour : OIA à 100 % reste en parité.
    const evidence = (ref as { evidence: EvidenceRow[] }).evidence.filter((r) => !(r.engine === "claude" && r.promptId === "en-05" && r.receivedAt.startsWith("2026-11-03")));
    const p = parityCheck(bundle(), "p1", parity(), { ...ref, evidence } as ParityReference);
    const cov = p.perEngine.find((x) => x.engine === "claude")!.criteria.find((c) => c.criterion === "couverture")!;
    expect(cov.reference).toMatchObject({ min: 80, max: 100 });
    expect(cov.status).toBe("dans l'intervalle");
  });

  it("écart de taux : OIA mentionne la marque bien plus souvent que J0 et qu'Elmo le même jour", () => {
    const p = parityCheck(bundle(), "p1", parity({ chatgpt: [{ mentions: 4 }, { mentions: 4 }] }), j0());
    const e = p.perEngine.find((x) => x.engine === "chatgpt")!;
    expect(e.verdict).toBe("écart");
    const checks = e.failing.filter((f) => f.criterion === "mention-non-marquees").map((f) => f.check).sort();
    expect(checks).toEqual(["elmo", "ic95", "jours"]);
    expect(e.failing.find((f) => f.check === "elmo")!.detail).toContain("jour 1 : OIA 100, Elmo 25");
    expect(renderParityMarkdown(bundle(), p)).toContain("| chatgpt | **écart** | Mention, questions non marquées |");
  });

  it("jour manquant d'OIA : couverture à 0 % ce jour-là, donc écart ; jour manquant d'Elmo : non concluant", () => {
    const p = parityCheck(bundle(), "p1", parity({ chatgpt: [{ mentions: 1 }, null] }), j0());
    const e = p.perEngine.find((x) => x.engine === "chatgpt")!;
    expect(e.verdict).toBe("écart");
    expect(e.criteria.find((c) => c.criterion === "couverture")!.oia.daily[1]).toEqual({ day: 2, value: 0 });
    expect(e.criteria.find((c) => c.criterion === "longueur")!.oia.daily[1]).toEqual({ day: 2, value: null });

    // Elmo sans le jour 2 pour claude, OIA complet : rien à comparer le même jour.
    const ev = parity().filter((r) => !(r.engine === "claude" && r.collectorName !== "oia-direct" && r.receivedAt.startsWith("2026-12-02")));
    const c = parityCheck(bundle(), "p1", ev, j0()).perEngine.find((x) => x.engine === "claude")!;
    expect(c.verdict).toBe("non concluant");
    expect(c.missing.some((m) => m.includes("(elmo)") && m.includes("2"))).toBe(true);
  });

  it("réponses non mesurées : hors du dénominateur des taux, comptées à part, et manque de couverture", () => {
    // Jour 2 : 3 réponses mesurées (2 mentions) + 1 sans texte.
    const p = parityCheck(bundle(), "p1", parity({ claude: [{ mentions: 1 }, { answered: 3, mentions: 1, empty: 1 }] }), j0());
    const e = p.perEngine.find((x) => x.engine === "claude")!;
    expect(e.counts.oia.unmeasured).toBe(1);
    const m = e.criteria.find((c) => c.criterion === "mention-non-marquees")!;
    expect(m.oia.daily[1]).toEqual({ day: 2, value: 33.3 });
    expect(e.criteria.find((c) => c.criterion === "couverture")!.oia.daily[1]).toEqual({ day: 2, value: 80 });
    expect(e.verdict).toBe("écart");
    expect(e.failing.every((f) => f.criterion === "couverture")).toBe(true);
  });

  it("mode « texte » : même correspondance sur le texte pour tous, sans les jugements", () => {
    const ev = parity().map((r) => ({ ...r, structured: { ...r.structured, brandMentioned: null } }));
    const judged = parityCheck(bundle(), "p1", ev, j0()).perEngine[0]!;
    expect(judged.criteria.find((c) => c.criterion === "mention-non-marquees")!.oia.daily[0]!.value).toBeNull();
    const text = parityCheck(bundle(), "p1", ev, j0(), { mention: "texte" });
    expect(text.perEngine.map((e) => e.verdict)).toEqual(["parité", "parité"]);
    expect(text.judge).toContain("correspondance déterministe");
  });

  it("référence en figures.json : seuls les taux de mention se comparent, verdict non concluant", () => {
    const figures = {
      windowId: "j0",
      perEngine: ["chatgpt", "claude"].map((engine) => ({
        engine,
        unbranded: { daily: [25, 50, 25, 50, 25].map((pct, i) => ({ day: i + 1, pct })) },
        branded: { daily: [1, 2, 3, 4, 5].map((day) => ({ day, pct: 100 })) },
      })),
    } as unknown as ReportFigures;
    const p = parityCheck(bundle(), "p1", parity(), { kind: "figures", figures });
    const e = p.perEngine[0]!;
    expect(e.verdict).toBe("non concluant");
    expect(e.criteria.find((c) => c.criterion === "mention-non-marquees")!.status).toBe("dans l'intervalle");
    expect(e.criteria.find((c) => c.criterion === "citations")!.status).toBe("non comparable");
  });

  it("ignore les autres collecteurs et les moteurs hors cibles ; refuse une référence qui n'est pas comparesWith", () => {
    const extra = [...rows("p1", "autre", "chatgpt", 1, {}), ...rows("p1", "elmo", "mistral", 1, {})];
    const p = parityCheck(bundle(), "p1", [...parity(), ...extra], j0());
    expect(p.ignored).toEqual({ collectors: [{ name: "autre", n: 5 }], engines: [{ engine: "mistral", n: 5 }] });
    expect(p.perEngine.map((e) => e.verdict)).toEqual(["parité", "parité"]);
    expect(() => parityCheck(bundle(), "p1", parity(), { ...j0(), windowId: "p1" } as ParityReference)).toThrow(/comparesWith/);
  });

  it("écrit parite-<fenêtre>.md et .json, et le calcul est reproductible", () => {
    const ev = parity({ chatgpt: [{ mentions: 4 }, { mentions: 4 }] });
    const ref = j0();
    const p = parityCheck(bundle(), "p1", ev, ref);
    expect(parityCheck(bundle(), "p1", ev, ref)).toEqual(p);
    const out = mkdtempSync(join(tmpdir(), "oia-parite-"));
    const md = writeParity(out, bundle(), p);
    expect(md).toBe(join(out, "parite-p1.md"));
    expect(existsSync(join(out, "parite-p1.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(out, "parite-p1.json"), "utf8")).perEngine[0].verdict).toBe("écart");
  });
});
