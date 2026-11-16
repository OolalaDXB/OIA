/*
 * Repris d'Elmo : elmo v0.7.7, commit 5e76f422, packages/lib/src/providers/registry/anthropic-api.ts
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
 * Claude par l'API Messages d'Anthropic (cible `claude:anthropic-api:<modèle>:online`).
 *
 * Réglages d'Elmo (registry/anthropic-api.ts, l. 32-62 ; providers/config.ts, l. 31-53) :
 * outil `web_search_20250305`, `max_uses: 1`, 8 000 jetons de sortie, un seul message
 * utilisateur, aucun prompt système ; si un bloc `web_search_tool_result` porte une
 * erreur (ex. `max_uses_exceeded`), un nouvel appel 10 s plus tard, une seule fois.
 *
 * Écarts volontaires :
 *  - Elmo jetait la première réponse quand il refaisait l'appel ; OIA garde les deux
 *    et compte le coût des deux (les deux sont facturées) ;
 *  - Elmo retirait le contenu des pages trouvées (`encrypted_content`, `page_age` :
 *    l. 75-87) ; OIA garde la réponse complète.
 */
import { citationsFromAnthropic, textFromAnthropic } from "./extract.js";
import { postJson } from "./http.js";
import { isObj, MAX_OUTPUT_TOKENS, str, type BilledCall, type ProviderCallResult, type ProviderImpl } from "./types.js";

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const ANTHROPIC_WEB_SEARCH_MAX_USES = 1;
export const ANTHROPIC_WEB_SEARCH_RETRY_MS = 10_000;

export function anthropicRequestBody(model: string, prompt: string, webSearch: boolean): Record<string, unknown> {
  return {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [{ role: "user", content: prompt }],
    ...(webSearch ? { tools: [{ type: "web_search_20250305", name: "web_search", max_uses: ANTHROPIC_WEB_SEARCH_MAX_USES }] } : {}),
  };
}

/** Code d'erreur de la recherche web, s'il y en a une dans la réponse. */
export function webSearchError(raw: unknown): string | null {
  const blocks = isObj(raw) && Array.isArray(raw.content) ? raw.content : [];
  for (const b of blocks) {
    if (b?.type !== "web_search_tool_result" || Array.isArray(b.content)) continue;
    if (b.content?.type === "web_search_tool_result_error") return str(b.content.error_code, "inconnue");
  }
  return null;
}

export const anthropicProvider: ProviderImpl = {
  id: "anthropic-api",
  keyEnv: "ANTHROPIC_API_KEY",
  async call({ fetch, sleep, apiKey, model, webSearch, prompt }): Promise<ProviderCallResult> {
    const send = () =>
      postJson({
        fetch,
        sleep,
        url: ANTHROPIC_MESSAGES_URL,
        headers: { "x-api-key": apiKey, "anthropic-version": ANTHROPIC_VERSION },
        body: anthropicRequestBody(model, prompt, webSearch),
        label: "anthropic-api",
        secrets: [apiKey],
      });
    const calls: BilledCall[] = [];
    const notes: string[] = [];
    const record = (data: unknown, attempts: number, role: BilledCall["role"]) => {
      const raw = isObj(data) ? data : {};
      const tool = isObj(raw.usage) && isObj(raw.usage.server_tool_use) ? raw.usage.server_tool_use : {};
      calls.push({ raw: data, usage: raw.usage, searchItems: Number(tool.web_search_requests) || 0, servedModel: str(raw.model, model), httpAttempts: attempts, role });
      return raw;
    };
    let first = await send();
    let raw = record(first.data, first.attempts, "initial");
    const error = webSearchError(raw);
    if (error) {
      notes.push(`recherche web en erreur (${error}) : nouvel appel après ${ANTHROPIC_WEB_SEARCH_RETRY_MS / 1000} s, comme Elmo`);
      await sleep(ANTHROPIC_WEB_SEARCH_RETRY_MS);
      first = await send();
      raw = record(first.data, first.attempts, "retry-web-search-error");
    }
    const stop = typeof raw.stop_reason === "string" ? raw.stop_reason : null;
    if (stop === "max_tokens") notes.push("plafond de jetons de sortie atteint : réponse peut-être tronquée");
    const text = textFromAnthropic(raw);
    if (!text) notes.push("réponse sans texte");
    const webQueries = (Array.isArray(raw.content) ? raw.content : [])
      .filter((b: any) => b?.type === "server_tool_use" && b.name === "web_search")
      .map((b: any) => b.input?.query)
      .filter((q: unknown): q is string => typeof q === "string" && q.trim() !== "");
    return {
      calls,
      text,
      citations: citationsFromAnthropic(raw),
      webQueries,
      runId: str(raw.id, ""),
      finishReason: stop,
      notes,
      extra: {},
    };
  },
};
