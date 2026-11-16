/**
 * Rapport comparé (bloc C du mandat v13) : une fenêtre de suivi (j1, j2…)
 * comparée à sa référence (`comparesWith` dans measurement.yaml), à partir des
 * tables des preuves des deux fenêtres uniquement : aucun chiffre saisi à la
 * main, aucun appel à un fournisseur d'IA.
 *
 * Unité statistique : le jour, par moteur. Le taux d'une fenêtre est la
 * moyenne des taux de ses jours ; son intervalle à 95 % vient d'un
 * rééchantillonnage des jours (graine fixée : résultat reproductible). Une
 * évolution n'est déclarée que si les deux intervalles ne se chevauchent pas.
 *
 * Mêmes définitions que src/j0-report.ts : réponse mesurée = texte non vide ;
 * jugée = mesurée et jugée par Jev ; questions exclues par identifiant Elmo.
 *
 * CLI :
 *   tsx src/window-compare.ts <subjectId> <windowId> <refEvidence.jsonl> <curEvidence.jsonl> <refFailed.json> <curFailed.json> <outDir> [redirects.json]
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { EvidenceRow } from "./elmo-import.js";
import { readEvidence } from "./evidence-store.js";
import type { EvidenceStructured } from "./j0-evidence.js";
import { classifyCitation, mentions, profileUrls } from "./j0-reanalysis.js";
import { LIMITS, markdownToHtml } from "./j0-report.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { loadRecommendations, type Recommendation } from "./recommendation.js";
import { applyRedirects, readCache, type RedirectCache } from "./redirects.js";
import type { SubjectBundle } from "./schema.js";

export interface WindowRate { mean: number; ci95: [number, number]; days: number; dailyRates: { day: number; rate: number }[] }
export type Verdict = "hausse" | "baisse" | "pas de changement démontrable" | "non comparable";
export interface EngineComparison {
  engine: string;
  reference: WindowRate | null;
  current: WindowRate | null;
  verdict: Verdict;
  fragile: boolean;
  fragileReason?: string;
  versions: { reference: string[]; current: string[] };
  unmeasured: { reference: number; current: number };
}
export interface FamilyComparison { perEngine: EngineComparison[]; total: EngineComparison }
export interface Comparison {
  comparisonFormat: 1;
  subjectId: string;
  windowId: string;
  referenceId: string;
  provenance: { reference: { evidenceCount: number; digest: string }; current: { evidenceCount: number; digest: string } };
  panel: { reference: number; current: number; note?: string };
  bootstrap: { seed: number; resamples: number };
  unbranded: FamilyComparison;
  branded: FamilyComparison;
  competitors: {
    list: string[];
    reference: { name: string; answers: number; sharePct: number }[];
    current: { name: string; answers: number; sharePct: number }[];
    /** Part de voix de la marque (en %), comptée sur les textes comme celle des concurrents. */
    brand: { reference: number; current: number };
  };
  sources: { brandSite: { reference: number; current: number }; brandProfiles: { reference: number; current: number }; topDomains: { domain: string; reference: number; current: number }[] };
  executedRecommendations: { id: string; title: string; executedAt: string; proof: string }[];
}

/** Bornes d'une fenêtre, lues dans le fichier de clôture (failed.json). */
export interface WindowSpan { startedAt: string; days: number }
export interface CompetitorTerm { name: string; aliases?: string[] }

export const BOOTSTRAP_SEED = 20261116;
export const BOOTSTRAP_RESAMPLES = 2000;
/** Jours avec au moins une réponse jugée, en dessous desquels une fenêtre n'est pas comparable. */
export const MIN_DAYS = 2;

const DAY_MS = 86_400_000;
const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((1000 * n) / d) / 10);
const r1 = (x: number) => Math.round(x * 10) / 10;
const prov = (rows: EvidenceRow[]) => ({
  evidenceCount: rows.length,
  digest: createHash("sha256").update(rows.map((r) => r.id).sort().join("\n")).digest("hex"),
});
const st = (r: EvidenceRow) => r.structured as unknown as EvidenceStructured;
const measured = (r: EvidenceRow) => r.rawText.trim() !== "";
const judged = (r: EvidenceRow) => measured(r) && st(r).brandMentioned !== null;

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Taux d'une fenêtre à partir des taux de ses jours : moyenne, et intervalle
 * percentile à 95 % des moyennes de `resamples` tirages des jours avec remise.
 * Le générateur repart de la graine à chaque appel : le résultat ne dépend pas
 * de l'ordre des calculs.
 */
export function windowRate(dailyRates: { day: number; rate: number }[], seed = BOOTSTRAP_SEED, resamples = BOOTSTRAP_RESAMPLES): WindowRate | null {
  const n = dailyRates.length;
  if (!n) return null;
  const xs = dailyRates.map((d) => d.rate);
  const mean = xs.reduce((s, x) => s + x, 0) / n;
  const rand = mulberry32(seed);
  const means: number[] = [];
  for (let k = 0; k < resamples; k++) {
    let s = 0;
    for (let i = 0; i < n; i++) s += xs[Math.floor(rand() * n)]!;
    means.push(s / n);
  }
  means.sort((a, z) => a - z);
  const lo = means[Math.floor(0.025 * (resamples - 1))]!;
  const hi = means[Math.ceil(0.975 * (resamples - 1))]!;
  return { mean: r1(mean), ci95: [r1(lo), r1(hi)], days: n, dailyRates };
}

/** Évolution déclarée seulement si les deux intervalles sont disjoints. */
export function verdictOf(ref: WindowRate | null, cur: WindowRate | null): Verdict {
  if (!ref || !cur || ref.days < MIN_DAYS || cur.days < MIN_DAYS) return "non comparable";
  if (cur.ci95[0] > ref.ci95[1]) return "hausse";
  if (cur.ci95[1] < ref.ci95[0]) return "baisse";
  return "pas de changement démontrable";
}

export interface CompareOptions {
  redirects?: RedirectCache;
  /** Recommandations du sujet (loadRecommendations) : seules les exécutées entre les deux fenêtres sont retenues. */
  recommendations?: Recommendation[];
  /** Concurrents recomptés dans les deux fenêtres ; par défaut, ceux du sujet non rejetés (liste la plus récente). */
  competitors?: CompetitorTerm[];
  seed?: number;
  resamples?: number;
}

export function compareWindows(
  b: SubjectBundle,
  windowId: string,
  evidence: { reference: EvidenceRow[]; current: EvidenceRow[] },
  spans: { reference: WindowSpan; current: WindowSpan },
  opts: CompareOptions = {},
): Comparison {
  const { redirects = {}, recommendations = [], seed = BOOTSTRAP_SEED, resamples = BOOTSTRAP_RESAMPLES } = opts;
  const s = b.subject;
  const cur = b.measurement.windows.find((w) => w.id === windowId);
  if (!cur) throw new Error(`fenêtre ${windowId} absente de measurement.yaml`);
  if (!cur.comparesWith) throw new Error(`fenêtre ${windowId} sans référence (comparesWith)`);
  const ref = b.measurement.windows.find((w) => w.id === cur.comparesWith);
  if (!ref) throw new Error(`fenêtre ${windowId} : référence ${cur.comparesWith} absente de measurement.yaml`);
  if (ref.panelVersion !== cur.panelVersion && !cur.comparisonNote) {
    throw new Error(`comparaison refusée : panel v${cur.panelVersion} (${cur.id}) ≠ v${ref.panelVersion} (${ref.id}) sans comparisonNote`);
  }

  const familyOf = (r: EvidenceRow) => {
    const p = b.panel.prompts.find((x) => x.id === r.promptId && x.version === r.promptVersion);
    if (!p) throw new Error(`preuve ${r.id} : question ${r.promptId}@v${r.promptVersion} absente du panel`);
    return p.family;
  };
  const rowsOf = (w: typeof cur, ev: EvidenceRow[]) => {
    const excluded = w.excludedPromptIds ?? [];
    return ev.filter((e) => e.windowId === w.id && e.subjectId === s.id && !excluded.includes(st(e).elmoPromptId ?? ""));
  };
  const R = rowsOf(ref, evidence.reference);
  const C = rowsOf(cur, evidence.current);
  const dayIn = (span: WindowSpan) => {
    const start = Date.parse(span.startedAt);
    return (r: EvidenceRow) => Math.floor((Date.parse(r.receivedAt) - start) / DAY_MS) + 1;
  };
  const dayR = dayIn(spans.reference);
  const dayC = dayIn(spans.current);

  // Taux de chaque jour = mentions / jugées ; un jour sans réponse jugée manque (pas un 0).
  const rate = (rs: EvidenceRow[], dayOf: (r: EvidenceRow) => number) => {
    const byDay = new Map<number, { j: number; m: number }>();
    for (const r of rs.filter(judged)) {
      const d = byDay.get(dayOf(r)) ?? { j: 0, m: 0 };
      d.j++;
      if (st(r).brandMentioned === true) d.m++;
      byDay.set(dayOf(r), d);
    }
    const daily = [...byDay.entries()].sort((a, z) => a[0] - z[0]).map(([day, d]) => ({ day, rate: pct(d.m, d.j) }));
    return windowRate(daily, seed, resamples);
  };
  const versionsOf = (rs: EvidenceRow[]) => [...new Set(rs.map((r) => r.engineVersion ?? ""))].sort();
  const engines = [...new Set([...R, ...C].map((r) => r.engine))].sort();
  const versions = new Map(engines.map((e) => [e, { reference: versionsOf(R.filter((r) => r.engine === e)), current: versionsOf(C.filter((r) => r.engine === e)) }]));
  const changed = (v: { reference: string[]; current: string[] }) =>
    v.reference.length > 0 && v.current.length > 0 && v.reference.join("\n") !== v.current.join("\n");

  const family = (fam: "unbranded" | "branded"): FamilyComparison => {
    const fR = R.filter((r) => familyOf(r) === fam);
    const fC = C.filter((r) => familyOf(r) === fam);
    const compare = (engine: string, rR: EvidenceRow[], rC: EvidenceRow[], v: { reference: string[]; current: string[] }, fragileReason?: string): EngineComparison => {
      const reference = rate(rR, dayR);
      const current = rate(rC, dayC);
      return {
        engine,
        reference,
        current,
        verdict: verdictOf(reference, current),
        fragile: fragileReason !== undefined,
        ...(fragileReason ? { fragileReason } : {}),
        versions: v,
        unmeasured: { reference: rR.filter((r) => !measured(r)).length, current: rC.filter((r) => !measured(r)).length },
      };
    };
    const perEngine = engines.map((e) => {
      const v = versions.get(e)!;
      const reason = changed(v) ? `version de modèle servie changée : ${v.reference.join(", ")} → ${v.current.join(", ")}` : undefined;
      return compare(e, fR.filter((r) => r.engine === e), fC.filter((r) => r.engine === e), v, reason);
    });
    const fragileEngines = perEngine.filter((e) => e.fragile).map((e) => e.engine);
    const total = compare(
      "total",
      fR,
      fC,
      { reference: versionsOf(fR), current: versionsOf(fC) },
      fragileEngines.length ? `version de modèle changée pour : ${fragileEngines.join(", ")}` : undefined,
    );
    return { perEngine, total };
  };

  // Concurrents et part de voix : la même liste pour les deux fenêtres, recomptée sur les textes.
  const list: CompetitorTerm[] =
    opts.competitors ?? s.competitors.filter((c) => c.status !== "rejected").map((c) => ({ name: c.name, aliases: c.aliases }));
  const brandTerms = [s.displayName, ...s.aliases.filter((a) => a.status !== "rejected" && a.kind !== "domain").map((a) => a.value)];
  const voice = (rs: EvidenceRow[]) => {
    const texts = rs.filter((r) => measured(r) && familyOf(r) === "unbranded").map((r) => r.rawText);
    const count = (terms: string[]) => texts.filter((t) => mentions(t, terms).length > 0).length;
    const brand = count(brandTerms);
    const per = list.map((c) => ({ name: c.name, answers: count([c.name, ...(c.aliases ?? [])]) }));
    const all = brand + per.reduce((n, c) => n + c.answers, 0);
    return { brand: pct(brand, all), per: per.map((c) => ({ ...c, sharePct: pct(c.answers, all) })) };
  };
  const vR = voice(R);
  const vC = voice(C);

  const brandDomains = [s.urls.primary, ...s.urls.additional.filter((a) => a.status !== "rejected").map((a) => a.url)].map((u) =>
    new URL(u).hostname.replace(/^www\./, ""),
  );
  const competitorDomains = s.competitors.filter((c) => c.status !== "rejected").flatMap((c) => c.domains);
  const profiles = profileUrls(b);
  const sourcesOf = (rs: EvidenceRow[]) => {
    let site = 0;
    let prof = 0;
    const domains = new Map<string, number>();
    for (const r of rs) {
      for (const { url: raw } of r.citations) {
        const url = applyRedirects(raw, redirects);
        const c = classifyCitation(url, brandDomains, profiles, competitorDomains);
        if (c === "marque-site") site++;
        else if (c === "marque-profil") prof++;
        else {
          try {
            const h = new URL(url).hostname.replace(/^www\./, "");
            domains.set(h, (domains.get(h) ?? 0) + 1);
          } catch {
            // URL illisible : ignorée dans le classement des domaines.
          }
        }
      }
    }
    return { site, prof, domains };
  };
  const sR = sourcesOf(R);
  const sC = sourcesOf(C);
  const topDomains = [...new Set([...sR.domains.keys(), ...sC.domains.keys()])]
    .map((domain) => ({ domain, reference: sR.domains.get(domain) ?? 0, current: sC.domains.get(domain) ?? 0 }))
    .sort((a, z) => z.reference + z.current - (a.reference + a.current) || a.domain.localeCompare(z.domain))
    .slice(0, 10);

  // Exécutées après le dernier jour de la référence et avant la fin de la fenêtre courante, ou mesurées par elle.
  const endDate = (span: WindowSpan) => new Date(Date.parse(span.startedAt) + span.days * DAY_MS).toISOString().slice(0, 10);
  const refEnd = endDate(spans.reference);
  const curEnd = endDate(spans.current);
  const executedRecommendations = recommendations
    .filter((r) => r.subjectId === s.id && r.execution)
    .filter((r) => r.execution!.measuredBy === windowId || (r.execution!.executedAt >= refEnd && r.execution!.executedAt < curEnd))
    .map((r) => ({ id: r.id, title: r.title, executedAt: r.execution!.executedAt, proof: r.execution!.proof.ref }))
    .sort((a, z) => a.executedAt.localeCompare(z.executedAt) || a.id.localeCompare(z.id));

  return {
    comparisonFormat: 1,
    subjectId: s.id,
    windowId,
    referenceId: ref.id,
    provenance: { reference: prov(R), current: prov(C) },
    panel: { reference: ref.panelVersion, current: cur.panelVersion, ...(cur.comparisonNote ? { note: cur.comparisonNote } : {}) },
    bootstrap: { seed, resamples },
    unbranded: family("unbranded"),
    branded: family("branded"),
    competitors: { list: list.map((c) => c.name), reference: vR.per, current: vC.per, brand: { reference: vR.brand, current: vC.brand } },
    sources: { brandSite: { reference: sR.site, current: sC.site }, brandProfiles: { reference: sR.prof, current: sC.prof }, topDomains },
    executedRecommendations,
  };
}

export function renderComparisonMarkdown(b: SubjectBundle, c: Comparison): string {
  const L: string[] = [];
  const W = c.windowId.toUpperCase();
  const RF = c.referenceId.toUpperCase();
  L.push(`# Comparaison ${W} / ${RF} · ${b.subject.displayName}`, "");
  L.push("**Statut : à valider par Mickaël.**", "");
  L.push("## Règle de lecture", "");
  L.push(
    `Unité : le jour, par assistant. Taux d'un jour = réponses qui mentionnent la marque / réponses mesurées et jugées par Jev ; un jour sans réponse jugée manque (il ne compte pas pour 0). Taux d'une fenêtre = moyenne de ses jours ; intervalle à 95 % par rééchantillonnage des jours (${c.bootstrap.resamples} tirages, graine ${c.bootstrap.seed}, résultat reproductible).`,
  );
  L.push(`Une hausse ou une baisse n'est écrite que si les deux intervalles ne se chevauchent pas ; sinon : « pas de changement démontrable ». Moins de ${MIN_DAYS} jours mesurés : « non comparable ».`);
  L.push("Réponse « non mesurée » : réponse sans texte extrait ; retirée du dénominateur dans les deux fenêtres.", "");
  L.push("## Panel", "");
  L.push(c.panel.reference === c.panel.current ? `Même panel dans les deux fenêtres (v${c.panel.current}).` : `Panel v${c.panel.reference} (${RF}) → v${c.panel.current} (${W}).`);
  if (c.panel.note) L.push(`Note de comparaison : ${c.panel.note}`);
  L.push("");
  const rateCell = (w: WindowRate | null) => (w ? `${w.mean} % [${w.ci95[0]} – ${w.ci95[1]}] (${w.days} j)` : "aucun jour mesuré");
  const table = (title: string, intro: string, f: FamilyComparison) => {
    L.push(title, "", intro, "");
    L.push(`| Assistant | ${RF} | ${W} | Lecture | Versions servies | Non mesurées (${RF} / ${W}) |`, "|---|---|---|---|---|---|");
    for (const e of [...f.perEngine, f.total]) {
      const name = e.engine === "total" ? "**Tous assistants**" : e.engine;
      const reading = `${e.verdict}${e.fragile ? " (fragile)" : ""}`;
      const v = e.engine === "total" ? "" : `${e.versions.reference.join(", ") || "—"} → ${e.versions.current.join(", ") || "—"}`;
      L.push(`| ${name} | ${rateCell(e.reference)} | ${rateCell(e.current)} | ${reading} | ${v} | ${e.unmeasured.reference} / ${e.unmeasured.current} |`);
    }
    L.push("");
    const fragile = [...f.perEngine, f.total].filter((e) => e.fragile);
    for (const e of fragile) L.push(`- ${e.engine === "total" ? "Tous assistants" : e.engine} : comparaison fragile, ${e.fragileReason}.`);
    if (fragile.length) L.push("");
  };
  table(
    "## Visibilité : questions non marquées",
    "Seules les questions qui ne nomment pas la marque disent sa visibilité.",
    c.unbranded,
  );
  table(
    "## Questions marquées, à part",
    "La question nomme la marque : une mention y est attendue et ne mesure pas la visibilité.",
    c.branded,
  );
  L.push("## Concurrents et part de voix", "");
  L.push(
    `Les deux fenêtres sont recomptées sur le texte des réponses mesurées aux questions non marquées, avec la même liste (celle de ${W}) ; les étiquettes d'Elmo ne servent pas. Part de voix = réponses qui citent l'acteur / total des citations de la marque et des concurrents.`,
    "",
  );
  L.push(`| Acteur | ${RF} : réponses | ${RF} : part | ${W} : réponses | ${W} : part |`, "|---|---|---|---|---|");
  L.push(`| **${b.subject.displayName}** | | ${c.competitors.brand.reference} % | | ${c.competitors.brand.current} % |`);
  for (const name of c.competitors.list) {
    const r = c.competitors.reference.find((x) => x.name === name)!;
    const k = c.competitors.current.find((x) => x.name === name)!;
    L.push(`| ${name} | ${r.answers} | ${r.sharePct} % | ${k.answers} | ${k.sharePct} % |`);
  }
  L.push("", "## Sources citées", "");
  L.push(`Site de la marque : ${c.sources.brandSite.reference} → ${c.sources.brandSite.current} citation(s). Profils officiels : ${c.sources.brandProfiles.reference} → ${c.sources.brandProfiles.current}.`, "");
  if (c.sources.topDomains.length) {
    L.push(`| Domaine | ${RF} | ${W} |`, "|---|---|---|");
    for (const d of c.sources.topDomains) L.push(`| ${d.domain} | ${d.reference} | ${d.current} |`);
    L.push("");
  }
  L.push(`## Recommandations exécutées entre ${RF} et ${W}`, "");
  L.push("Listées comme contexte : aucune causalité n'est établie entre ces actions et les évolutions mesurées.", "");
  for (const r of c.executedRecommendations) L.push(`- ${r.executedAt} · ${r.title} (\`${r.id}\`) · preuve : ${r.proof}`);
  if (!c.executedRecommendations.length) L.push("- aucune");
  L.push("", "## Limites de la mesure", "");
  for (const l of LIMITS) L.push(`- ${l}`);
  L.push("", "## Provenance", "");
  const p = c.provenance;
  L.push(`${RF} : ${p.reference.evidenceCount} réponses, empreinte ${p.reference.digest.slice(0, 16)}…. ${W} : ${p.current.evidenceCount} réponses, empreinte ${p.current.digest.slice(0, 16)}….`, "");
  return `${L.join("\n")}\n`;
}

/** Écrit comparaison-<fenêtre>-<référence>.{md,html,json} dans outDir ; renvoie le chemin du .md. */
export function writeComparison(outDir: string, b: SubjectBundle, c: Comparison): string {
  mkdirSync(outDir, { recursive: true });
  const base = join(outDir, `comparaison-${c.windowId}-${c.referenceId}`);
  const md = renderComparisonMarkdown(b, c);
  writeFileSync(`${base}.json`, `${JSON.stringify(c, null, 2)}\n`);
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.html`, markdownToHtml(md, `Comparaison ${c.windowId} / ${c.referenceId} · ${b.subject.displayName}`));
  return `${base}.md`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, windowId, refEvidenceFile, curEvidenceFile, refFailedFile, curFailedFile, outDir, redirectsFile] = process.argv.slice(2);
  try {
    if (!subjectId || !windowId || !refEvidenceFile || !curEvidenceFile || !refFailedFile || !curFailedFile || !outDir) {
      throw new Error("usage: tsx src/window-compare.ts <subjectId> <windowId> <refEvidence.jsonl> <curEvidence.jsonl> <refFailed.json> <curFailed.json> <outDir> [redirects.json]");
    }
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const span = (file: string): WindowSpan => {
      if (!existsSync(file)) throw new Error(`fichier de fenêtre ${file} absent : lancer d'abord la clôture de la fenêtre`);
      const f = JSON.parse(readFileSync(file, "utf8")) as WindowSpan;
      return { startedAt: f.startedAt, days: f.days };
    };
    const reference = readEvidence(refEvidenceFile);
    const current = readEvidence(curEvidenceFile);
    if (!reference.length) throw new Error(`aucune preuve dans ${refEvidenceFile}`);
    if (!current.length) throw new Error(`aucune preuve dans ${curEvidenceFile}`);
    const c = compareWindows(b, windowId, { reference, current }, { reference: span(refFailedFile), current: span(curFailedFile) }, {
      redirects: redirectsFile ? readCache(redirectsFile) : {},
      recommendations: loadRecommendations(dir),
    });
    process.stdout.write(`${writeComparison(outDir, b, c)}\n`);
  } catch (err) {
    process.stderr.write(`window-compare : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
