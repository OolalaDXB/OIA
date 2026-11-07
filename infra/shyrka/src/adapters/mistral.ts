import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { masquerSensibles, toucheSwift } from "../../../../packages/shyrka/src/serveur/filtre.ts";
import type { ChatMessage, TextModel } from "../types.js";

/**
 * Modèle texte servi par Mistral (API), pour `pnpm shyrka:parler -- --texte`
 * quand Ollama est absent du Mac (mandat v9, G5). Écart assumé au principe
 * « local par défaut » de l'ADR 0003 : seul le texte de la conversation et
 * le contexte d'OIA partent vers Mistral. Avant tout envoi, les lignes qui
 * touchent à Swift sont retirées du contexte, un message de Mickaël qui y
 * touche est refusé, et les données sensibles sont masquées.
 *
 * Clé : MISTRAL_API_KEY lue dans ~/.oia/mistral.env (chmod 600, hors du
 * dépôt), jamais affichée. SHYRKA_MISTRAL_CLE_FICHIER remplace le chemin.
 */
export const MISTRAL_MODELE_TEXTE = "mistral-large-latest";

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function lireCleMistral(fichier = process.env.SHYRKA_MISTRAL_CLE_FICHIER ?? join(homedir(), ".oia", "mistral.env")): string | null {
  try {
    const l = readFileSync(fichier, "utf8").split("\n").find((x) => x.startsWith("MISTRAL_API_KEY="));
    const v = l?.slice("MISTRAL_API_KEY=".length).trim().replace(/^['"]|['"]$/g, "");
    return v || null;
  } catch {
    return null;
  }
}

export class MistralTextModel implements TextModel {
  readonly name = `mistral:${MISTRAL_MODELE_TEXTE}`;
  constructor(private readonly opts: { cle: string; fetch?: FetchLike; maxTokens?: number }) {
    if (!opts.cle) throw new Error("Mistral : clé absente (~/.oia/mistral.env, MISTRAL_API_KEY=…).");
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const dernier = [...messages].reverse().find((m) => m.role === "user");
    if (dernier && toucheSwift(dernier.content)) return "Je ne traite rien qui touche à Swift. Rien n'a été envoyé.";
    const nettoyes = messages
      .filter((m) => m.role !== "user" || !toucheSwift(m.content))
      .map((m) => ({
        role: m.role,
        content: masquerSensibles(m.role === "system" ? m.content.split("\n").filter((l) => !toucheSwift(l)).join("\n") : m.content).texte,
      }));
    const f = this.opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    const res = await f("https://api.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.opts.cle}` },
      body: JSON.stringify({ model: MISTRAL_MODELE_TEXTE, messages: nettoyes, max_tokens: this.opts.maxTokens ?? 600, temperature: 0.2 }),
    });
    if (!res.ok) throw new Error(`Mistral : HTTP ${res.status}.`);
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const c = body.choices?.[0]?.message?.content;
    if (typeof c !== "string") throw new Error("Mistral : réponse sans contenu.");
    return c.trim();
  }
}

/** Ollama répond-il sur la machine ? (court délai, aucune donnée envoyée) */
export async function ollamaPresent(url: string): Promise<boolean> {
  try {
    const r = await fetch(new URL("/api/tags", url), { signal: AbortSignal.timeout(1500) });
    return r.ok;
  } catch {
    return false;
  }
}
