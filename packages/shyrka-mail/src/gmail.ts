import { readFileSync } from "node:fs";
import { horsDepot } from "./chemins.js";
import type { BoiteAuxLettres, Brouillon, EnteteMessage, Message } from "./types.js";

/**
 * Adaptateur Gmail, écrit mais non connecté : la connexion OAuth sera faite
 * par Mickaël (docs/shyrka/adr/0001-agent-courrier.md).
 *
 * Trois routes seulement : liste des messages, lecture d'un message,
 * création d'un brouillon. Aucune route d'envoi : un test vérifie qu'aucun
 * chemin de ce paquet ne mène à une route d'envoi de l'API Gmail.
 */
export const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

/** Périmètres demandés à Google. `gmail.compose` est nécessaire aux brouillons ; voir l'ADR sur l'envoi. */
export const PERIMETRES_GMAIL = ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"] as const;

const ENTETES = ["From", "To", "Cc", "Subject", "Date", "Reply-To", "Sender", "Return-Path", "Received", "X-Forwarded-For", "X-Original-From"];

type Fetch = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

interface Partie {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: Partie[];
}

const b64url = (s: string) => Buffer.from(s, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const deb64url = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");

function entetesDe(p: Partie): Record<string, string[]> {
  const r: Record<string, string[]> = {};
  for (const h of p.headers ?? []) (r[h.name] ??= []).push(h.value);
  return r;
}

function versEntete(id: string, payload: Partie): EnteteMessage {
  const h = entetesDe(payload);
  const un = (n: string) => h[n]?.[0] ?? "";
  const pj: string[] = [];
  const parcourir = (p: Partie) => {
    if (p.filename) pj.push(p.filename);
    p.parts?.forEach(parcourir);
  };
  parcourir(payload);
  const autres: Record<string, string[]> = {};
  for (const n of ["Reply-To", "Sender", "Return-Path", "Received", "X-Forwarded-For", "X-Original-From"]) if (h[n]) autres[n] = h[n]!;
  return { id, de: un("From"), a: h.To ?? [], cc: h.Cc ?? [], objet: un("Subject"), date: un("Date"), piecesJointes: pj, autresEntetes: autres };
}

function texteDe(p: Partie): string {
  const morceaux: string[] = [];
  const parcourir = (q: Partie) => {
    if (q.mimeType?.startsWith("text/") && q.body?.data) morceaux.push(deb64url(q.body.data));
    q.parts?.forEach(parcourir);
  };
  parcourir(p);
  return morceaux.join("\n");
}

export class BoiteGmail implements BoiteAuxLettres {
  constructor(
    private readonly opts: {
      /** Fournit un jeton d'accès valide. Jeton conservé hors du dépôt. */
      jeton: () => Promise<string>;
      fetch?: Fetch;
    },
  ) {}

  /** Lit un jeton depuis un fichier situé hors du dépôt (refus sinon). */
  static jetonDepuisFichier(chemin: string): () => Promise<string> {
    const reel = horsDepot(chemin);
    return async () => (JSON.parse(readFileSync(reel, "utf8")) as { access_token: string }).access_token;
  }

  private async appeler(chemin: string, init?: { method?: string; body?: string }): Promise<unknown> {
    const f = this.opts.fetch ?? (globalThis.fetch as unknown as Fetch);
    const r = await f(`${GMAIL_API}${chemin}`, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${await this.opts.jeton()}`, "content-type": "application/json" },
      ...(init?.body ? { body: init.body } : {}),
    });
    if (!r.ok) throw new Error(`Gmail : HTTP ${r.status} sur ${chemin.split("?")[0]}.`);
    return r.json();
  }

  async lister({ limite }: { limite: number }): Promise<EnteteMessage[]> {
    const liste = (await this.appeler(`/messages?maxResults=${Math.min(limite, 100)}&q=${encodeURIComponent("in:inbox is:unread")}`)) as { messages?: { id: string }[] };
    const out: EnteteMessage[] = [];
    for (const { id } of liste.messages ?? []) {
      const m = (await this.appeler(`/messages/${id}?format=metadata&${ENTETES.map((h) => `metadataHeaders=${h}`).join("&")}`)) as { payload: Partie };
      out.push(versEntete(id, m.payload));
    }
    return out;
  }

  async lire(id: string): Promise<Message> {
    const m = (await this.appeler(`/messages/${encodeURIComponent(id)}?format=full`)) as { payload: Partie };
    return { ...versEntete(id, m.payload), corps: texteDe(m.payload) };
  }

  async creerBrouillon(b: Brouillon): Promise<{ id: string }> {
    const brut = [`To: ${b.a}`, `Subject: ${b.objet}`, "Content-Type: text/plain; charset=utf-8", "", b.corps].join("\r\n");
    const r = (await this.appeler(`/drafts`, { method: "POST", body: JSON.stringify({ message: { raw: b64url(brut), threadId: b.enReponseA } }) })) as { id: string };
    return { id: r.id };
  }
}
