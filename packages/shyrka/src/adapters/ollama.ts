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
    private readonly opts: { model: string; url?: string; temperature?: number; timeoutMs?: number; fetch?: FetchLike },
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
        body: JSON.stringify({ model: this.opts.model, messages, stream: false, options: { temperature: this.opts.temperature ?? 0.4 } }),
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
      return content;
    } finally {
      clearTimeout(timer);
    }
  }
}
