/*
 * Repris d'Elmo : elmo v0.7.7, commit 5e76f422, packages/lib/src/text-extraction.ts
 * (extraction du texte et des citations par fournisseur), adapté au collecteur OIA.
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
 * Texte et citations d'une réponse brute, par fournisseur, à l'identique d'Elmo
 * (mêmes champs lus, même jointure par "\n", mêmes règles de dédoublonnage), pour
 * que la longueur des réponses et le nombre de citations restent comparables à J0.
 *
 * Un seul écart, pour Mistral : Elmo ne lit le texte que dans les morceaux typés
 * `text` d'un `content` en tableau (text-extraction.ts, l. 182) ; un `content`
 * en simple chaîne lui échappe. On le lit aussi (comme le faisait déjà son propre
 * `conversationText`, registry/mistral-api.ts, l. 63-75).
 *
 * Contrairement à Elmo, aucun texte de remplacement (« No text content found… »)
 * n'est jamais renvoyé : une réponse sans texte donne "".
 */

export interface Citation {
  url: string;
  title?: string;
}

const asArray = (value: unknown): any[] => (Array.isArray(value) ? value : []);
const pluck = (nodes: any[], field: string): any[] => nodes.flatMap((n) => asArray(n?.[field]));
const byType = (nodes: any[], type: string): any[] => nodes.filter((n) => n?.type === type);
const joinText = (chunks: unknown[]): string => chunks.filter((c): c is string => typeof c === "string" && c !== "").join("\n");
const nonBlank = (s: string): string => (s.trim() ? s : "");

export const CITATION_TITLE_MAX_LENGTH = 256;

function normalizeTitle(title: unknown): string | undefined {
  if (typeof title !== "string" || !title) return undefined;
  const chars = Array.from(title);
  return chars.length > CITATION_TITLE_MAX_LENGTH ? chars.slice(0, CITATION_TITLE_MAX_LENGTH).join("") : title;
}

/** Validation, dédoublonnage et ordre des citations, communs à tous les fournisseurs (Elmo, l. 494-509). */
function collectCitations(traverse: (add: (url: unknown, title?: unknown) => void) => void): Citation[] {
  const out: Citation[] = [];
  const seen = new Set<string>();
  const add = (url: unknown, title?: unknown) => {
    if (typeof url !== "string" || !url.startsWith("http") || seen.has(url)) return;
    seen.add(url);
    try {
      new URL(url);
    } catch {
      return;
    }
    const t = normalizeTitle(title);
    out.push(t === undefined ? { url } : { url, title: t });
  };
  try {
    traverse(add);
  } catch {
    return [];
  }
  return out;
}

// --- OpenAI (Responses API) : Elmo, l. 45-60 et 511-519 ---

export function textFromOpenAI(raw: any): string {
  const messages = byType(asArray(raw?.output), "message");
  const t = joinText(
    pluck(messages, "content")
      .filter((c) => c?.type === "output_text")
      .map((c) => c?.text),
  );
  return nonBlank(t);
}

export function citationsFromOpenAI(raw: any): Citation[] {
  return collectCitations((add) => {
    const texts = pluck(byType(asArray(raw?.output), "message"), "content").filter((c) => c?.type === "output_text");
    for (const a of pluck(texts, "annotations")) if (a?.type === "url_citation") add(a.url, a.title);
  });
}

// --- Anthropic (Messages API) : Elmo, l. 62-66 et 580-590 ---

export function textFromAnthropic(raw: any): string {
  return nonBlank(joinText(byType(asArray(raw?.content), "text").map((b) => b?.text)));
}

export function citationsFromAnthropic(raw: any): Citation[] {
  return collectCitations((add) => {
    const blocks = asArray(raw?.content);
    for (const c of pluck(byType(blocks, "text"), "citations")) if (c?.type === "web_search_result_location") add(c.url, c.title);
    for (const r of pluck(byType(blocks, "web_search_tool_result"), "content")) if (r?.type === "web_search_result") add(r.url, r.title);
  });
}

// --- Mistral (Conversations API) : Elmo, l. 179-186 et 550-556 ---

/** Texte de la réponse : morceaux `text` des entrées `message.output`, ou `content` en simple chaîne. */
export function textFromMistral(raw: any): string {
  const texts: string[] = [];
  for (const entry of asArray(raw?.outputs)) {
    if (typeof entry?.content === "string") texts.push(entry.content);
    else for (const chunk of asArray(entry?.content)) if (chunk?.type === "text" && typeof chunk.text === "string") texts.push(chunk.text);
  }
  return nonBlank(joinText(texts));
}

/** Raisonnement affiché par Mistral (morceaux `thinking`) : gardé à part, jamais compté comme réponse. */
export function thinkingFromMistral(raw: any): string {
  const texts: string[] = [];
  for (const chunk of pluck(asArray(raw?.outputs), "content")) {
    if (chunk?.type !== "thinking") continue;
    for (const t of asArray(chunk.thinking)) if (t?.type === "text" && typeof t.text === "string") texts.push(t.text);
  }
  return joinText(texts);
}

/** Sources citées (`tool_reference`). Mistral Large 4 n'en a renvoyé aucune à J0 (0 sur 56 réponses). */
export function citationsFromMistral(raw: any): Citation[] {
  return collectCitations((add) => {
    for (const chunk of pluck(asArray(raw?.outputs), "content")) if (chunk?.type === "tool_reference") add(chunk.url, chunk.title);
  });
}

/** Requêtes de recherche lancées par Mistral (registry/mistral-api.ts, l. 44-56). */
export function webQueriesFromMistral(raw: any): string[] {
  const out: string[] = [];
  for (const e of asArray(raw?.outputs)) {
    if (e?.type !== "tool.execution" || e?.name !== "web_search") continue;
    try {
      const args = JSON.parse(e.arguments);
      if (typeof args?.query === "string" && args.query.trim()) out.push(args.query);
    } catch {
      // arguments illisibles : on continue
    }
  }
  return out;
}

/**
 * Pages renvoyées par l'outil de recherche de Mistral (`tool.execution` → `info.result`,
 * une chaîne JSON). Ce sont les pages CONSULTÉES, pas des sources citées : jamais
 * mélangées aux citations. Ajout d'OIA (Elmo ne les lit pas).
 */
export function searchResultsFromMistral(raw: any): Citation[] {
  return collectCitations((add) => {
    for (const e of asArray(raw?.outputs)) {
      if (e?.type !== "tool.execution" || e?.name !== "web_search") continue;
      let result: unknown;
      try {
        result = typeof e.info?.result === "string" ? JSON.parse(e.info.result) : e.info?.result;
      } catch {
        continue;
      }
      if (result && typeof result === "object") for (const r of Object.values(result as Record<string, any>)) add(r?.url, r?.title);
    }
  });
}

// --- OpenRouter (Chat Completions) : Elmo, l. 188-193 et 558-566 ---

export function textFromOpenRouter(raw: any): string {
  const c = raw?.choices?.[0]?.message?.content;
  return typeof c === "string" ? nonBlank(c) : "";
}

export function citationsFromOpenRouter(raw: any): Citation[] {
  return collectCitations((add) => {
    for (const a of asArray(raw?.choices?.[0]?.message?.annotations)) {
      if (a?.type !== "url_citation") continue;
      const cite = a.url_citation ?? a;
      add(cite?.url, cite?.title);
    }
  });
}
