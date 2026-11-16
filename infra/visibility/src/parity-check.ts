/**
 * Mesure croisée (mandat v14, bloc E, option E1) : les mêmes questions posées le
 * même jour par Elmo (collectorName « elmo » ou « elmo-0.7.7 ») et par le
 * collecteur OIA (« oia-direct »), dans la même table des preuves de la fenêtre.
 * Aucun appel à un fournisseur d'IA, aucun chiffre saisi à la main.
 *
 * Critères de l'ADR 0001, par moteur et par collecteur, jour par jour :
 *  - couverture : questions avec une réponse mesurée / questions attendues (plan
 *    du jour de src/collect-day.ts) ; un jour sans réponse compte pour 0 % ;
 *  - citations par réponse mesurée (moyenne) ;
 *  - longueur médiane du texte (caractères) ;
 *  - taux de mention de la marque, questions non marquées, et à part marquées.
 *
 * Mêmes règles que J0 : réponse mesurée = texte non vide (les autres sont hors
 * dénominateur, comptées à part) ; questions exclues par identifiant Elmo.
 * Mention, deux modes :
 *  - « jugement » (défaut) : `structured.brandMentioned`, comme le rapport J0 (jugée =
 *    mesurée et jugée ; Jev dans Elmo, et le juge de collect-day pour OIA, src/judge.ts) ;
 *    le juge de chaque collecteur est relevé, et des juges différents sont signalés ;
 *  - « texte » : correspondance déterministe du nom et des alias sur le texte, la même
 *    pour la référence, Elmo et OIA (indépendante des juges).
 *
 * Pour chaque critère, trois contrôles (unité : le jour, comme src/window-compare.ts) :
 *  1. chaque jour d'OIA dans l'intervalle min – max des jours de J0 du moteur ;
 *  2. IC 95 % d'OIA (rééchantillonnage des jours, graine fixée) non disjoint de celui de J0 ;
 *  3. même jour : écart OIA − Elmo au plus égal à l'étendue (max − min) de J0.
 * Couverture : contrôles à sens unique (seul un manque est un écart).
 * Verdict par moteur : « parité » si tous les contrôles passent, « écart » dès
 * qu'un contrôle échoue (critère fautif nommé), « non concluant » s'il manque des
 * données sans écart constaté (jour d'Elmo absent, moins de 2 jours…).
 *
 * Référence : les preuves de J0 (tous les critères) ou, à défaut, son figures.json
 * (taux de mention par jour seulement, jugés par Jev, mode « jugement » : les
 * autres critères sont « non comparables » et le verdict au mieux « non concluant »).
 *
 * CLI :
 *   tsx src/parity-check.ts <sujet> <fenêtre> <evidence.jsonl> <figures-référence.json | preuves-référence.jsonl> <outDir> [failed-référence.json] [--mention jugement|texte]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { planDay } from "./collect-day.js";
import { OIA_DIRECT_COLLECTOR } from "./collector-oia-direct.js";
import type { EvidenceRow } from "./elmo-import.js";
import { readEvidence } from "./evidence-store.js";
import type { EvidenceStructured } from "./j0-evidence.js";
import { mentions } from "./j0-reanalysis.js";
import type { ReportFigures } from "./j0-report.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";
import { BOOTSTRAP_RESAMPLES, BOOTSTRAP_SEED, MIN_DAYS, windowRate, type WindowRate, type WindowSpan } from "./window-compare.js";

export const ELMO_COLLECTORS = ["elmo", "elmo-0.7.7"];

export type CriterionId = "couverture" | "citations" | "longueur" | "mention-non-marquees" | "mention-marquees";
export const CRITERIA: { id: CriterionId; label: string; unit: string }[] = [
  { id: "couverture", label: "Couverture", unit: "%" },
  { id: "citations", label: "Citations par réponse", unit: "" },
  { id: "longueur", label: "Longueur médiane (caractères)", unit: "" },
  { id: "mention-non-marquees", label: "Mention, questions non marquées", unit: "%" },
  { id: "mention-marquees", label: "Mention, questions marquées (à part)", unit: "%" },
];

export type ParityReference =
  | { kind: "evidence"; windowId: string; evidence: EvidenceRow[]; span: WindowSpan }
  | { kind: "figures"; figures: ReportFigures };

export interface DailyValue { day: number; value: number | null }
export interface Series { daily: DailyValue[]; window: WindowRate | null }
export interface ReferenceInterval { daily: DailyValue[]; min: number; max: number; window: WindowRate | null }
/** ok = true : passe ; false : écart ; null : non comparable (donnée manquante). */
export interface CheckResult { ok: boolean | null; detail: string }
export interface CriterionResult {
  criterion: CriterionId;
  label: string;
  reference: ReferenceInterval | null;
  elmo: Series;
  oia: Series;
  checks: { jours: CheckResult; ic95: CheckResult; elmo: CheckResult };
  status: "dans l'intervalle" | "écart" | "non comparable";
}
export type ParityVerdict = "parité" | "écart" | "non concluant";
export interface CollectorCounts {
  expected: number;
  received: number;
  unmeasured: number;
  versions: string[];
  /** Juge des mentions relevé dans les preuves (mode « jugement »). */
  judges: string[];
}
export interface EngineParity {
  engine: string;
  verdict: ParityVerdict;
  /** Critères en écart, avec le contrôle fautif. */
  failing: { criterion: CriterionId; check: "jours" | "ic95" | "elmo"; detail: string }[];
  /** Ce qui manque pour conclure, quand le verdict est « non concluant ». */
  missing: string[];
  counts: { elmo: CollectorCounts; oia: CollectorCounts };
  criteria: CriterionResult[];
}
export interface ParityReport {
  parityFormat: 1;
  subjectId: string;
  windowId: string;
  referenceId: string;
  referenceKind: ParityReference["kind"];
  status: "à valider par Mickaël";
  mentionMode: MentionMode;
  judge: string;
  days: number;
  start: string;
  bootstrap: { seed: number; resamples: number };
  perEngine: EngineParity[];
  /** Preuves de la fenêtre hors du périmètre : autre collecteur, moteur hors des cibles. */
  ignored: { collectors: { name: string; n: number }[]; engines: { engine: string; n: number }[] };
  provenance: { reference: { evidenceCount: number; digest: string }; current: { evidenceCount: number; digest: string } };
}

const DAY_MS = 86_400_000;
const EPS = 1e-9;
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((1000 * n) / d) / 10);
const r1 = (x: number) => Math.round(x * 10) / 10;
const prov = (rows: EvidenceRow[]) => ({
  evidenceCount: rows.length,
  digest: createHash("sha256").update(rows.map((r) => r.id).sort().join("\n")).digest("hex"),
});
const st = (r: EvidenceRow) => r.structured as unknown as Partial<EvidenceStructured>;
const measured = (r: EvidenceRow) => r.rawText.trim() !== "";
const median = (xs: number[]) => {
  const s = [...xs].sort((a, z) => a - z);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export type MentionMode = "jugement" | "texte";
export interface ParityOptions { seed?: number; resamples?: number; mention?: MentionMode }

/** Juge d'une preuve : Jev pour Elmo, celui de collect-day pour OIA (structured.mentions.judgeName). */
export function judgeOf(r: EvidenceRow): string {
  if (ELMO_COLLECTORS.includes(r.collectorName)) return "jev (elmo)";
  const name = (r.structured as { mentions?: { judgeName?: unknown } }).mentions?.judgeName;
  return typeof name === "string" ? name : "inconnu";
}

export function parityCheck(b: SubjectBundle, windowId: string, evidence: EvidenceRow[], reference: ParityReference, opts: ParityOptions = {}): ParityReport {
  const { seed = BOOTSTRAP_SEED, resamples = BOOTSTRAP_RESAMPLES, mention = "jugement" } = opts;
  const s = b.subject;
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w) throw new Error(`fenêtre ${windowId} absente de measurement.yaml`);
  if (!w.comparesWith) throw new Error(`fenêtre ${windowId} sans référence (comparesWith)`);
  if (!w.start) throw new Error(`fenêtre ${windowId} : début (start) non fixé`);
  const referenceId = reference.kind === "evidence" ? reference.windowId : reference.figures.windowId;
  if (referenceId !== w.comparesWith) throw new Error(`référence ${referenceId} ≠ comparesWith de ${windowId} (${w.comparesWith})`);

  const familyOf = (r: EvidenceRow) => {
    const p = b.panel.prompts.find((x) => x.id === r.promptId && x.version === r.promptVersion);
    if (!p) throw new Error(`preuve ${r.id} : question ${r.promptId}@v${r.promptVersion} absente du panel`);
    return p.family;
  };
  const rowsOf = (wid: string, ev: EvidenceRow[]) => {
    const excluded = b.measurement.windows.find((x) => x.id === wid)?.excludedPromptIds ?? [];
    return ev.filter((e) => e.windowId === wid && e.subjectId === s.id && !excluded.includes(st(e).elmoPromptId ?? ""));
  };
  // Questions attendues par moteur et par jour : le plan du collecteur OIA (questions actives, langues du moteur).
  const expectedOf = (wid: string) => {
    const m = new Map<string, number>();
    for (const c of planDay(b, wid, w.start!).calls) m.set(c.engine, (m.get(c.engine) ?? 0) + 1);
    return m;
  };
  const brandTerms = [s.displayName, ...s.aliases.filter((a) => a.status !== "rejected" && a.kind !== "domain").map((a) => a.value)];
  // Mode « jugement » : règles de J0 (jugée = mesurée et brandMentioned non nul). Mode « texte » : toutes les mesurées.
  const judgedRow = (r: EvidenceRow) => mention === "texte" || typeof st(r).brandMentioned === "boolean";
  const mentioned = (r: EvidenceRow) => (mention === "texte" ? mentions(r.rawText, brandTerms).length > 0 : st(r).brandMentioned === true);
  const days = Array.from({ length: w.days }, (_, i) => i + 1);

  /** Valeurs d'un jour pour un moteur et un collecteur. */
  const metrics = (rs: EvidenceRow[], expected: number): Record<CriterionId, number | null> => {
    const m = rs.filter(measured);
    const fam = (f: "unbranded" | "branded") => m.filter((r) => familyOf(r) === f && judgedRow(r));
    const rate = (xs: EvidenceRow[]) => (xs.length ? pct(xs.filter(mentioned).length, xs.length) : null);
    return {
      couverture: expected ? pct(new Set(m.map((r) => `${r.promptId}@v${r.promptVersion}`)).size, expected) : null,
      citations: m.length ? Math.round((100 * m.reduce((n, r) => n + r.citations.length, 0)) / m.length) / 100 : null,
      longueur: m.length ? median(m.map((r) => r.rawText.trim().length)) : null,
      "mention-non-marquees": rate(fam("unbranded")),
      "mention-marquees": rate(fam("branded")),
    };
  };
  const series = (daily: DailyValue[]): Series => ({
    daily,
    window: windowRate(daily.filter((d) => d.value !== null).map((d) => ({ day: d.day, rate: d.value! })), seed, resamples),
  });
  const interval = (daily: DailyValue[]): ReferenceInterval | null => {
    const xs = daily.filter((d) => d.value !== null).map((d) => d.value!);
    if (!xs.length) return null;
    return { daily, min: Math.min(...xs), max: Math.max(...xs), window: series(daily).window };
  };

  // Fenêtre courante : jours UTC calendaires depuis start (comme collect-day.ts).
  const C = rowsOf(windowId, evidence);
  const start = Date.parse(`${w.start}T00:00:00Z`);
  const dayC = (r: EvidenceRow) => Math.floor((Date.parse(r.receivedAt) - start) / DAY_MS) + 1;
  const expectedC = expectedOf(windowId);
  const engines = [...expectedC.keys()].sort();
  const isElmo = (r: EvidenceRow) => ELMO_COLLECTORS.includes(r.collectorName);
  const isOia = (r: EvidenceRow) => r.collectorName === OIA_DIRECT_COLLECTOR;
  const inScope = C.filter((r) => (isElmo(r) || isOia(r)) && expectedC.has(r.engine) && days.includes(dayC(r)));
  const countBy = (rs: EvidenceRow[], key: (r: EvidenceRow) => string) =>
    [...rs.reduce((m, r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, z) => a[0].localeCompare(z[0]));
  const ignored = {
    collectors: countBy(C.filter((r) => !isElmo(r) && !isOia(r)), (r) => r.collectorName).map(([name, n]) => ({ name, n })),
    engines: countBy(C.filter((r) => (isElmo(r) || isOia(r)) && !expectedC.has(r.engine)), (r) => r.engine).map(([engine, n]) => ({ engine, n })),
  };

  // Référence : intervalles par moteur et par critère.
  const R = reference.kind === "evidence" ? rowsOf(reference.windowId, reference.evidence) : [];
  const expectedR = reference.kind === "evidence" ? expectedOf(reference.windowId) : new Map<string, number>();
  const refInterval = (engine: string, c: CriterionId): ReferenceInterval | null => {
    if (reference.kind === "figures") {
      const e = reference.figures.perEngine.find((x) => x.engine === engine);
      if (!e || mention === "texte" || (c !== "mention-non-marquees" && c !== "mention-marquees")) return null;
      const p = c === "mention-non-marquees" ? e.unbranded : e.branded;
      return interval(p.daily.map((d) => ({ day: d.day, value: d.pct })));
    }
    const span = reference.span;
    const t0 = Date.parse(span.startedAt);
    const dayR = (r: EvidenceRow) => Math.floor((Date.parse(r.receivedAt) - t0) / DAY_MS) + 1;
    const expected = expectedR.get(engine) ?? 0;
    const rs = R.filter((r) => r.engine === engine);
    if (!rs.length) return null;
    return interval(Array.from({ length: span.days }, (_, i) => ({ day: i + 1, value: metrics(rs.filter((r) => dayR(r) === i + 1), expected)[c] })));
  };
  const judgeNote = () => {
    if (mention === "texte") return "correspondance déterministe du nom et des alias sur le texte, identique pour la référence, Elmo et OIA";
    const oiaJudges = [...new Set(inScope.filter((r) => isOia(r) && measured(r)).map(judgeOf))].sort();
    const same = oiaJudges.length === 1 && oiaJudges[0] === "jev";
    return `jugement porté par chaque preuve (brandMentioned) : Jev dans Elmo et à ${referenceId} ; OIA : ${oiaJudges.join(", ") || "aucune preuve"}${same || !oiaJudges.length ? "" : " (juges différents : un écart de mention peut venir du juge, pas du collecteur ; relancer en mode « texte » pour trancher)"}`;
  };

  const perEngine = engines.map((engine): EngineParity => {
    const expected = expectedC.get(engine)!;
    const of = (pick: (r: EvidenceRow) => boolean) => inScope.filter((r) => r.engine === engine && pick(r));
    const E = of(isElmo);
    const O = of(isOia);
    const dailyOf = (rs: EvidenceRow[]) => days.map((day) => metrics(rs.filter((r) => dayC(r) === day), expected));
    const dE = dailyOf(E);
    const dO = dailyOf(O);
    const counts = (rs: EvidenceRow[]): CollectorCounts => ({
      expected: expected * w.days,
      received: rs.length,
      unmeasured: rs.filter((r) => !measured(r)).length,
      versions: [...new Set(rs.map((r) => r.engineVersion ?? ""))].sort(),
      judges: [...new Set(rs.filter(measured).map(judgeOf))].sort(),
    });

    const criteria = CRITERIA.map(({ id, label }): CriterionResult => {
      const lowerOnly = id === "couverture";
      const ref = refInterval(engine, id);
      const elmo = series(days.map((day, i) => ({ day, value: dE[i]![id] })));
      const oia = series(days.map((day, i) => ({ day, value: dO[i]![id] })));
      const fmt = (x: number) => `${r1(x)}`;

      // 1. Chaque jour d'OIA dans l'intervalle des jours de J0.
      let jours: CheckResult;
      if (!ref) jours = { ok: null, detail: `pas d'intervalle de ${referenceId} pour ce critère` };
      else {
        const out = oia.daily.filter((d) => d.value !== null && (d.value < ref.min - EPS || (!lowerOnly && d.value > ref.max + EPS)));
        const none = oia.daily.filter((d) => d.value === null).map((d) => d.day);
        const elmoOut = (day: number) => {
          const v = elmo.daily.find((x) => x.day === day)?.value;
          return v !== null && v !== undefined && (v < ref.min - EPS || (!lowerOnly && v > ref.max + EPS));
        };
        if (out.length) {
          jours = {
            ok: false,
            detail: out.map((d) => `jour ${d.day} : ${fmt(d.value!)} hors de [${fmt(ref.min)} – ${fmt(ref.max)}]${elmoOut(d.day) ? " (Elmo aussi hors de l'intervalle ce jour-là)" : ""}`).join(" ; "),
          };
        } else if (none.length) jours = { ok: null, detail: `aucune réponse mesurée d'OIA le(s) jour(s) ${none.join(", ")}` };
        else jours = { ok: true, detail: `tous les jours dans [${fmt(ref.min)} – ${fmt(ref.max)}]` };
      }

      // 2. Intervalles à 95 % non disjoints.
      let ic95: CheckResult;
      const rw = ref?.window ?? null;
      const ow = oia.window;
      if (!rw || !ow || rw.days < MIN_DAYS || ow.days < MIN_DAYS) {
        ic95 = { ok: null, detail: `moins de ${MIN_DAYS} jours mesurés (${referenceId} : ${rw?.days ?? 0}, OIA : ${ow?.days ?? 0})` };
      } else {
        const below = ow.ci95[1] < rw.ci95[0] - EPS;
        const above = !lowerOnly && ow.ci95[0] > rw.ci95[1] + EPS;
        const txt = `OIA ${ow.mean} [${ow.ci95[0]} – ${ow.ci95[1]}], ${referenceId} ${rw.mean} [${rw.ci95[0]} – ${rw.ci95[1]}]`;
        ic95 = { ok: !(below || above), detail: below || above ? `intervalles disjoints : ${txt}` : txt };
      }

      // 3. Même jour : écart OIA − Elmo dans l'étendue des jours de J0.
      let elmoCheck: CheckResult;
      if (!ref) elmoCheck = { ok: null, detail: `pas d'étendue de ${referenceId} pour borner l'écart` };
      else {
        const tol = ref.max - ref.min;
        const pairs = days.map((day, i) => ({ day, o: oia.daily[i]!.value, e: elmo.daily[i]!.value }));
        const bad = pairs.filter((p) => p.o !== null && p.e !== null && (lowerOnly ? p.e - p.o : Math.abs(p.o - p.e)) > tol + EPS);
        const lacking = pairs.filter((p) => p.o === null || p.e === null).map((p) => p.day);
        if (bad.length) {
          elmoCheck = { ok: false, detail: bad.map((p) => `jour ${p.day} : OIA ${fmt(p.o!)}, Elmo ${fmt(p.e!)}, écart ${fmt(Math.abs(p.o! - p.e!))} > étendue de ${referenceId} ${fmt(tol)}`).join(" ; ") };
        } else if (lacking.length) elmoCheck = { ok: null, detail: `jour(s) sans valeur d'Elmo ou d'OIA : ${lacking.join(", ")}` };
        else elmoCheck = { ok: true, detail: `écarts du même jour ≤ étendue de ${referenceId} (${fmt(tol)})` };
      }

      const checks = { jours, ic95, elmo: elmoCheck };
      const all = Object.values(checks);
      const status = all.some((c) => c.ok === false) ? "écart" : all.some((c) => c.ok === null) ? "non comparable" : "dans l'intervalle";
      return { criterion: id, label, reference: ref, elmo, oia, checks, status };
    });

    const failing = criteria.flatMap((c) =>
      (Object.entries(c.checks) as [keyof CriterionResult["checks"], CheckResult][]).filter(([, r]) => r.ok === false).map(([check, r]) => ({ criterion: c.criterion, check, detail: r.detail })),
    );
    const missing = criteria.flatMap((c) =>
      (Object.entries(c.checks) as [keyof CriterionResult["checks"], CheckResult][]).filter(([, r]) => r.ok === null).map(([check, r]) => `${c.label} (${check}) : ${r.detail}`),
    );
    const verdict: ParityVerdict = failing.length ? "écart" : missing.length ? "non concluant" : "parité";
    return { engine, verdict, failing, missing, counts: { elmo: counts(E), oia: counts(O) }, criteria };
  });

  return {
    parityFormat: 1,
    subjectId: s.id,
    windowId,
    referenceId,
    referenceKind: reference.kind,
    status: "à valider par Mickaël",
    mentionMode: mention,
    judge: judgeNote(),
    days: w.days,
    start: w.start,
    bootstrap: { seed, resamples },
    perEngine,
    ignored,
    provenance: { reference: prov(R), current: prov(inScope) },
  };
}

export const PARITY_LIMITS = [
  "Critères mesurés ici : couverture, citations, longueur médiane, taux de mention. Les autres critères de l'ADR 0001 (mêmes URL et passages, fiabilité < 1 % d'échec sur 5 jours, coût, maintenance) se vérifient à part.",
  "L'ADR demande une semaine de mesure croisée et 0 échec sur 30 appels consécutifs : une fenêtre plus courte donne une présomption de parité, pas la preuve complète de l'ADR.",
  "Avec peu de jours, l'intervalle à 95 % d'une fenêtre est presque l'intervalle de ses jours : le contrôle jour par jour reste le plus exigeant.",
  "Les modèles tirent au sort une partie de leurs sources : un écart isolé d'un jour peut relever du hasard ; « Elmo aussi hors de l'intervalle » signale un jour atypique plutôt qu'un collecteur fautif.",
];

export function renderParityMarkdown(b: SubjectBundle, p: ParityReport): string {
  const L: string[] = [];
  const RF = p.referenceId.toUpperCase();
  const fmt = (v: number | null, unit: string) => (v === null ? "—" : `${r1(v)}${unit ? ` ${unit}` : ""}`);
  const dayCells = (s: { daily: DailyValue[] }, unit: string) => s.daily.map((d) => fmt(d.value, unit)).join(" / ");
  const ci = (w: WindowRate | null) => (w ? `${w.mean} [${w.ci95[0]} – ${w.ci95[1]}]` : "—");
  const mark = (c: CheckResult) => (c.ok === true ? "ok" : c.ok === false ? "**écart**" : "n. c.");
  L.push(`# Mesure croisée ${p.windowId} · ${b.subject.displayName}`, "");
  L.push(`**Statut : ${p.status}.** Fenêtre de ${p.days} jours à partir du ${p.start} (jours UTC), comparée à ${RF} (${p.referenceKind === "evidence" ? "preuves" : "figures.json"}).`, "");
  L.push("## Règle de lecture", "");
  L.push(
    `Par moteur, chaque critère est calculé par jour pour Elmo et pour le collecteur OIA, sur les mêmes questions. Réponse mesurée = texte non vide ; les autres sont hors dénominateur. Couverture = questions avec une réponse mesurée / questions attendues ; un jour sans réponse compte pour 0 %.`,
  );
  L.push(`Mention (mode « ${p.mentionMode} ») : ${p.judge}.`);
  L.push(
    `Trois contrôles par critère : (1) chaque jour d'OIA dans l'intervalle min – max des jours de ${RF} ; (2) intervalles à 95 % d'OIA et de ${RF} non disjoints (rééchantillonnage des jours, ${p.bootstrap.resamples} tirages, graine ${p.bootstrap.seed}) ; (3) le même jour, écart OIA − Elmo au plus égal à l'étendue des jours de ${RF}. Couverture : seul un manque est un écart.`,
  );
  L.push("« Parité » : tous les contrôles passent. « Écart » : au moins un échoue (critère nommé). « Non concluant » : données manquantes, aucun écart constaté.", "");
  L.push("## Verdict par moteur", "");
  L.push("| Moteur | Verdict | Critère(s) fautif(s) | Réponses Elmo (non mesurées) | Réponses OIA (non mesurées) | Attendues par collecteur |", "|---|---|---|---|---|---|");
  const labelOf = (id: CriterionId) => CRITERIA.find((c) => c.id === id)!.label;
  for (const e of p.perEngine) {
    const f = [...new Set(e.failing.map((x) => labelOf(x.criterion)))].join(", ") || "—";
    L.push(`| ${e.engine} | **${e.verdict}** | ${f} | ${e.counts.elmo.received} (${e.counts.elmo.unmeasured}) | ${e.counts.oia.received} (${e.counts.oia.unmeasured}) | ${e.counts.oia.expected} |`);
  }
  L.push("");
  for (const e of p.perEngine) {
    L.push(`## ${e.engine}`, "");
    L.push(`Versions servies : Elmo ${e.counts.elmo.versions.join(", ") || "—"} ; OIA ${e.counts.oia.versions.join(", ") || "—"}.${p.mentionMode === "jugement" ? ` Juges : Elmo ${e.counts.elmo.judges.join(", ") || "—"} ; OIA ${e.counts.oia.judges.join(", ") || "—"}.` : ""}`, "");
    L.push(`| Critère | ${RF} min – max | ${RF} IC 95 % | Elmo (jours) | OIA (jours) | OIA IC 95 % | Jours | IC | Même jour | Statut |`, "|---|---|---|---|---|---|---|---|---|---|");
    for (const c of e.criteria) {
      const u = CRITERIA.find((x) => x.id === c.criterion)!.unit;
      const ref = c.reference ? `${fmt(c.reference.min, u)} – ${fmt(c.reference.max, u)}` : "—";
      L.push(`| ${c.label} | ${ref} | ${ci(c.reference?.window ?? null)} | ${dayCells(c.elmo, u)} | ${dayCells(c.oia, u)} | ${ci(c.oia.window)} | ${mark(c.checks.jours)} | ${mark(c.checks.ic95)} | ${mark(c.checks.elmo)} | ${c.status} |`);
    }
    L.push("");
    for (const f of e.failing) L.push(`- Écart, ${labelOf(f.criterion)} (${f.check}) : ${f.detail}.`);
    if (e.verdict === "non concluant") for (const m of e.missing) L.push(`- Manque : ${m}.`);
    if (e.failing.length || e.verdict === "non concluant") L.push("");
  }
  if (p.ignored.collectors.length || p.ignored.engines.length) {
    L.push("## Preuves hors périmètre", "");
    for (const c of p.ignored.collectors) L.push(`- collecteur « ${c.name} » : ${c.n} preuve(s), ignorées`);
    for (const e of p.ignored.engines) L.push(`- moteur ${e.engine}, hors des cibles de la fenêtre : ${e.n} preuve(s), ignorées`);
    L.push("");
  }
  L.push("## Limites", "");
  for (const l of PARITY_LIMITS) L.push(`- ${l}`);
  L.push("", "## Provenance", "");
  const pr = p.provenance;
  L.push(`${RF} : ${pr.reference.evidenceCount} réponses${pr.reference.evidenceCount ? `, empreinte ${pr.reference.digest.slice(0, 16)}…` : " (figures.json)"}. ${p.windowId} : ${pr.current.evidenceCount} réponses, empreinte ${pr.current.digest.slice(0, 16)}….`, "");
  return `${L.join("\n")}\n`;
}

/** Écrit parite-<fenêtre>.{md,json} dans outDir ; renvoie le chemin du .md. */
export function writeParity(outDir: string, b: SubjectBundle, p: ParityReport): string {
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `parite-${p.windowId}`);
  writeFileSync(`${base}.json`, `${JSON.stringify(p, null, 2)}\n`);
  writeFileSync(`${base}.md`, renderParityMarkdown(b, p));
  return `${base}.md`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const args = process.argv.slice(2);
  const iMention = args.indexOf("--mention");
  const mentionArg = iMention >= 0 ? args.splice(iMention, 2)[1] : "jugement";
  const [subjectId, windowId, evidenceFile, referenceFile, outDir, refFailedFile] = args;
  try {
    if (!subjectId || !windowId || !evidenceFile || !referenceFile || !outDir) {
      throw new Error("usage: tsx src/parity-check.ts <sujet> <fenêtre> <evidence.jsonl> <figures-référence.json | preuves-référence.jsonl> <outDir> [failed-référence.json] [--mention jugement|texte]");
    }
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (mentionArg !== "jugement" && mentionArg !== "texte") throw new Error(`--mention jugement|texte attendu (reçu : ${mentionArg ?? "rien"})`);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const evidence = readEvidence(evidenceFile);
    if (!evidence.length) throw new Error(`aucune preuve dans ${evidenceFile}`);
    if (!existsSync(referenceFile)) throw new Error(`${referenceFile} absent`);
    const w = b.measurement.windows.find((x) => x.id === windowId);
    const refId = w?.comparesWith;
    if (!refId) throw new Error(`fenêtre ${windowId} absente ou sans référence (comparesWith)`);
    let reference: ParityReference;
    if (referenceFile.endsWith(".jsonl")) {
      // Bornes de la référence : fichier de clôture si donné, sinon start + runTimeUtc de measurement.yaml.
      const rw = b.measurement.windows.find((x) => x.id === refId)!;
      let span: WindowSpan;
      if (refFailedFile) {
        const f = JSON.parse(readFileSync(refFailedFile, "utf8")) as WindowSpan;
        span = { startedAt: f.startedAt, days: f.days };
      } else {
        if (!rw.start) throw new Error(`référence ${refId} sans début (start) : donner son failed.json`);
        span = { startedAt: `${rw.start}T${rw.runTimeUtc ?? "00:00"}:00Z`, days: rw.days };
      }
      reference = { kind: "evidence", windowId: refId, evidence: readEvidence(referenceFile), span };
    } else {
      reference = { kind: "figures", figures: JSON.parse(readFileSync(referenceFile, "utf8")) as ReportFigures };
    }
    const p = parityCheck(b, windowId, evidence, reference, { mention: mentionArg });
    process.stdout.write(`${writeParity(outDir, b, p)}\n`);
    for (const e of p.perEngine) process.stdout.write(`${e.engine} : ${e.verdict}${e.failing.length ? ` (${[...new Set(e.failing.map((f) => f.criterion))].join(", ")})` : ""}\n`);
  } catch (err) {
    process.stderr.write(`parity-check : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
