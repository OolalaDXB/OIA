/**
 * Page client d'une fenêtre (bloc E du mandat v13) : une page HTML autonome,
 * générée depuis figures.json (et la comparaison avec la fenêtre de référence,
 * s'il y en a une). Aucun chiffre n'est saisi à la main, aucun nom de sujet
 * dans le gabarit : tout vient du sujet, des chiffres et des recommandations.
 *
 * Langue : `clientLanguage` du sujet, à défaut la première de `languages`.
 * Seules les recommandations validées deviennent des actions. La publication
 * reste un geste de Mickaël : ce module écrit un fichier, rien d'autre.
 *
 * CLI :
 *   tsx src/client-page.ts <subjectId> <windowId> <figures.json> <outDir> [comparaison.json]
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ReportFigures } from "./j0-report.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { loadRecommendations, type Recommendation } from "./recommendation.js";
import type { Measurement, SubjectBundle } from "./schema.js";

/**
 * Format partagé avec la comparaison de fenêtres (src/window-compare.ts), réduit à ce que la
 * page lit. Les taux sont des pourcentages (0 à 100).
 */
export interface WindowRate {
  mean: number;
  ci95: [number, number];
  days: number;
  dailyRates: { day: number; rate: number }[];
}
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
export interface Comparison {
  comparisonFormat: 1;
  subjectId: string;
  windowId: string;
  referenceId: string;
  unbranded: { perEngine: EngineComparison[]; total: EngineComparison };
  branded: { perEngine: EngineComparison[]; total: EngineComparison };
  executedRecommendations: { id: string; title: string; executedAt: string; proof: string }[];
}

type MeasurementWindow = Measurement["windows"][number];

export interface ClientPageOptions {
  recommendations: Recommendation[];
  /** Fenêtre qui se compare à celle-ci (comparesWith), si elle est prévue. */
  nextWindow?: MeasurementWindow;
  comparison?: Comparison;
}

type Lang = "fr" | "en";

const ENGINE_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  claude: "Claude",
  gemini: "Gemini",
  perplexity: "Perplexity",
  mistral: "Mistral",
  grok: "Grok",
};
const engineLabel = (e: string) => ENGINE_LABELS[e] ?? e;

/** Textes du gabarit. Les noms et les chiffres arrivent en paramètres, déjà échappés. */
const STRINGS = {
  fr: {
    locale: "fr-FR",
    quotes: ["«\u00a0", "\u00a0»"],
    colon: "\u00a0: ",
    eyebrow: (w: string, start: string, days: number) => `Mesure ${w} · ${days} jours à partir du ${start}`,
    headZero: (n: string) => `${n} n'apparaît pas encore dans les réponses des assistants IA aux questions qui ne citent pas son nom.`,
    headSome: (n: string, p: string) => `${n} apparaît dans ${p} des réponses des assistants IA aux questions qui ne citent pas son nom.`,
    headNone: (n: string) => `La présence de ${n} dans les réponses des assistants IA n'a pas encore pu être mesurée.`,
    headUp: (n: string, ref: string) => `${n} apparaît plus souvent qu'à ${ref} dans les réponses des assistants IA aux questions qui ne citent pas son nom.`,
    headDown: (n: string, ref: string) => `${n} apparaît moins souvent qu'à ${ref} dans les réponses des assistants IA aux questions qui ne citent pas son nom.`,
    headSame: (n: string, ref: string) => `${n} : pas de changement démontrable depuis ${ref} dans les réponses des assistants IA aux questions qui ne citent pas son nom.`,
    intro: (q: number, e: number, list: string, days: number) =>
      `Nous avons posé ${q} questions à ${e} assistants IA (${list}), une fois par jour pendant ${days} jours.`,
    webAll: "Leur recherche web était activée, comme quand ils cherchent une réponse récente.",
    webSome: (list: string) => `Leur recherche web était activée, sauf pour ${list}.`,
    missingDays: (d: string) => `Jours sans réponse : ${d}.`,
    resultTitle: "Le résultat",
    resultLabel: "des réponses vous citent, sur les questions qui ne citent pas votre nom",
    resultCount: (m: number, j: number) => `${m} mentions sur ${j} réponses jugées, tous assistants confondus.`,
    unbrandedList: "Les questions posées, sans votre nom :",
    brandedTitle: "Quand on tape votre nom",
    brandedIntro: "Ces questions citent votre nom : une mention y est attendue. Elles disent ce que les assistants savent de vous, pas s'ils vous recommandent.",
    brandedList: "Les questions posées, avec votre nom :",
    colEngine: "Assistant",
    colMentions: "Mentions / réponses jugées",
    colPresence: "Présence",
    total: "Total",
    unmeasured: (n: number, detail: string) =>
      `${n} ${n === 1 ? "réponse sans texte exploitable" : "réponses sans texte exploitable"} (${detail}) ${n === 1 ? "n'a pas été mesurée : retirée" : "n'ont pas été mesurées : retirées"} du calcul, pas comptées comme absences.`,
    sourcesTitle: "Où les assistants cherchent",
    sourcesIntro: "Les sites les plus cités dans les réponses, et la place du vôtre.",
    yourSite: "votre site",
    sourcesBrand: (s: number, p: number) => `Votre site a été cité ${s} fois, vos profils officiels ${p} fois.`,
    sourcesNone: "Les assistants n'ont renvoyé aucune source pendant cette mesure.",
    insteadTitle: "Qui est cité à votre place",
    insteadIntro: "Dans les réponses qui ne vous citent pas, les assistants nomment :",
    insteadNone: "Aucun autre acteur n'a été cité à votre place.",
    answers: (n: number) => `${n} ${n === 1 ? "réponse" : "réponses"}`,
    clientTitle: "Votre part",
    teamTitle: "Ce dont nous nous occupons",
    pendingValidation: "Les actions sont en cours de validation.",
    done: (d: string) => `fait le ${d}`,
    waiting: (x: string) => `en attente : ${x}`,
    compareTitle: (ref: string) => `Par rapport à ${ref}`,
    compareIntro: "Présence sur les questions qui ne citent pas votre nom : moyenne des jours de chaque mesure, avec son intervalle à 95 %.",
    colRef: (ref: string) => ref,
    colVerdict: "Verdict",
    fragile: "fragile",
    compareRule: "Aucune évolution n'est affirmée sans intervalles disjoints entre les deux mesures.",
    compareContext: "Les actions menées entre-temps sont un contexte, pas une cause prouvée :",
    verdicts: { hausse: "hausse", baisse: "baisse", "pas de changement démontrable": "pas de changement démontrable", "non comparable": "non comparable" } as Record<Verdict, string>,
    nextTitle: "Prochaine mesure",
    nextDated: (w: string, d: string, days: number) => `La mesure ${w} commence le ${d}, sur ${days} jours, avec les mêmes questions et les mêmes assistants.`,
    nextUndated: (w: string, days: number) => `La mesure ${w} durera ${days} jours, avec les mêmes questions et les mêmes assistants : date à fixer.`,
    nextNone: "La prochaine mesure n'est pas encore planifiée.",
    limitsTitle: "Limites",
    limits: [
      "Mesure faite par les API des assistants, avec leur recherche web : ce ne sont pas les applications grand public, qui ont leur mémoire, leur localisation et leurs propres réglages.",
      "Aucune garantie de recommandation ni de classement par un assistant.",
      "Cette page dit ce qui a été mesuré, pas ce qui sera obtenu.",
    ],
    provenance: (n: number, w: string) => `Tous les chiffres de cette page viennent des ${n} réponses enregistrées pendant la mesure ${w}.`,
  },
  en: {
    locale: "en-GB",
    quotes: ["“", "”"],
    colon: ": ",
    eyebrow: (w: string, start: string, days: number) => `Measurement ${w} · ${days} days from ${start}`,
    headZero: (n: string) => `${n} does not appear yet in AI assistants' answers to questions that do not include the name.`,
    headSome: (n: string, p: string) => `${n} appears in ${p} of AI assistants' answers to questions that do not include the name.`,
    headNone: (n: string) => `The presence of ${n} in AI assistants' answers could not be measured yet.`,
    headUp: (n: string, ref: string) => `${n} appears more often than in ${ref} in AI assistants' answers to questions that do not include the name.`,
    headDown: (n: string, ref: string) => `${n} appears less often than in ${ref} in AI assistants' answers to questions that do not include the name.`,
    headSame: (n: string, ref: string) => `${n}: no demonstrable change since ${ref} in AI assistants' answers to questions that do not include the name.`,
    intro: (q: number, e: number, list: string, days: number) =>
      `We asked ${q} questions to ${e} AI assistants (${list}), once a day for ${days} days.`,
    webAll: "Their web search was on, as when they look for a recent answer.",
    webSome: (list: string) => `Their web search was on, except for ${list}.`,
    missingDays: (d: string) => `Days without answers: ${d}.`,
    resultTitle: "The result",
    resultLabel: "of answers mention you, on questions that do not name you",
    resultCount: (m: number, j: number) => `${m} mentions out of ${j} judged answers, all assistants together.`,
    unbrandedList: "The questions asked, without your name:",
    brandedTitle: "When someone types your name",
    brandedIntro: "These questions name you, so a mention is expected. They show what assistants know about you, not whether they recommend you.",
    brandedList: "The questions asked, with your name:",
    colEngine: "Assistant",
    colMentions: "Mentions / judged answers",
    colPresence: "Presence",
    total: "Total",
    unmeasured: (n: number, detail: string) =>
      `${n} ${n === 1 ? "answer" : "answers"} without usable text (${detail}) ${n === 1 ? "was" : "were"} not measured: left out of the calculation, not counted as absences.`,
    sourcesTitle: "Where assistants look",
    sourcesIntro: "The sites cited most often in the answers, and where yours stands.",
    yourSite: "your site",
    sourcesBrand: (s: number, p: number) => `Your site was cited ${s} times, your official profiles ${p} times.`,
    sourcesNone: "The assistants returned no sources during this measurement.",
    insteadTitle: "Who is cited instead of you",
    insteadIntro: "In the answers that do not mention you, the assistants name:",
    insteadNone: "No other business was cited instead of you.",
    answers: (n: number) => `${n} ${n === 1 ? "answer" : "answers"}`,
    clientTitle: "Your part",
    teamTitle: "What we take care of",
    pendingValidation: "The actions are being validated.",
    done: (d: string) => `done on ${d}`,
    waiting: (x: string) => `waiting for: ${x}`,
    compareTitle: (ref: string) => `Compared with ${ref}`,
    compareIntro: "Presence on questions that do not name you: mean of the days of each measurement, with its 95% interval.",
    colRef: (ref: string) => ref,
    colVerdict: "Verdict",
    fragile: "fragile",
    compareRule: "No change is claimed unless the intervals of the two measurements do not overlap.",
    compareContext: "The actions carried out in between are context, not a proven cause:",
    verdicts: { hausse: "up", baisse: "down", "pas de changement démontrable": "no demonstrable change", "non comparable": "not comparable" } as Record<Verdict, string>,
    nextTitle: "Next measurement",
    nextDated: (w: string, d: string, days: number) => `Measurement ${w} starts on ${d}, over ${days} days, with the same questions and the same assistants.`,
    nextUndated: (w: string, days: number) => `Measurement ${w} will last ${days} days, with the same questions and the same assistants: date to be set.`,
    nextNone: "The next measurement is not scheduled yet.",
    limitsTitle: "Limits",
    limits: [
      "Measured through the assistants' APIs, with their web search: not the consumer apps, which have their own memory, location and settings.",
      "No guarantee of being recommended or ranked by any assistant.",
      "This page states what was measured, not what will be achieved.",
    ],
    provenance: (n: number, w: string) => `Every figure on this page comes from the ${n} answers recorded during measurement ${w}.`,
  },
} satisfies Record<Lang, unknown>;

export const CLIENT_PAGE_LANGUAGES = Object.keys(STRINGS) as Lang[];

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function clientLanguage(b: SubjectBundle): Lang {
  const l = b.subject.clientLanguage ?? b.subject.languages[0]!;
  if (!(CLIENT_PAGE_LANGUAGES as string[]).includes(l)) {
    throw new Error(`langue "${l}" non gérée par la page client (langues gérées : ${CLIENT_PAGE_LANGUAGES.join(", ")})`);
  }
  return l as Lang;
}

export function renderClientPage(b: SubjectBundle, figures: ReportFigures, opts: ClientPageOptions): string {
  if (figures.reportFormat !== 2) throw new Error(`figures.json au format ${String(figures.reportFormat)} : format 2 attendu`);
  if (figures.subjectId !== b.subject.id) throw new Error(`figures.json du sujet "${figures.subjectId}", pas "${b.subject.id}"`);
  const c = opts.comparison;
  if (c && (c.subjectId !== figures.subjectId || c.windowId !== figures.windowId)) {
    throw new Error(`comparaison ${c.subjectId}/${c.windowId} ≠ fenêtre ${figures.subjectId}/${figures.windowId}`);
  }
  const lang = clientLanguage(b);
  const T = STRINGS[lang];
  const num = new Intl.NumberFormat(T.locale, { maximumFractionDigits: 1 });
  const pct = (n: number) => (lang === "fr" ? `${num.format(n)} %` : `${num.format(n)}%`);
  const date = (iso: string) =>
    new Intl.DateTimeFormat(T.locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
  const label = (windowId: string) => esc(windowId.toUpperCase());
  const name = esc(b.subject.displayName);
  const t = figures.total;

  const promptText = (p: { id: string; version: number }) => {
    const x = b.panel.prompts.find((q) => q.id === p.id && q.version === p.version);
    if (!x) throw new Error(`question ${p.id}@v${p.version} de figures.json absente du panel`);
    return x.text;
  };
  const unbrandedPrompts = figures.scope.prompts.filter((p) => p.family === "unbranded");
  const brandedPrompts = figures.scope.prompts.filter((p) => p.family === "branded");
  const quote = (s: string) => `${T.quotes[0]}${esc(s)}${T.quotes[1]}`;
  const list = (items: string[]) => `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>`;

  // Le résultat en une phrase : le verdict de la comparaison s'il y en a un, sinon la présence mesurée.
  const headline = (() => {
    const v = c?.unbranded.total.verdict;
    const ref = c ? label(c.referenceId) : "";
    if (v === "hausse") return T.headUp(name, ref);
    if (v === "baisse") return T.headDown(name, ref);
    if (v === "pas de changement démontrable") return T.headSame(name, ref);
    if (t.unbranded.judged === 0) return T.headNone(name);
    return t.unbranded.presencePct === 0 ? T.headZero(name) : T.headSome(name, pct(t.unbranded.presencePct));
  })();

  const engines = figures.perEngine.map((e) => e.engine);
  const noWeb = engines.filter((e) => b.measurement.engines.find((m) => m.model === e)?.webSearch === false);
  const intro = [
    T.intro(figures.scope.prompts.length, engines.length, esc(engines.map(engineLabel).join(", ")), figures.window.days),
    noWeb.length ? T.webSome(esc(noWeb.map(engineLabel).join(", "))) : T.webAll,
    figures.window.missingDays.length ? T.missingDays(figures.window.missingDays.join(", ")) : "",
  ].filter(Boolean).join(" ");

  const S: string[] = [];
  S.push(`<header>
<p class="eyebrow">${T.eyebrow(label(figures.windowId), date(figures.window.startedAt), figures.window.days)}</p>
<h1>${headline}</h1>
<p class="lede">${intro}</p>
</header>`);

  // Réponses non mesurées de la famille affichée, par moteur.
  const unmeasuredNote = (n: number, pick: (e: ReportFigures["perEngine"][number]) => number) => {
    if (n <= 0) return "";
    const detail = figures.perEngine.filter((e) => pick(e) > 0).map((e) => `${esc(engineLabel(e.engine))}${T.colon}${pick(e)}`).join(", ");
    return `<p class="muted">${T.unmeasured(n, detail)}</p>`;
  };
  S.push(`<section>
<h2>${T.resultTitle}</h2>
<div class="big"><span class="figure">${pct(t.unbranded.presencePct)}</span><span class="figure-label">${T.resultLabel}</span></div>
<p>${T.resultCount(t.unbranded.mentioned, t.unbranded.judged)}</p>
${unmeasuredNote(t.unbranded.unmeasured, (e) => e.unbranded.unmeasured)}
<p class="muted">${T.unbrandedList}</p>
${list(unbrandedPrompts.map((p) => quote(promptText(p))))}
</section>`);

  const brandedRows = figures.perEngine
    .map((e) => `<tr><td>${esc(engineLabel(e.engine))}</td><td class="num">${e.branded.mentioned} / ${e.branded.judged}</td><td class="num">${pct(e.branded.presencePct)}</td></tr>`)
    .join("\n");
  S.push(`<section>
<h2>${T.brandedTitle}</h2>
<p>${T.brandedIntro}</p>
<div class="table-wrap"><table>
<thead><tr><th>${T.colEngine}</th><th class="num">${T.colMentions}</th><th class="num">${T.colPresence}</th></tr></thead>
<tbody>
${brandedRows}
<tr class="total"><td>${T.total}</td><td class="num">${t.branded.mentioned} / ${t.branded.judged}</td><td class="num">${pct(t.branded.presencePct)}</td></tr>
</tbody></table></div>
${unmeasuredNote(t.branded.unmeasured, (e) => e.branded.unmeasured)}
<p class="muted">${T.brandedList}</p>
${list(brandedPrompts.map((p) => quote(promptText(p))))}
</section>`);

  // Sources : domaines les plus cités, puis le site du sujet, en dernier et mis en valeur.
  const site = new URL(b.subject.urls.primary).hostname.replace(/^www\./, "");
  const bars = [...figures.sources.topDomains.map((d) => ({ ...d, own: false })), { domain: site, n: figures.sources.brandSite, own: true }];
  const max = Math.max(1, ...bars.map((d) => d.n));
  const anySource = figures.sources.provenance.evidenceCount > 0;
  S.push(`<section>
<h2>${T.sourcesTitle}</h2>
${anySource ? `<p>${T.sourcesIntro}</p>
<ul class="bars">
${bars
  .map(
    (d) =>
      `<li class="${d.own ? "own" : ""}"><span class="bar-label">${esc(d.domain)}${d.own ? ` <em>(${T.yourSite})</em>` : ""}</span><span class="bar-track"><span class="bar" style="width:${Math.round((100 * d.n) / max)}%"></span></span><span class="bar-n">${d.n}</span></li>`,
  )
  .join("\n")}
</ul>` : `<p>${T.sourcesNone}</p>`}
<p>${T.sourcesBrand(figures.sources.brandSite, figures.sources.brandProfiles)}</p>
</section>`);

  // Un acteur retiré des concurrents par OIA n'est pas à interpréter : absent de la page.
  const instead = figures.competitorsInstead.filter((x) => !x.rejectedByOia).slice(0, 10);
  S.push(`<section>
<h2>${T.insteadTitle}</h2>
${instead.length ? `<p>${T.insteadIntro}</p>\n${list(instead.map((x) => `<strong>${esc(x.name)}</strong> <span class="muted">· ${T.answers(x.runs)}</span>`))}` : `<p>${T.insteadNone}</p>`}
</section>`);

  // Actions : recommandations validées du sujet ; sans propriétaire déclaré, l'équipe s'en charge.
  const accepted = opts.recommendations.filter((r) => r.subjectId === b.subject.id && r.decision.status === "accepted");
  const action = (r: Recommendation) => {
    const state = r.execution ? `<span class="tag done">${T.done(date(r.execution.executedAt))}</span>` : r.blockedBy ? `<span class="tag wait">${T.waiting(esc(r.blockedBy))}</span>` : "";
    return `<li class="${r.execution ? "is-done" : ""}">${esc(r.title)}${state ? ` ${state}` : ""}</li>`;
  };
  const actions = (title: string, rs: Recommendation[]) =>
    `<section>\n<h2>${title}</h2>\n${rs.length ? `<ul class="actions">${rs.map(action).join("")}</ul>` : `<p>${T.pendingValidation}</p>`}\n</section>`;
  S.push(actions(T.clientTitle, accepted.filter((r) => r.owner === "client")));
  S.push(actions(T.teamTitle, accepted.filter((r) => r.owner !== "client")));

  if (c) {
    const ref = label(c.referenceId);
    const rate = (r: WindowRate | null) => (r ? `${pct(r.mean)} <span class="muted">[${num.format(r.ci95[0])} – ${pct(r.ci95[1])}]</span>` : "—");
    const row = (e: EngineComparison, total = false) =>
      `<tr${total ? ` class="total"` : ""}><td>${total ? T.total : esc(engineLabel(e.engine))}</td><td class="num">${rate(e.reference)}</td><td class="num">${rate(e.current)}</td><td>${esc(T.verdicts[e.verdict] ?? e.verdict)}${e.fragile ? ` <span class="tag wait" title="${esc(e.fragileReason ?? "")}">${T.fragile}</span>${e.fragileReason ? ` <span class="muted">${esc(e.fragileReason)}</span>` : ""}` : ""}</td></tr>`;
    S.push(`<section>
<h2>${T.compareTitle(ref)}</h2>
<p>${T.compareIntro}</p>
<div class="table-wrap"><table>
<thead><tr><th>${T.colEngine}</th><th class="num">${T.colRef(ref)}</th><th class="num">${label(c.windowId)}</th><th>${T.colVerdict}</th></tr></thead>
<tbody>
${row(c.unbranded.total, true)}
${c.unbranded.perEngine.map((e) => row(e)).join("\n")}
</tbody></table></div>
<p>${T.compareRule}</p>
<p>${T.compareContext}</p>
${c.executedRecommendations.length ? list(c.executedRecommendations.map((r) => `${esc(r.title)} <span class="muted">· ${T.done(date(r.executedAt))}</span>`)) : ""}
</section>`);
  }

  const nw = opts.nextWindow;
  S.push(`<section>
<h2>${T.nextTitle}</h2>
<p>${nw ? (nw.start ? T.nextDated(label(nw.id), date(nw.start), nw.days) : T.nextUndated(label(nw.id), nw.days)) : T.nextNone}</p>
</section>`);

  S.push(`<footer>
<h2>${T.limitsTitle}</h2>
${list(T.limits)}
<p class="muted">${T.provenance(t.responses, label(figures.windowId))}</p>
</footer>`);

  return `<!DOCTYPE html>
<html lang="${lang}"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${name} · ${label(figures.windowId)}</title>
<style>${CSS}</style>
</head><body>
<main>
${S.join("\n")}
</main>
</body></html>
`;
}

const CSS = `
:root{--bg:#fbfaf7;--surface:#ffffff;--text:#1c1b19;--muted:#6b675f;--line:#e4e0d8;--accent:#2f5d50;--accent-soft:#dcebe5;--bar:#b9b3a7;--warn:#8a5a00;--warn-soft:#f6ead2;color-scheme:light}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#161614;--surface:#201f1c;--text:#ece9e2;--muted:#a39e94;--line:#36342f;--accent:#8fcbb5;--accent-soft:#233a32;--bar:#5c584f;--warn:#e7b85c;--warn-soft:#3a2f1a;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#161614;--surface:#201f1c;--text:#ece9e2;--muted:#a39e94;--line:#36342f;--accent:#8fcbb5;--accent-soft:#233a32;--bar:#5c584f;--warn:#e7b85c;--warn-soft:#3a2f1a;color-scheme:dark}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:16px/1.55 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;overflow-wrap:break-word}
main{max-width:44rem;margin:0 auto;padding:32px 16px 48px}
header{margin-bottom:8px}
.eyebrow{color:var(--muted);font-size:.85rem;letter-spacing:.04em;text-transform:uppercase;margin:0 0 8px}
h1{font-size:1.6rem;line-height:1.25;margin:0 0 12px}
h2{font-size:1.15rem;margin:0 0 8px}
.lede{color:var(--muted);margin:0}
section{border-top:1px solid var(--line);padding:24px 0}
footer{border-top:1px solid var(--line);padding:24px 0 0;font-size:.9rem}
.big{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 16px;margin:8px 0}
.figure{font-size:3rem;font-weight:700;line-height:1;color:var(--accent)}
.figure-label{max-width:20rem;color:var(--muted)}
.muted{color:var(--muted)}
ul{padding-left:1.2rem;margin:8px 0}
li{margin:4px 0}
.table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin:12px 0}
table{border-collapse:collapse;width:100%;min-width:20rem;background:var(--surface)}
th,td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}
th{font-weight:600;font-size:.9rem}
.num{text-align:right;white-space:nowrap}
tr.total td{font-weight:600}
.bars{list-style:none;padding:0}
.bars li{display:grid;grid-template-columns:minmax(0,11rem) minmax(0,1fr) 2.5rem;gap:8px;align-items:center}
.bar-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{height:10px;background:var(--line);border-radius:5px;overflow:hidden}
.bar{display:block;height:100%;background:var(--bar)}
.bar-n{text-align:right}
.bars li.own{font-weight:600}
.bars li.own .bar{background:var(--accent)}
.bars li.own .bar-track{outline:2px solid var(--accent-soft)}
.actions li.is-done{color:var(--muted)}
.tag{display:inline-block;font-size:.8rem;padding:0 6px;border-radius:4px;white-space:nowrap}
.tag.done{background:var(--accent-soft);color:var(--accent)}
.tag.wait{background:var(--warn-soft);color:var(--warn);white-space:normal}
@media (max-width:30rem){.bars li{grid-template-columns:minmax(0,1fr) 2.5rem}.bar-track{grid-column:1/-1;grid-row:2}h1{font-size:1.35rem}.figure{font-size:2.4rem}}
`;

export function writeClientPage(outDir: string, html: string): string {
  mkdirSync(outDir, { recursive: true });
  const p = join(outDir, "page-client.html");
  writeFileSync(p, html);
  return p;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, windowId, figuresFile, outDir, comparisonFile] = process.argv.slice(2);
  try {
    if (!subjectId || !windowId || !figuresFile || !outDir) {
      throw new Error("usage: tsx src/client-page.ts <subjectId> <windowId> <figures.json> <outDir> [comparaison.json]");
    }
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const figures = JSON.parse(readFileSync(figuresFile, "utf8")) as ReportFigures;
    if (figures.windowId !== windowId) throw new Error(`${figuresFile} porte la fenêtre "${figures.windowId}", pas "${windowId}"`);
    const comparison = comparisonFile ? (JSON.parse(readFileSync(comparisonFile, "utf8")) as Comparison) : undefined;
    if (comparison && comparison.comparisonFormat !== 1) throw new Error(`${comparisonFile} : comparisonFormat 1 attendu`);
    const html = renderClientPage(b, figures, {
      recommendations: loadRecommendations(dir),
      nextWindow: b.measurement.windows.find((w) => w.comparesWith === windowId),
      comparison,
    });
    process.stdout.write(`${writeClientPage(outDir, html)}\n`);
  } catch (err) {
    process.stderr.write(`client-page : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
