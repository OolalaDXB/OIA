/*
 * Repris d'Elmo : elmo v0.7.7, commit 5e76f422, packages/lib/src/providers/registry/openai-api.ts
 * (réglages et forme de la requête), réécrit en appel fetch direct pour OIA.
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
 * ChatGPT par l'API Responses d'OpenAI (cible `chatgpt:openai-api:<modèle>:online`).
 *
 * Réglages d'Elmo (registry/openai-api.ts, l. 63-79 ; providers/config.ts, l. 31-57) :
 * outil `web_search` au contexte `low`, au plus 2 appels d'outil par réponse
 * (`max_tool_calls`), `tool_choice: auto`, 8 000 jetons de sortie, aucun prompt système.
 *
 * Écart volontaire : Elmo passait par le SDK `ai`, qui ne lui rendait pas le corps de la
 * réponse ; il gardait alors une réponse RECONSTRUITE (texte et citations seulement,
 * l. 54-61 et 86 ; les 56 réponses OpenAI de la base d'Elmo n'ont que `output`), sans
 * compteurs, sans `web_search_call` ni identifiant. OIA appelle l'API directement et
 * garde le corps complet.
 */
import { citationsFromOpenAI, textFromOpenAI } from "./extract.js";
import { postJson } from "./http.js";
import { isObj, MAX_OUTPUT_TOKENS, str, type ProviderCallResult, type ProviderImpl } from "./types.js";

export const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
export const OPENAI_WEB_SEARCH_CONTEXT_SIZE = "low";
export const OPENAI_WEB_SEARCH_MAX_TOOL_CALLS = 2;

export function openaiRequestBody(model: string, prompt: string, webSearch: boolean): Record<string, unknown> {
  return {
    model,
    input: [{ role: "user", content: [{ type: "input_text", text: prompt }] }],
    max_output_tokens: MAX_OUTPUT_TOKENS,
    tool_choice: webSearch ? "auto" : "none",
    ...(webSearch
      ? { tools: [{ type: "web_search", search_context_size: OPENAI_WEB_SEARCH_CONTEXT_SIZE }], max_tool_calls: OPENAI_WEB_SEARCH_MAX_TOOL_CALLS }
      : {}),
  };
}

/** Requêtes de recherche : portées par l'action de chaque `web_search_call` (Elmo, l. 44-48). */
function webQueries(raw: Record<string, any>): string[] {
  const out: string[] = [];
  for (const item of Array.isArray(raw.output) ? raw.output : []) {
    if (item?.type !== "web_search_call" || item.action?.type !== "search") continue;
    for (const q of [item.action.query, ...(Array.isArray(item.action.queries) ? item.action.queries : [])]) {
      if (typeof q === "string" && q.trim() && !out.includes(q)) out.push(q);
    }
  }
  return out;
}

export const openaiProvider: ProviderImpl = {
  id: "openai-api",
  keyEnv: "OPENAI_API_KEY",
  async call({ fetch, sleep, apiKey, model, webSearch, prompt }): Promise<ProviderCallResult> {
    const { data, attempts } = await postJson({
      fetch,
      sleep,
      url: OPENAI_RESPONSES_URL,
      headers: { Authorization: `Bearer ${apiKey}` },
      body: openaiRequestBody(model, prompt, webSearch),
      label: "openai-api",
      secrets: [apiKey],
    });
    const raw = isObj(data) ? data : {};
    const searchItems = (Array.isArray(raw.output) ? raw.output : []).filter((i: any) => i?.type === "web_search_call").length;
    const status = typeof raw.status === "string" ? raw.status : null;
    const incomplete = isObj(raw.incomplete_details) ? str(raw.incomplete_details.reason, "") : "";
    const notes: string[] = [];
    if (incomplete === "max_output_tokens") notes.push("plafond de jetons de sortie atteint : réponse peut-être tronquée");
    const text = textFromOpenAI(raw);
    if (!text) notes.push("réponse sans texte");
    return {
      calls: [{ raw: data, usage: raw.usage, searchItems, servedModel: str(raw.model, model), httpAttempts: attempts, role: "initial" }],
      text,
      citations: citationsFromOpenAI(raw),
      webQueries: webQueries(raw),
      runId: str(raw.id, ""),
      finishReason: incomplete || status,
      notes,
      extra: {},
    };
  },
};
