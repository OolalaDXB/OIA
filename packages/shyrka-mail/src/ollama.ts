import { GROUPES, type Classeur, type Groupe, type Message, type Redacteur } from "./types.js";

/** Ollama, à l'adresse locale seulement : le courrier ne quitte pas la machine. */
export function urlLocale(url: string): URL {
  const u = new URL(url);
  if (u.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]", "::1"].includes(u.hostname)) {
    throw new Error(`Ollama : seule une adresse locale est acceptée, reçu ${u.origin}.`);
  }
  return u;
}

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

async function chat(base: URL, model: string, system: string, user: string, f?: Fetch): Promise<string> {
  const r = await (f ?? (globalThis.fetch as unknown as Fetch))(new URL("/api/chat", base).toString(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: false, think: false, options: { temperature: 0.2 }, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!r.ok) throw new Error(`Ollama : HTTP ${r.status}.`);
  const c = ((await r.json()) as { message?: { content?: string } }).message?.content;
  if (typeof c !== "string") throw new Error("Ollama : réponse vide.");
  return c.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

const enTexte = (m: Message) => `De : ${m.de}\nObjet : ${m.objet}\n\n${m.corps.slice(0, 4000)}`;

export class ClasseurOllama implements Classeur {
  readonly nom: string;
  private readonly base: URL;
  constructor(private readonly opts: { model?: string; url?: string; fetch?: Fetch } = {}) {
    this.base = urlLocale(opts.url ?? "http://127.0.0.1:11434");
    this.nom = `ollama:${opts.model ?? "qwen3:8b"}`;
  }
  async classer(m: Message): Promise<Groupe> {
    const r = await chat(
      this.base,
      this.opts.model ?? "qwen3:8b",
      "Classe ce message reçu par Mickaël dans un seul groupe et réponds par ce seul mot : pour-toi (il doit le lire ou décider), reponse-simple (une réponse courte et sans engagement suffit), information (à savoir, rien à faire), bruit (publicité, notification sans intérêt).",
      enTexte(m),
      this.opts.fetch,
    );
    const g = GROUPES.find((x) => r.toLowerCase().includes(x));
    // En cas de doute, le message remonte à Mickaël.
    return g ?? "pour-toi";
  }
}

export class RedacteurOllama implements Redacteur {
  readonly nom: string;
  private readonly base: URL;
  constructor(private readonly opts: { model?: string; url?: string; fetch?: Fetch } = {}) {
    this.base = urlLocale(opts.url ?? "http://127.0.0.1:11434");
    this.nom = `ollama:${opts.model ?? "qwen3:8b"}`;
  }
  async rediger(m: Message, style: string): Promise<string> {
    return chat(
      this.base,
      this.opts.model ?? "qwen3:8b",
      [
        "Tu rédiges, pour Mickaël, un brouillon de réponse courte qu'il relira avant tout envoi. Tu écris en son nom, à la première personne, dans la langue du message reçu.",
        "Ne promets rien : ni prix, ni date, ni engagement. Pas de tiret cadratin. Sans signature.",
        style.trim() ? `Style de Mickaël :\n${style}` : "Style : sobre, poli, court.",
      ].join("\n"),
      enTexte(m),
      this.opts.fetch,
    );
  }
}
