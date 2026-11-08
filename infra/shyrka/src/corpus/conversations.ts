import { execFile } from "node:child_process";
import { decouper, type Passage } from "./extraction.js";

/**
 * Exports officiels de conversations d'IA (ChatGPT, Claude), en ZIP : une
 * conversation = un document. Le ZIP n'est jamais décompressé sur disque :
 * on liste ses entrées (taille, chemin), puis on lit `conversations.json`
 * sur la sortie standard de `unzip` (macOS), borné en taille.
 */

const TAILLE_MAX_JSON = 800 * 1024 * 1024;

export interface Message {
  auteur: "Mickaël" | "IA";
  texte: string;
  date: string | null;
}

export interface Conversation {
  id: string;
  titre: string;
  date: string;
  messages: Message[];
}

export class RefusExport extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

const executer = (args: string[], max = 64 * 1024 * 1024) =>
  new Promise<string>((ok, ko) => execFile("/usr/bin/unzip", args, { maxBuffer: max, timeout: 300_000, encoding: "utf8" }, (e, sortie) => (e ? ko(e) : ok(sortie))));

/** Vérifie le ZIP (entrées, tailles, chemins) et rend le contenu de `conversations.json`, en mémoire. */
export async function lireExport(zip: string): Promise<{ fournisseur: "chatgpt" | "claude"; conversations: Conversation[] }> {
  let liste: string;
  try {
    liste = await executer(["-l", zip]);
  } catch {
    throw new RefusExport("zip_illisible", "Archive illisible ou abîmée.");
  }
  const entrees = liste
    .split("\n")
    .map((l) => /^\s*(\d+)\s+\S+\s+\S+\s+(.+)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m && m[2] !== "Name" && !/^-+$/.test(m[2]!))
    .map((m) => ({ taille: Number(m[1]), nom: m[2]!.trim() }));
  if (entrees.some((e) => e.nom.startsWith("/") || e.nom.split("/").includes(".."))) throw new RefusExport("chemin_piege", "Archive avec des chemins piégés : refusée.");
  const json = entrees.find((e) => /(^|\/)conversations\.json$/.test(e.nom));
  if (!json) throw new RefusExport("pas_un_export", "Pas de conversations.json : ce n'est pas un export ChatGPT ou Claude.");
  if (json.taille > TAILLE_MAX_JSON) throw new RefusExport("trop_grand", "conversations.json dépasse 800 Mo : refusé.");
  let brut: string;
  try {
    brut = await executer(["-p", zip, json.nom], json.taille + 1024 * 1024);
  } catch {
    throw new RefusExport("zip_illisible", "conversations.json illisible dans l'archive.");
  }
  let donnees: unknown;
  try {
    donnees = JSON.parse(brut);
  } catch {
    throw new RefusExport("json_invalide", "conversations.json n'est pas un JSON valide.");
  }
  if (!Array.isArray(donnees)) throw new RefusExport("format_inconnu", "Format d'export inconnu.");
  const claude = donnees.some((c) => c && typeof c === "object" && "chat_messages" in c);
  return { fournisseur: claude ? "claude" : "chatgpt", conversations: (claude ? donnees.map(depuisClaude) : donnees.map(depuisChatgpt)).filter((c): c is Conversation => !!c && c.messages.length > 0) };
}

const date = (x: unknown) => (typeof x === "number" ? new Date(x * 1000).toISOString() : typeof x === "string" && !Number.isNaN(Date.parse(x)) ? new Date(x).toISOString() : null);

type NoeudChatgpt = { message?: { author?: { role?: string }; content?: { parts?: unknown[] }; create_time?: number }; parent?: string | null };

/** ChatGPT : `mapping` en arbre ; on suit la branche courante depuis `current_node`. */
function depuisChatgpt(c: unknown): Conversation | null {
  if (!c || typeof c !== "object") return null;
  const o = c as { id?: string; conversation_id?: string; title?: string; create_time?: number; current_node?: string; mapping?: Record<string, NoeudChatgpt> };
  const mapping = o.mapping ?? {};
  const chaine: NoeudChatgpt[] = [];
  let n = o.current_node;
  const vus = new Set<string>();
  while (n && mapping[n] && !vus.has(n)) {
    vus.add(n);
    chaine.unshift(mapping[n]!);
    n = mapping[n]!.parent ?? undefined;
  }
  const messages: Message[] = [];
  for (const noeud of chaine) {
    const role = noeud.message?.author?.role;
    if (role !== "user" && role !== "assistant") continue;
    const texte = (noeud.message?.content?.parts ?? []).filter((p): p is string => typeof p === "string").join("\n").trim();
    if (texte) messages.push({ auteur: role === "user" ? "Mickaël" : "IA", texte, date: date(noeud.message?.create_time) });
  }
  const id = o.conversation_id ?? o.id;
  return id ? { id: String(id), titre: (o.title ?? "Sans titre").slice(0, 200), date: date(o.create_time) ?? new Date(0).toISOString(), messages } : null;
}

/** Claude : `chat_messages` en liste ; texte direct ou blocs `content` de type texte. */
function depuisClaude(c: unknown): Conversation | null {
  if (!c || typeof c !== "object") return null;
  const o = c as { uuid?: string; name?: string; created_at?: string; chat_messages?: { sender?: string; text?: string; content?: { type?: string; text?: string }[]; created_at?: string }[] };
  const messages: Message[] = (o.chat_messages ?? [])
    .map((m) => ({ auteur: (m.sender === "human" ? "Mickaël" : "IA") as Message["auteur"], texte: (m.text || (m.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("\n")).trim(), date: date(m.created_at) }))
    .filter((m) => m.texte);
  return o.uuid ? { id: o.uuid, titre: (o.name || "Sans titre").slice(0, 200), date: date(o.created_at) ?? new Date(0).toISOString(), messages } : null;
}

/** Texte d'une conversation (contrôles, niveau proposé). */
export const texteConversation = (c: Conversation) => c.messages.map((m) => `${m.auteur} : ${m.texte}`).join("\n\n");

/** Passages : messages regroupés jusqu'à 900 caractères ; référence « messages 3–5 » (vérifiable dans l'export). */
export function passagesConversation(c: Conversation): Passage[] {
  const out: Passage[] = [];
  let debut = 0;
  let tampon: string[] = [];
  const pousser = (fin: number) => {
    if (!tampon.length) return;
    const ref = debut + 1 === fin ? `message ${fin}` : `messages ${debut + 1}–${fin}`;
    for (const m of decouper(tampon.join("\n"))) out.push({ section: c.titre, ref, ligne: 0, texte: m });
    tampon = [];
  };
  c.messages.forEach((m, i) => {
    const t = `${m.auteur} : ${m.texte}`;
    if (tampon.join("\n").length + t.length > 900 && tampon.length) {
      pousser(i);
      debut = i;
    }
    tampon.push(t);
  });
  pousser(c.messages.length);
  return out;
}
