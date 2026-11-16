/*
 * Repris d'Elmo : elmo v0.7.7, commit 5e76f422, fichiers d'origine :
 *   apps/worker/src/mention-judge/jev.ts       (requête, réponse, erreurs de Jev)
 *   apps/worker/src/mention-judge/analyze.ts   (règles, questions, seuil, découpage, jugement)
 *   apps/worker/src/mention-judge/clean.ts     (nettoyage du texte lu par le juge)
 *   apps/worker/src/mention-judge/passages.ts  (phrases, correspondance, passages candidats)
 *   packages/lib/src/mentions.ts               (sujet jugé, mot entier, empreintes, tampon)
 * Logique et constantes inchangées (RULES, critères, seuil 0,3, 50 000 caractères, 12 phrases,
 * 3 phrases par passage, tampon jev-1.13.0+request-1) ; transport réécrit pour OIA.
 *
 * MIT License
 *
 * Copyright (c) 2026 Blue Whale Software, LLC
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/**
 * Juge des mentions Jev (TypeSafe), modèle épinglé jev-1.13.0, appelé directement par OIA
 * (mandat v14, bloc D, option D1 retenue par Mickaël le 16 novembre 2026).
 *
 * Écarts avec Elmo, tous hors de la requête envoyée (qui reste celle de J0) :
 *  - appels en série, reprises bornées sur 429 (6 au plus, Retry-After, comme Elmo) au lieu
 *    de son groupe adaptatif, et au plus JEV_MAX_CALLS_PER_ANSWER appels par réponse
 *    (découpages compris), pour borner le coût ;
 *  - `usage` de chaque appel gardé (Elmo ne le gardait pas), et le passage en texte en plus
 *    de ses positions ;
 *  - pas de réutilisation des jugements précédents (`previous`) : chaque preuve est jugée une
 *    fois, à sa collecte.
 */
import { createHash } from "node:crypto";
import type { FetchLike, Sleep } from "./collector-oia/http.js";
import { scrub } from "./collector-oia/http.js";

// ---------------------------------------------------------------------------
// packages/lib/src/mentions.ts
// ---------------------------------------------------------------------------

export const MENTIONS_VERSION = 1;

export interface MentionSubject {
  name: string;
  aliases: string[];
  domains: string[];
}

export interface MentionConfig {
  brand: MentionSubject;
  competitors: MentionSubject[];
}

export type Sentiment = "positive" | "neutral" | "negative" | "mixed";
export type NonMentionReason = "other_meaning" | "other_company" | "no_info";

export function normalizeDomain(urlOrDomain: string): string {
  try {
    const url = new URL(urlOrDomain.startsWith("http") ? urlOrDomain : `https://${urlOrDomain}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return urlOrDomain.replace(/^www\./, "").toLowerCase();
  }
}

export function judgedSubject(subject: MentionSubject): MentionSubject {
  const present = (values: string[]) => values.map((v) => v.trim()).filter(Boolean);
  return { name: subject.name.trim(), aliases: present(subject.aliases), domains: present(subject.domains).map(normalizeDomain) };
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 16);

export function subjectFingerprint(subject: MentionSubject, judgeVersion: string): string {
  return digest({ ...judgedSubject(subject), judgeVersion });
}

export function mentionsStamp(config: MentionConfig, judgeVersion: string): string {
  const subjects = digest({
    brand: subjectFingerprint(config.brand, judgeVersion),
    competitors: config.competitors.map((c) => [c.name, subjectFingerprint(c, judgeVersion)]).sort(),
  });
  return `${MENTIONS_VERSION}:${subjects}:judge-${judgeVersion}`;
}

const WORD_CHAR = String.raw`[[\p{L}\p{N}]--[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]]`;

/** Un terme dans un mot plus long (« ace » dans « place ») ne compte jamais : mot entier seulement. */
export function wholeWordPattern(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<!${WORD_CHAR})${escaped}(?!${WORD_CHAR})`, "giv");
}

// ---------------------------------------------------------------------------
// apps/worker/src/mention-judge/clean.ts
// ---------------------------------------------------------------------------

export interface Cleaned {
  text: string;
  from: number[];
  to: number[];
}

export function originalSpan(cleaned: Cleaned, start: number, end: number): { start: number; end: number } {
  return { start: cleaned.from[start]!, end: cleaned.to[end - 1]! };
}

function rewrite(cleaned: Cleaned, pattern: RegExp, replace: (...groups: string[]) => string): Cleaned {
  const out: Cleaned = { text: "", from: [], to: [] };
  let copied = 0;
  const copy = (start: number, end: number) => {
    out.text += cleaned.text.slice(start, end);
    for (let i = start; i < end; i++) {
      out.from.push(cleaned.from[i]!);
      out.to.push(cleaned.to[i]!);
    }
  };
  for (const match of cleaned.text.matchAll(pattern)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (end === start) continue;
    copy(copied, start);
    const replacement = replace(...(match as unknown as string[]));
    for (let i = 0; i < replacement.length; i++) {
      out.from.push(cleaned.from[start]!);
      out.to.push(cleaned.to[end - 1]!);
    }
    out.text += replacement;
    copied = end;
  }
  if (copied === 0) return cleaned;
  copy(copied, cleaned.text.length);
  return out;
}

function host(url: string): string {
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

const TEXT = String.raw`((?:[^\[\]\n]|\[[^\[\]\n]*\])*)`;
const URL_PART = String.raw`((?:[^()\s]|\([^()\s]*\))*)`;
const IMAGE = new RegExp(String.raw`!\[${TEXT}\]\(${URL_PART}\)`, "g");
const LINK = new RegExp(String.raw`\[${TEXT}\]\(${URL_PART}\)`, "g");

export const INLINE_DATA = /data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi;
const DOMAIN = /^(?:www\.)?(?:[a-z0-9-]+\.)+[a-z]{2,}$/i;
const CITATION_NUMBER = /^\[?\^?\d+\^?\]?$/;
const BLOCK_TAGS = new Set(["br", "p", "div", "li", "tr", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6", "hr"]);
const ENTITIES: Record<string, string> = { amp: "&", quot: '"', apos: "'", lt: "<", gt: ">", nbsp: " ", ndash: "–", mdash: "—" };

export function cleanAnswer(answer: string): Cleaned {
  const steps: [RegExp, (...groups: string[]) => string][] = [
    [INLINE_DATA, () => ""],
    [/\\([!-/:-@[-`{-~])/g, (_, char) => char!],
    [
      /&(?:(amp|quot|apos|lt|gt|nbsp|ndash|mdash)|#(\d{1,7}|[xX][0-9a-fA-F]{1,6}));/g,
      (_, name, code) => {
        if (name) return ENTITIES[name]!;
        const point = /^[xX]/.test(code!) ? Number.parseInt(code!.slice(1), 16) : Number(code);
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
      },
    ],
    [/<(https?:\/\/[^\s<>]+)>/g, (_, url) => host(url!)],
    [/<\/?([a-z][a-z0-9]*)(?:\s[^<>]*)?\/?>/gi, (_, tag) => (BLOCK_TAGS.has(tag!.toLowerCase()) ? " " : "")],
    [/【[^】\n]{0,200}†[^】\n]{0,200}】|[^\n]{0,200}|[-]|\[\^\d+\^?\]/g, () => ""],
    [
      IMAGE,
      (_, caption, url) => {
        const cited = /favicons\?domain=([^&]+)/.exec(url!)?.[1];
        if (cited) return `(${host(decodeURIComponent(cited))})`;
        return caption!.trim() ? `(image: ${caption!.trim()})` : "";
      },
    ],
    [
      LINK,
      (_, text, url) => {
        if (!url || url.startsWith("/")) return text!;
        if (DOMAIN.test(text!.trim()) || /^https?:\/\/\S+$/.test(text!.trim())) return host(text!.trim());
        if (!text!.trim() || CITATION_NUMBER.test(text!.trim())) return `(${host(url)})`;
        return `${text} (${host(url)})`;
      },
    ],
    [/\[([^\]]{0,200}?)\]\([^)\n[]{0,2000}\)/g, (_, text) => text!.split(/\s+/).join(" ").trim()],
    [/https?:\/\/[^\s)\]`'"<>]+/g, (url) => host(url!)],
    [/(?<![ \t\n])[ \t]*\n(?:[ \t]*\n)*[ \t]*(?=[,;:)]|\.(?:\s|$))|(?<=\S)[ \t]*\n[ \t]*(?=\p{Ll})/gu, () => " "],
    [/^[ \t]+|(?<![ \t])[ \t]+$/gm, () => ""],
    [/[ \t]{2,}/g, () => " "],
    [/\n{3,}/g, () => "\n\n"],
    [/^\s+|(?<!\s)\s+$/g, () => ""],
  ];
  const start: Cleaned = { text: answer, from: [], to: [] };
  for (let i = 0; i < answer.length; i++) {
    start.from.push(i);
    start.to.push(i + 1);
  }
  return steps.reduce((cleaned, [pattern, replace]) => rewrite(cleaned, pattern, replace), start);
}

// ---------------------------------------------------------------------------
// apps/worker/src/mention-judge/passages.ts
// ---------------------------------------------------------------------------

export type SentenceKind = "heading" | "table" | "text";

export interface Sentence {
  text: string;
  kind: SentenceKind;
  start: number;
  end: number;
}

const ATX_HEADING = /^#{1,6}\s/;
const UNDERLINE = /^\s*(=+|-+)\s*$/;
const TABLE_ROW = /^\s*\||\|.*\|/;
const CHIP = String.raw`\((?:[a-z0-9-]+\.)+[a-z]{2,}\)`;
const BOUNDARY = new RegExp(String.raw`(?<=[.!?](?:\[\d+\]|\s?${CHIP})*)\s+(?!${CHIP})(?=[\p{Lu}\p{N}*#[(|])|(?<=[。！？])(?=\S)`, "gu");

export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  const lines = text.split("\n");
  let lineStart = 0;
  lines.forEach((line, i) => {
    const offset = lineStart;
    lineStart += line.length + 1;
    if (!/[\p{L}\p{N}]/u.test(line)) return;
    if (TABLE_ROW.test(line)) {
      out.push(trimmed(text, offset, offset + line.length, "table"));
      return;
    }
    const heading = ATX_HEADING.test(line) || UNDERLINE.test(lines[i + 1] ?? "");
    const parts: [number, number][] = [];
    let partStart = 0;
    for (const boundary of [...line.matchAll(BOUNDARY), { index: line.length, 0: "" }]) {
      const part: [number, number] = [partStart, boundary.index ?? line.length];
      partStart = part[1] + boundary[0].length;
      const previous = parts.at(-1);
      if (previous && !/\p{L}/u.test(line.slice(...previous))) previous[1] = part[1];
      else parts.push(part);
    }
    parts
      .filter(([start, end]) => /[\p{L}\p{N}]/u.test(line.slice(start, end)))
      .forEach(([start, end], j) => {
        out.push(trimmed(text, offset + start, offset + end, heading && j === 0 ? "heading" : "text"));
      });
  });
  return out;
}

function trimmed(text: string, start: number, end: number, kind: SentenceKind): Sentence {
  while (start < end && /\s/.test(text[start]!)) start++;
  while (end > start && /\s/.test(text[end - 1]!)) end--;
  return { text: text.slice(start, end), kind, start, end };
}

function termPatterns(subject: MentionSubject): { term: string; pattern: RegExp }[] {
  const { name, aliases, domains } = judgedSubject(subject);
  return [name, ...aliases, ...domains].filter(Boolean).map((term) => ({ term, pattern: wholeWordPattern(term) }));
}

/** Le texte nomme-t-il le sujet : nom, alias ou domaine, en mot entier. */
export function matcher(subject: MentionSubject): (text: string) => boolean {
  const patterns = termPatterns(subject).map((p) => p.pattern);
  return (text) =>
    patterns.some((pattern) => {
      pattern.lastIndex = 0;
      return pattern.test(text);
    });
}

/** Ajout d'OIA : le premier terme (nom, alias ou domaine) trouvé dans le texte, avec sa position. */
export function firstTerm(subject: MentionSubject, text: string): { term: string; index: number; matched: string } | null {
  let best: { term: string; index: number; matched: string } | null = null;
  for (const { term, pattern } of termPatterns(subject)) {
    pattern.lastIndex = 0;
    const m = pattern.exec(text);
    if (m && (best === null || m.index < best.index)) best = { term, index: m.index, matched: m[0] };
  }
  return best;
}

const FOLLOWING = 3;
const MAX_SENTENCES = 12;
const MAX_PER_PASSAGE = 3;

export function quoteOptions(all: Sentence[], names: (text: string) => boolean, namesOther: (text: string) => boolean): Sentence[] {
  const picked: number[] = [];
  all.forEach((sentence, i) => {
    if (!names(sentence.text)) return;
    for (let j = i; j < Math.min(all.length, i + FOLLOWING + 1); j++) {
      const next = all[j]!;
      if (j > i && (names(next.text) || namesOther(next.text) || next.kind !== "text")) break;
      if (!picked.includes(j)) picked.push(j);
    }
  });
  const kept = picked.sort((a, b) => a - b).slice(0, MAX_SENTENCES);
  const passages: number[][] = [];
  for (const i of kept) {
    const last = passages.at(-1);
    if (last && i === last[last.length - 1]! + 1 && last.length < MAX_PER_PASSAGE && all[i]!.kind === "text") last.push(i);
    else passages.push([i]);
  }
  return passages
    .map((run) => ({ text: run.map((i) => all[i]!.text).join(" "), kind: all[run[0]!]!.kind, start: all[run[0]!]!.start, end: all[run[run.length - 1]!]!.end }))
    .filter((passage) => /\p{L}{2}/u.test(passage.text.replace(new RegExp(CHIP, "g"), "")));
}

export function mentionOffsets(answer: string, subject: MentionSubject): number[] {
  const visible = answer
    .replace(INLINE_DATA, (data) => " ".repeat(data.length))
    .replace(/\]\([^)\s]{0,2000}\)|https?:\/\/[^\s)\]]+/g, (target) => " ".repeat(target.length));
  const named = offsetsIn(visible, subject);
  return named.length ? named : offsetsIn(answer, subject);
}

function offsetsIn(text: string, subject: MentionSubject): number[] {
  const offsets = new Set<number>();
  for (const { pattern } of termPatterns(subject)) for (const match of text.matchAll(pattern)) offsets.add(match.index ?? 0);
  return [...offsets].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// apps/worker/src/mention-judge/jev.ts (transport réécrit : fetch injecté, appels en série)
// ---------------------------------------------------------------------------

export const JEV_MODEL = "jev-1.13.0";
export const TYPESAFE_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const TIMEOUT_MS = 30_000;
/** Reprises sur 429 (Elmo : 6, dans son groupe adaptatif). */
export const JEV_RATE_LIMIT_RETRIES = 6;

export interface JevChoiceQuestion {
  type: "choice";
  instructions: string;
  criteria: Record<string, string>;
}

export interface JevRequest {
  model: string;
  state: Record<string, unknown>;
  questions: Record<string, JevChoiceQuestion>;
}

export interface JevChoice {
  choice: string;
  probabilities: Record<string, number>;
}

export interface JevResponse {
  answers: Record<string, JevChoice>;
  usage?: { input_tokens: number; output_tokens: number };
}

export class RateLimited extends Error {
  constructor(
    readonly retryAfterMs: number,
    detail: string,
  ) {
    super(`Jev rate limited the request (HTTP 429): ${detail}`);
  }
}

export class TooLarge extends Error {}

/** Un appel à Jev : la réponse, et ce qu'OIA consigne (Elmo ne gardait pas `usage`). */
export interface JevCallRecord {
  questions: string[];
  answerChars: number;
  usage: JevResponse["usage"] | null;
  attempts: number;
}

export type JevTransport = (request: JevRequest) => Promise<JevResponse>;

export function typesafeTransport(opts: { apiKey: string; fetch: FetchLike; sleep: Sleep; onCall?: (r: JevCallRecord) => void }): JevTransport {
  return async (request) => {
    for (let attempt = 1; ; attempt++) {
      const res = await opts.fetch(TYPESAFE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const text = await res.text();
      if (!res.ok) {
        const detail = scrub(text.slice(0, 300), [opts.apiKey]);
        if (res.status === 429 && attempt <= JEV_RATE_LIMIT_RETRIES) {
          await opts.sleep(Math.min(Number(res.headers.get("retry-after")) * 1000 || 1000, 60_000));
          continue;
        }
        if (res.status === 429) throw new RateLimited(0, detail);
        if (res.status === 400 && text.includes("max_tokens_exceeded")) throw new TooLarge(`Jev found the request too large (HTTP 400): ${detail}`);
        if (res.status === 401 || res.status === 402 || res.status === 403) throw new Error(`TYPESAFE_API_KEY was rejected (HTTP ${res.status}); check it, or its credit: ${detail}`);
        throw new Error(`Jev returned HTTP ${res.status}: ${detail}`);
      }
      let body: JevResponse;
      try {
        body = JSON.parse(text) as JevResponse;
      } catch {
        throw new Error("Jev : réponse illisible (JSON invalide)");
      }
      for (const key of Object.keys(request.questions)) {
        const answer = body.answers?.[key];
        if (typeof answer?.choice !== "string" || !Object.keys(answer.probabilities ?? {}).length) throw new Error(`Jev returned no answer to "${key}"`);
      }
      opts.onCall?.({ questions: Object.keys(request.questions), answerChars: String(request.state.answer ?? "").length, usage: body.usage ?? null, attempts: attempt });
      return body;
    }
  };
}

// ---------------------------------------------------------------------------
// apps/worker/src/mention-judge/analyze.ts
// ---------------------------------------------------------------------------

export const MAX_ANSWER_CHARS = 50_000;
export const REQUEST_VERSION = 1;
export const MENTION_THRESHOLD = 0.3;
/** Tampon du juge, comme dans Elmo : `jev-1.13.0+request-1`. */
export const JEV_JUDGE_VERSION = `${JEV_MODEL}+request-${REQUEST_VERSION}`;

export const RULES =
  "Answer about the one entity named in each question (a company, product, person, organisation or place), using state.answer (an AI assistant's answer to state.question). " +
  "Distinguish it from anything else with the same name, including ordinary words. " +
  "The entity's own products and services count as the entity. " +
  "Judge how the answer portrays that entity specifically, not the overall tone and not other entities.";

const SENTIMENTS: Sentiment[] = ["positive", "neutral", "negative", "mixed"];
const REASONS: NonMentionReason[] = ["other_meaning", "other_company", "no_info"];

export function verdictQuestion(subject: MentionSubject): JevChoiceQuestion {
  const { name, domains } = subject;
  return {
    type: "choice",
    instructions: `How does the answer portray ${name}${domains.length ? ` (website ${domains.join(", ")})` : ""}? A link to its website counts as a mention.`,
    criteria: {
      positive: `${name} or its product is recommended, praised, or described favourably.`,
      neutral: `${name} or its product is mentioned factually without evaluation, or only cited as a source.`,
      negative: `${name} or its product is criticised, warned against, or compared unfavourably.`,
      mixed: `${name} gets clear praise and clear criticism of similar weight.`,
      other_meaning: "The name is used as an ordinary word, not for any entity.",
      other_company: "The name refers to a different entity (company, product, person or place) with the same name.",
      no_info: `The answer says it has no information about ${name}.`,
    },
  };
}

function evidenceQuestion(name: string, passages: Sentence[]): JevChoiceQuestion {
  return {
    type: "choice",
    instructions: `Which passage best represents the answer's sentiment toward ${name}: the one a reader would quote to show how the answer judges ${name}, ideally naming it and giving a reason?`,
    criteria: Object.fromEntries(passages.map((passage, i) => [`p${i + 1}`, passage.text])),
  };
}

const top = <T extends string>(probabilities: Record<string, number>, labels: T[]): T =>
  labels.reduce((best, label) => ((probabilities[label] ?? 0) > (probabilities[best] ?? 0) ? label : best));

export interface MentionAssessment {
  mentioned: boolean;
  probability: number;
  reason?: NonMentionReason;
  sentiment?: Sentiment;
  sentimentProbabilities?: Record<string, number>;
  /** Positions dans le texte de la preuve (`rawText`). */
  passage?: { start: number; end: number };
  /** Ajout d'OIA : le passage en texte. */
  passageText?: string;
  firstMention?: number;
  mentionCount?: number;
  position?: number;
}

function assessment(answer: string, cleaned: Cleaned, subject: MentionSubject, verdict: Record<string, number>, quote: Sentence | undefined): MentionAssessment {
  const probability = SENTIMENTS.reduce((sum, label) => sum + (verdict[label] ?? 0), 0);
  const mentioned = probability > MENTION_THRESHOLD;
  const passage = quote ? originalSpan(cleaned, quote.start, quote.end) : undefined;
  const offsets = mentionOffsets(answer, subject);
  return {
    mentioned,
    probability,
    ...(mentioned
      ? {
          sentiment: top(verdict, SENTIMENTS),
          sentimentProbabilities: Object.fromEntries(SENTIMENTS.map((label) => [label, (verdict[label] ?? 0) / probability])),
          ...(offsets.length ? { firstMention: offsets[0], mentionCount: offsets.length } : {}),
        }
      : { reason: top(verdict, REASONS) }),
    ...(passage ? { passage, passageText: answer.slice(passage.start, passage.end) } : {}),
  };
}

export function rank(records: (MentionAssessment | undefined)[]): void {
  const placed = records.filter((r): r is MentionAssessment & { firstMention: number } => !!r?.mentioned && r.firstMention !== undefined);
  placed.sort((a, b) => a.firstMention - b.firstMention);
  placed.forEach((r, i) => {
    r.position = i + 1;
  });
}

const MIN_ANSWER_CHARS = 2_000;
/** Borne d'OIA : appels à Jev pour une même réponse, découpages compris. */
export const JEV_MAX_CALLS_PER_ANSWER = 8;

async function askFitting(transport: JevTransport, request: JevRequest, budget: { left: number }): Promise<JevResponse["answers"]> {
  if (budget.left <= 0) throw new Error(`Jev : plus de ${JEV_MAX_CALLS_PER_ANSWER} appels pour une même réponse, jugement abandonné`);
  budget.left--;
  try {
    return (await transport(request)).answers;
  } catch (error) {
    if (!(error instanceof TooLarge)) throw error;
    const companyOf = (key: string) => key.split("__")[0]!;
    const companies = [...new Set(Object.keys(request.questions).map(companyOf))];
    if (companies.length > 1) {
      const first = new Set(companies.slice(0, Math.ceil(companies.length / 2)));
      const part = (inFirst: boolean): JevRequest => ({
        ...request,
        questions: Object.fromEntries(Object.entries(request.questions).filter(([key]) => first.has(companyOf(key)) === inFirst)),
      });
      // En série (Elmo : en parallèle) : le budget d'appels reste exact.
      const a = await askFitting(transport, part(true), budget);
      const b = await askFitting(transport, part(false), budget);
      return { ...a, ...b };
    }
    const answer = String(request.state.answer ?? "");
    if (answer.length < MIN_ANSWER_CHARS) throw error;
    return askFitting(transport, { ...request, state: { ...request.state, answer: answer.slice(0, Math.floor(answer.length / 2)) } }, budget);
  }
}

export interface JevJudgement {
  brandMentioned: boolean;
  competitorsMentioned: string[];
  assessments: {
    brand?: MentionAssessment;
    competitors: Record<string, MentionAssessment>;
    judged: { brand: string; competitors: Record<string, string> };
  };
  /** Clés des entreprises envoyées à Jev (brand, c0, c1…). */
  asked: string[];
}

/** Jugement d'une réponse, comme `jevAnalyzer(...).analyze` d'Elmo (sans `previous`). */
export async function jevJudge(transport: JevTransport, text: string, config: MentionConfig, question: string): Promise<JevJudgement> {
  const answer = text;
  const cleaned = cleanAnswer(answer);
  const readable = cleaned.text.slice(0, MAX_ANSWER_CHARS);
  const subjects = [
    { key: "brand", subject: config.brand },
    ...config.competitors.map((competitor, i) => ({ key: `c${i}`, subject: competitor })),
  ].map((e) => ({ ...e, fingerprint: subjectFingerprint(e.subject, JEV_JUDGE_VERSION), names: matcher(e.subject) }));
  const named = subjects.filter((e) => e.names(readable));
  const split = sentences(readable);
  const questions: Record<string, JevChoiceQuestion> = {};
  const options = new Map<string, Sentence[]>();
  for (const entry of named) {
    const others = named.filter((o) => o !== entry);
    const passages = quoteOptions(split, entry.names, (t) => others.some((o) => o.names(t)));
    options.set(entry.key, passages);
    questions[`${entry.key}__verdict`] = verdictQuestion(entry.subject);
    if (passages.length) questions[`${entry.key}__evidence`] = evidenceQuestion(entry.subject.name, passages);
  }
  const request: JevRequest = { model: JEV_MODEL, state: { rules: RULES, question, answer: readable }, questions };
  const answers = named.length ? await askFitting(transport, request, { left: JEV_MAX_CALLS_PER_ANSWER }) : {};
  const records = new Map<string, MentionAssessment>();
  for (const entry of named) {
    const quote = options.get(entry.key)?.[Number(answers[`${entry.key}__evidence`]?.choice.slice(1)) - 1];
    records.set(entry.key, assessment(answer, cleaned, entry.subject, answers[`${entry.key}__verdict`]!.probabilities, quote));
  }
  const brand = records.get("brand");
  const competitors = subjects.slice(1).flatMap((e) => {
    const r = records.get(e.key);
    return r ? [[e.subject.name, r] as const] : [];
  });
  const assessments: JevJudgement["assessments"] = {
    ...(brand ? { brand } : {}),
    competitors: Object.fromEntries(competitors),
    judged: { brand: subjects[0]!.fingerprint, competitors: Object.fromEntries(subjects.slice(1).map((e) => [e.subject.name, e.fingerprint])) },
  };
  rank([assessments.brand, ...Object.values(assessments.competitors)]);
  return {
    brandMentioned: !!brand?.mentioned,
    competitorsMentioned: competitors.filter(([, r]) => r.mentioned).map(([name]) => name),
    assessments,
    asked: named.map((e) => e.key),
  };
}
