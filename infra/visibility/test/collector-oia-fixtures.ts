/**
 * Réponses fictives des quatre fournisseurs, de la forme réelle relevée dans la base
 * d'Elmo (J0) et dans ses tests (elmo v0.7.7, packages/lib/src/providers/registry/*.test.ts).
 * Données fictives : aucun texte ni aucune URL ne vient d'une vraie réponse.
 */
import type { FetchLike } from "../src/collector-oia/http";

export interface SeenRequest {
  url: string;
  headers: Record<string, string>;
  body: any;
}

type Reply = { status: number; body: unknown; headers?: Record<string, string> } | Error;

/** fetch fictif : chaque URL a sa file de réponses ; toute URL inattendue échoue. */
export function fakeFetch(routes: Record<string, Reply[]>): { fetch: FetchLike; seen: SeenRequest[] } {
  const seen: SeenRequest[] = [];
  const fetch: FetchLike = async (url, init) => {
    seen.push({ url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const queue = routes[url];
    const next = queue?.shift();
    if (!next) throw new Error(`fetch fictif : aucune réponse prévue pour ${url}`);
    if (next instanceof Error) throw next;
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (n: string) => next.headers?.[n.toLowerCase()] ?? null },
      text: async () => text,
    };
  };
  return { fetch, seen };
}

export const ok = (body: unknown): Reply => ({ status: 200, body });

export const openaiResponse = {
  id: "resp_fictif_1",
  object: "response",
  status: "completed",
  model: "gpt-6-luna-2026-10-01",
  output: [
    { id: "rs_1", type: "reasoning", summary: [] },
    { id: "ws_1", type: "web_search_call", status: "completed", action: { type: "search", query: "demo tools", queries: ["demo tools", "best demo tools"] } },
    {
      id: "msg_1",
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "Rival Co is often cited. ([rival.example](https://rival.example/?utm_source=openai))",
          annotations: [
            { type: "url_citation", url: "https://rival.example/?utm_source=openai", title: "Rival" },
            { type: "url_citation", url: "https://rival.example/?utm_source=openai", title: "Rival (doublon)" },
          ],
        },
      ],
    },
  ],
  usage: { input_tokens: 12_000, output_tokens: 400, total_tokens: 12_400 },
};

export const anthropicResponse = {
  id: "msg_fictif_1",
  type: "message",
  role: "assistant",
  model: "claude-sonnet-5-5",
  stop_reason: "end_turn",
  content: [
    { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "demo tools" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "srvtoolu_1",
      content: [
        { type: "web_search_result", url: "https://a.example/page", title: "A", encrypted_content: "CONTENU-COMPLET", page_age: "2026-10-01" },
        { type: "web_search_result", url: "https://b.example/", title: "B", encrypted_content: "CONTENU-B" },
      ],
    },
    { type: "text", text: "Voici ce que j'ai trouvé." },
    { type: "text", text: "A est cité.", citations: [{ type: "web_search_result_location", url: "https://a.example/page", title: "A", cited_text: "…" }] },
  ],
  usage: { input_tokens: 10_000, output_tokens: 500, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, server_tool_use: { web_search_requests: 1 } },
};

export const anthropicSearchError = {
  ...anthropicResponse,
  id: "msg_fictif_err",
  content: [
    { type: "server_tool_use", id: "srvtoolu_0", name: "web_search", input: { query: "demo tools" } },
    { type: "web_search_tool_result", tool_use_id: "srvtoolu_0", content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" } },
    { type: "text", text: "Je n'ai pas pu chercher." },
  ],
  usage: { input_tokens: 800, output_tokens: 50, server_tool_use: { web_search_requests: 1 } },
};

const mistralToolExec = (query: string, url: string) => ({
  object: "entry",
  type: "tool.execution",
  model: "mistral-large-4",
  id: `tool_exec_${query.length}`,
  name: "web_search",
  arguments: JSON.stringify({ query, limit: 10 }),
  function: "web_search",
  info: { result: JSON.stringify({ "search-result://x1": { url, title: "Page consultée", source: "brave", description: "…" } }) },
});

const mistralThinking = {
  object: "entry",
  type: "message.output",
  model: "mistral-large-4",
  id: "msg_t",
  role: "assistant",
  content: [{ type: "thinking", thinking: [{ type: "text", text: "Je dois chercher sur le web." }], closed: true }],
};

/** Réponse complète : raisonnement, recherche, puis texte. */
export const mistralResponse = {
  object: "conversation.response",
  conversation_id: "conv_fictif_1",
  outputs: [
    mistralThinking,
    mistralToolExec("demo tools", "https://c.example/"),
    { object: "entry", type: "message.output", model: "mistral-large-4", id: "msg_2", role: "assistant", content: [{ type: "thinking", thinking: [{ type: "text", text: "Synthèse." }] }, { type: "text", text: "Rival Co est une option." }] },
  ],
  usage: { prompt_tokens: 900, completion_tokens: 300, total_tokens: 1200, connectors: { web_search: 1 } },
  guardrails: null,
};

/** Le cas qu'Elmo laissait sans texte : la réponse s'arrête sur une exécution d'outil. */
export const mistralStopsOnTool = {
  object: "conversation.response",
  conversation_id: "conv_fictif_2",
  outputs: [mistralThinking, mistralToolExec("demo tools", "https://c.example/"), mistralToolExec("demo tools pricing", "https://d.example/")],
  usage: { prompt_tokens: 751, completion_tokens: 245, total_tokens: 996, connectors: { web_search: 2 } },
  guardrails: null,
};

export const mistralContinuation = {
  object: "conversation.response",
  conversation_id: "conv_fictif_2",
  outputs: [{ object: "entry", type: "message.output", model: "mistral-large-4", id: "msg_3", role: "assistant", content: "Réponse rédigée après la recherche." }],
  usage: { prompt_tokens: 3000, completion_tokens: 200, total_tokens: 3200 },
};

export const geminiResponse = {
  id: "gen-fictif-1",
  provider: "Google",
  model: "google/gemini-3-flash-preview",
  object: "chat.completion",
  choices: [
    {
      finish_reason: "stop",
      message: {
        role: "assistant",
        content: "Rival Co est cité par plusieurs sites.",
        annotations: [
          { type: "url_citation", url_citation: { url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AAA", title: "rival.example", start_index: 0, end_index: 10 } },
          { type: "url_citation", url_citation: { url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/BBB", title: "e.example" } },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 21, completion_tokens: 663, total_tokens: 684, cost: 0.058, server_tool_use_details: { web_search_requests: 4 } },
};

export const perplexityResponse = {
  id: "gen-fictif-2",
  provider: "Perplexity",
  model: "perplexity/sonar",
  object: "chat.completion",
  choices: [
    {
      finish_reason: "stop",
      message: { role: "assistant", content: "Rival Co [1].", annotations: [{ type: "url_citation", url_citation: { url: "https://rival.example/coaching/", title: "Rival", content: "…" } }] },
    },
  ],
  usage: { prompt_tokens: 2662, completion_tokens: 524, total_tokens: 3186, cost: 0.01519 },
};

/**
 * Forme exacte des 15 réponses sans texte de la base d'Elmo : `message.output` [thinking seul],
 * 3 `tool.execution`, puis (pour deux d'entre elles) un second `message.output` [thinking] et
 * d'autres `tool.execution` ; jamais de `message.output` final avec un morceau `text`.
 */
export const mistralNoFinalAnswer = {
  object: "conversation.response",
  conversation_id: "conv_fictif_3",
  outputs: [
    mistralThinking,
    mistralToolExec("q1", "https://e1.example/"),
    mistralToolExec("q22", "https://e2.example/"),
    mistralToolExec("q333", "https://e3.example/"),
    { ...mistralThinking, id: "msg_t2", content: [{ type: "thinking", thinking: [{ type: "text", text: "Je cherche encore." }], closed: true }] },
    mistralToolExec("q4444", "https://e4.example/"),
    mistralToolExec("q55555", "https://e5.example/"),
  ],
  usage: { prompt_tokens: 758, completion_tokens: 300, total_tokens: 1058, connectors: { web_search: 5 } },
  guardrails: null,
};

/** Suite qui donne la réponse finale, comme les réponses complètes de J0 : thinking + text. */
export const mistralFinalAfterContinuation = {
  object: "conversation.response",
  conversation_id: "conv_fictif_3",
  outputs: [
    { object: "entry", type: "message.output", model: "mistral-large-4", id: "msg_f", role: "assistant", content: [{ type: "thinking", thinking: [{ type: "text", text: "Synthèse." }] }, { type: "text", text: "Réponse finale." }] },
  ],
  usage: { prompt_tokens: 4000, completion_tokens: 250, total_tokens: 4250 },
};
