/*
 * Repris d'Elmo : elmo v0.7.7, commit 5e76f422, packages/lib/src/providers/registry/openrouter.ts
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
 * Gemini et Perplexity par OpenRouter (cibles `gemini:openrouter:google/gemini-3-flash-preview:online`,
 * `perplexity:openrouter:perplexity/sonar:online`).
 *
 * Réglages d'Elmo (registry/openrouter.ts, l. 101-149) : `POST /api/v1/chat/completions`,
 * modèle suffixé `:online` (équivalent au plugin `web` sans moteur imposé : la recherche
 * native du fournisseur, Exa en repli), un seul message utilisateur, `max_tokens: 8000`,
 * aucun prompt système, aucun autre paramètre (ni plugin explicite, ni nombre de
 * résultats, ni routage de fournisseur).
 *
 * Écart volontaire : les en-têtes d'attribution d'application d'OpenRouter
 * (`X-Title` seul, sans `HTTP-Referer`) désignent OIA et non Elmo. Ils ne changent pas la
 * réponse. Le coût réel facturé (`usage.cost`, présent dans les réponses de J0) est
 * gardé.
 *
 * Gemini cite par des liens de redirection `vertexaisearch.cloud.google.com/...` : ils
 * sont gardés tels quels dans les citations (comme à J0) et résolus par
 * src/redirects.ts (cache partagé avec vis-sync, appliqué à la lecture).
 */
import { citationsFromOpenRouter, textFromOpenRouter } from "./extract.js";
import { postJson } from "./http.js";
import { isObj, MAX_OUTPUT_TOKENS, str, type ProviderCallResult, type ProviderImpl } from "./types.js";

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Elmo envoyait HTTP-Referer (APP_URL ou son dépôt) et X-Title « Elmo AEO ». */
export const OPENROUTER_APP_HEADERS = { "X-Title": "OIA Visibility" };

export function openrouterSlug(model: string, webSearch: boolean): string {
  return webSearch && !model.includes(":online") ? `${model}:online` : model;
}

/**
 * Grok (x-ai/…) : avec « :online », OpenRouter passe par la recherche native de xAI, facturée à
 * la source consultée (2,27 $ pour une seule réponse le 16 novembre 2026). Pour Grok seulement,
 * recherche web d'OpenRouter (Exa) plafonnée à 5 résultats : environ 0,02 $ par appel.
 */
export const GROK_WEB_PLUGIN = { id: "web", engine: "exa", max_results: 5 } as const;

export function openrouterRequestBody(model: string, prompt: string, webSearch: boolean): Record<string, unknown> {
  if (webSearch && model.replace(/:online$/, "").startsWith("x-ai/")) {
    return { model: model.replace(/:online$/, ""), messages: [{ role: "user", content: prompt }], max_tokens: MAX_OUTPUT_TOKENS, plugins: [GROK_WEB_PLUGIN] };
  }
  return { model: openrouterSlug(model, webSearch), messages: [{ role: "user", content: prompt }], max_tokens: MAX_OUTPUT_TOKENS };
}

export const openrouterProvider: ProviderImpl = {
  id: "openrouter",
  keyEnv: "OPENROUTER_API_KEY",
  async call({ fetch, sleep, apiKey, model, webSearch, prompt }): Promise<ProviderCallResult> {
    const { data, attempts } = await postJson({
      fetch,
      sleep,
      url: OPENROUTER_URL,
      headers: { Authorization: `Bearer ${apiKey}`, ...OPENROUTER_APP_HEADERS },
      body: openrouterRequestBody(model, prompt, webSearch),
      label: "openrouter",
      secrets: [apiKey],
    });
    const raw = isObj(data) ? data : {};
    const choice = Array.isArray(raw.choices) ? raw.choices[0] : undefined;
    const finish = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
    const notes: string[] = [];
    if (finish === "length") notes.push("plafond de jetons de sortie atteint : réponse peut-être tronquée");
    const text = textFromOpenRouter(raw);
    if (!text) notes.push("réponse sans texte");
    const citations = citationsFromOpenRouter(raw);
    const usage = isObj(raw.usage) ? raw.usage : undefined;
    const tool = usage && isObj(usage.server_tool_use_details) ? usage.server_tool_use_details : undefined;
    return {
      calls: [
        {
          raw: data,
          usage,
          searchItems: tool ? Number(tool.web_search_requests) || 0 : webSearch ? 1 : 0,
          servedModel: str(raw.model, model.replace(":online", "")),
          httpAttempts: attempts,
          role: "initial",
        },
      ],
      text,
      citations,
      // OpenRouter ne donne pas les requêtes lancées par le modèle (Elmo, l. 146-147).
      webQueries: [],
      runId: str(raw.id, ""),
      finishReason: finish,
      notes,
      extra: {
        upstreamProvider: str(raw.provider, ""),
        billedUsd: usage && typeof usage.cost === "number" ? usage.cost : null,
      },
    };
  },
};
