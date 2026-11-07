import type { ChatMessage, TextModel } from "../types.js";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** Refuse toute adresse qui ne désigne pas la machine elle-même. */
export function assertLoopback(url: string): URL {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    throw new Error(`Ollama : adresse invalide (${url}).`);
  }
  if (u.protocol !== "http:" || !LOOPBACK.has(u.hostname)) {
    throw new Error(`Ollama : seule une adresse locale est acceptée (http://127.0.0.1:11434), reçu ${u.origin}.`);
  }
  return u;
}

/** Retire un bloc de raisonnement laissé dans la réponse par une version d'Ollama qui ignore `think`. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

/** Modèle par défaut de Shyrka 1, et modèle de comparaison proposé (bibliothèque Ollama). */
export const DEFAULT_OLLAMA_MODEL = "qwen3:8b";
export const COMPARISON_OLLAMA_MODEL = "mistral-small";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>;

/**
 * Modèle texte servi par Ollama sur le Mac Studio. Local par construction :
 * l'adaptateur refuse toute adresse non locale (roadmap, Ollama local :
 * aucune donnée sensible envoyée dehors).
 */
export class OllamaTextModel implements TextModel {
  readonly name: string;
  private readonly base: URL;

  constructor(
    private readonly opts: {
      model: string;
      url?: string;
      temperature?: number;
      timeoutMs?: number;
      fetch?: FetchLike;
      /** Raisonnement visible des modèles qui en ont un (qwen3). Coupé par défaut : réponses courtes, latence basse. */
      think?: boolean;
      /** Fenêtre de contexte demandée à Ollama. Assez large pour le cadre lu en entier et la liste des décisions. */
      numCtx?: number;
    },
  ) {
    if (!opts.model) throw new Error("Ollama : nom de modèle requis (voir `ollama list`).");
    this.base = assertLoopback(opts.url ?? "http://127.0.0.1:11434");
    this.name = `ollama:${opts.model}`;
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const f = this.opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.opts.timeoutMs ?? 120_000);
    let res: Awaited<ReturnType<FetchLike>>;
    try {
      res = await f(new URL("/api/chat", this.base).toString(), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.opts.model, messages, stream: false, think: this.opts.think ?? false, options: { temperature: this.opts.temperature ?? 0.4, num_ctx: this.opts.numCtx ?? 16_384 } }),
        signal: ctrl.signal,
      });
    } catch (e) {
      clearTimeout(timer);
      throw new Error(`Ollama injoignable sur ${this.base.origin} (${(e as Error).message}). Lancer l'application Ollama ou \`ollama serve\`.`);
    }
    try {
      if (!res.ok) throw new Error(`Ollama : HTTP ${res.status}. ${(await res.text()).slice(0, 200)}`);
      const body = (await res.json()) as { message?: { content?: unknown } };
      const content = body?.message?.content;
      if (typeof content !== "string") throw new Error("Ollama : réponse sans message.content.");
      return stripThinking(content);
    } finally {
      clearTimeout(timer);
    }
  }
}
