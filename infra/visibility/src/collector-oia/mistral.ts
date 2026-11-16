/*
 * Repris d'Elmo : elmo v0.7.7, commit 5e76f422, packages/lib/src/providers/registry/mistral-api.ts
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
 * Mistral par l'API Conversations (cible `mistral:mistral-api:<modèle>:online`).
 *
 * Réglages d'Elmo (registry/mistral-api.ts, l. 92-103) : `POST /v1/conversations`,
 * `inputs` = la question, outil `web_search`, `completion_args.max_tokens: 8000`,
 * aucun prompt système. Le connecteur web de Mistral n'a pas de limite de recherches
 * par appel : à J0, jusqu'à 37 recherches pour une réponse (src/cost-grid.ts).
 *
 * Pourquoi Elmo a laissé 15 réponses sans texte (14 du panel de J0, 1 hors panel),
 * relevé dans sa base : aucune n'a de texte dans `raw_output`. Leur suite d'entrées est
 * toujours `message.output` [`thinking` seul] puis 3 à 5 `tool.execution` (deux ont en
 * plus un second `message.output` [`thinking`] suivi d'autres `tool.execution`), et
 * jamais de `message.output` final avec un morceau `text`. Les réponses avec texte
 * finissent toutes par `message.output` [`thinking` + `text`]. La conversation s'est
 * donc arrêtée après les recherches, SANS RÉPONSE FINALE : ce n'est pas un défaut
 * d'extraction. Elmo ne fait qu'un appel (registry/mistral-api.ts, l. 97-103), sans
 * moyen de reprendre ; son extracteur renvoie alors « No text content found in Mistral
 * output. », que `storableText` (text-extraction.ts, l. 424-427) change en NULL. Les
 * 200 à 300 jetons de sortie facturés sont ceux du raisonnement.
 *
 * Écart volontaire : quand aucun morceau `text` ne suit la dernière `tool.execution`,
 * OIA demande la suite de la MÊME conversation (`POST /v1/conversations/{id}`, sans
 * nouvelle entrée, l'exemple de la documentation de Mistral étant un corps vide), au
 * plus MISTRAL_MAX_CONTINUATIONS fois. La documentation ne donne aucun paramètre de
 * complétion pour borner les tours d'outil ou forcer une réponse finale ; aucune
 * question n'est ajoutée : le modèle continue sur ses propres résultats de recherche.
 * Chaque suite est facturée, chiffrée et gardée. Jamais essayé contre l'API réelle : à
 * vérifier au premier appel payant (docs/collecteur-oia-direct.md). Sans réponse finale
 * après les suites, la preuve est consignée « sans réponse finale », avec le texte
 * éventuel rédigé avant les recherches, et rien n'est inventé.
 *
 * Mistral Large 4 ne renvoie pas ses sources : aucun morceau `tool_reference` dans
 * les 56 réponses de la base d'Elmo. Les pages que l'outil de recherche a renvoyées
 * (`tool.execution` → `info.result`) sont gardées à part, comme pages consultées, et
 * jamais comptées comme citations.
 */
import { citationsFromMistral, searchResultsFromMistral, textFromMistral, thinkingFromMistral, webQueriesFromMistral } from "./extract.js";
import { postJson } from "./http.js";
import { isObj, MAX_OUTPUT_TOKENS, str, type BilledCall, type ProviderCallResult, type ProviderImpl } from "./types.js";

export const MISTRAL_BASE_URL = "https://api.mistral.ai";
export const MISTRAL_MAX_CONTINUATIONS = 2;

export function mistralRequestBody(model: string, prompt: string, webSearch: boolean): Record<string, unknown> {
  // Sans recherche, Elmo passe par /v1/chat/completions ; les cibles de mesure sont toutes :online.
  if (!webSearch) throw new Error("mistral-api : seule la collecte avec recherche web (:online) est prise en charge");
  return { model, inputs: prompt, tools: [{ type: "web_search" }], completion_args: { max_tokens: MAX_OUTPUT_TOKENS } };
}

const outputs = (raw: unknown): any[] => (isObj(raw) && Array.isArray(raw.outputs) ? raw.outputs : []);

const hasText = (entry: any): boolean =>
  entry?.type === "message.output" &&
  ((typeof entry.content === "string" && entry.content.trim() !== "") ||
    (Array.isArray(entry.content) && entry.content.some((c: any) => c?.type === "text" && typeof c.text === "string" && c.text.trim() !== "")));

/** Réponse finale : un morceau de texte APRÈS la dernière exécution d'outil (ou sans aucune). */
export function hasFinalAnswer(raw: unknown): boolean {
  const list = outputs(raw);
  let lastTool = -1;
  list.forEach((e, i) => {
    if (e?.type === "tool.execution") lastTool = i;
  });
  return list.slice(lastTool + 1).some(hasText);
}

/** Version servie : la conversation n'a pas de `model` en tête, ses entrées en ont un. */
function servedModel(raw: unknown, fallback: string): string {
  const m = outputs(raw).find((e) => typeof e?.model === "string" && e.model);
  return str(m?.model, fallback);
}

function searchCount(raw: unknown): number {
  return outputs(raw).filter((e) => e?.type === "tool.execution" && e?.name === "web_search").length;
}

export const mistralProvider: ProviderImpl = {
  id: "mistral-api",
  keyEnv: "MISTRAL_API_KEY",
  async call({ fetch, sleep, apiKey, model, webSearch, prompt }): Promise<ProviderCallResult> {
    const post = (path: string, body: unknown) =>
      postJson({ fetch, sleep, url: `${MISTRAL_BASE_URL}${path}`, headers: { Authorization: `Bearer ${apiKey}` }, body, label: "mistral-api", secrets: [apiKey] });
    const calls: BilledCall[] = [];
    const notes: string[] = [];
    const record = (data: unknown, attempts: number, role: BilledCall["role"]) => {
      calls.push({ raw: data, usage: isObj(data) ? data.usage : undefined, searchItems: searchCount(data), servedModel: servedModel(data, model), httpAttempts: attempts, role });
    };
    const first = await post("/v1/conversations", mistralRequestBody(model, prompt, webSearch));
    record(first.data, first.attempts, "initial");
    const conversationId = isObj(first.data) ? str(first.data.conversation_id, "") : "";
    // Texte et sources sur l'ensemble des appels : la suite ne renvoie que les nouvelles entrées.
    const all = () => ({ outputs: calls.flatMap((c) => outputs(c.raw)) });
    let continuations = 0;
    while (!hasFinalAnswer(all()) && outputs(calls[calls.length - 1]!.raw).length > 0 && continuations < MISTRAL_MAX_CONTINUATIONS && conversationId) {
      continuations++;
      notes.push(`aucune réponse finale après les recherches : suite de la conversation demandée (${continuations}/${MISTRAL_MAX_CONTINUATIONS})`);
      const next = await post(`/v1/conversations/${encodeURIComponent(conversationId)}`, { completion_args: { max_tokens: MAX_OUTPUT_TOKENS } });
      record(next.data, next.attempts, "continuation");
    }
    const merged = all();
    const text = textFromMistral(merged);
    const finalAnswer = hasFinalAnswer(merged);
    let noTextReason: string | undefined;
    if (!finalAnswer) {
      noTextReason = `sans réponse finale : aucun texte après la dernière exécution d'outil, après ${continuations} suite(s)`;
      notes.push(noTextReason);
    }
    return {
      calls,
      text,
      citations: citationsFromMistral(merged),
      webQueries: webQueriesFromMistral(merged),
      runId: conversationId,
      // L'API Conversations ne donne pas de raison d'arrêt (Elmo, registry/mistral-api.ts, l. 93-96).
      finishReason: null,
      notes,
      extra: {
        continuations,
        finalAnswer,
        thinking: thinkingFromMistral(merged),
        searchResults: searchResultsFromMistral(merged),
        sourcesReturned: false,
        ...(noTextReason ? { noTextReason } : {}),
      },
    };
  },
};
