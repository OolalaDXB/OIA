/**
 * Serveur MCP « oia-depot » : lecture seule du dépôt GitHub d'un site, pour les agents d'OIA
 * (SEO Command technique, contenu, conversion) et pour Claude.
 *
 * - Transport stdio, JSON-RPC 2.0 ligne par ligne, sans dépendance (pas de SDK à auditer).
 * - Lecture seule : aucun outil n'écrit, ne pousse ni n'exécute quoi que ce soit du dépôt.
 * - Liste blanche obligatoire : OIA_DEPOTS="proprietaire/nom,proprietaire/autre". Hors liste : refus.
 * - Jeton facultatif OIA_DEPOTS_TOKEN (dépôts privés, droits Contents: read), jamais renvoyé.
 * - Le contenu des fichiers sensibles (.env, clés…) n'est jamais lu ni renvoyé.
 *
 * Lancement : npx tsx infra/visibility/src/mcp/depot-server.ts
 */
import { createInterface } from "node:readline";
import { criteresDeterministes, notes } from "../contenu/note.js";
import { chercher, estSensible, lireDepotGithub, parseDepot, type GithubFetch, type LectureDepot } from "../repo/github.js";

export interface ServeurDepotOptions {
  autorises: string[];
  token?: string | null;
  fetch?: GithubFetch;
  /** Durée de vie du cache d'une lecture (ms). */
  cacheMs?: number;
  now?: () => number;
}

type Outil = { name: string; description: string; inputSchema: Record<string, unknown> };

const DEPOT = { type: "string", description: "Dépôt GitHub « proprietaire/nom » (doit être autorisé)." };
export const OUTILS: Outil[] = [
  { name: "depot_infos", description: "Branche, commit, visibilité, nombre de fichiers, fichiers sensibles versionnés (chemins seulement).", inputSchema: { type: "object", properties: { depot: DEPOT, branche: { type: "string" } }, required: ["depot"] } },
  { name: "depot_arborescence", description: "Liste des fichiers (chemin, taille, lu ou non), filtrable par préfixe.", inputSchema: { type: "object", properties: { depot: DEPOT, prefixe: { type: "string" }, max: { type: "number" } }, required: ["depot"] } },
  { name: "depot_lire", description: "Contenu d'un fichier texte du dépôt (lignes numérotées, tranche bornée). Refuse les fichiers sensibles.", inputSchema: { type: "object", properties: { depot: DEPOT, chemin: { type: "string" }, debut: { type: "number" }, lignes: { type: "number" } }, required: ["depot", "chemin"] } },
  { name: "depot_chercher", description: "Recherche littérale (insensible à la casse) dans les fichiers texte lus.", inputSchema: { type: "object", properties: { depot: DEPOT, motif: { type: "string" }, max: { type: "number" } }, required: ["depot", "motif"] } },
  { name: "depot_note_technique", description: "Critères déterministes (technique, fonctionnel, part du commercial) calculés sur les pages HTML du dépôt, sans modèle ni coût.", inputSchema: { type: "object", properties: { depot: DEPOT }, required: ["depot"] } },
];

export function creerServeurDepot(o: ServeurDepotOptions) {
  const autorises = new Set(o.autorises.map((d) => { const r = parseDepot(d); return `${r.proprietaire}/${r.nom}`.toLowerCase(); }));
  const cache = new Map<string, { le: number; l: LectureDepot }>();
  const now = o.now ?? Date.now;
  const lecture = async (depot: unknown, branche?: unknown): Promise<LectureDepot> => {
    if (typeof depot !== "string") throw new Error("depot attendu");
    const r = parseDepot(depot);
    const cle = `${r.proprietaire}/${r.nom}`.toLowerCase();
    if (!autorises.has(cle)) throw new Error(`dépôt non autorisé : ${r.proprietaire}/${r.nom} (OIA_DEPOTS)`);
    const k = `${cle}@${typeof branche === "string" ? branche : ""}`;
    const c = cache.get(k);
    if (c && now() - c.le < (o.cacheMs ?? 10 * 60_000)) return c.l;
    const l = await lireDepotGithub({ depot: `${r.proprietaire}/${r.nom}`, branche: typeof branche === "string" ? branche : null, token: o.token, fetch: o.fetch });
    cache.set(k, { le: now(), l });
    return l;
  };
  const borne = (v: unknown, def: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), max) : def);

  async function appeler(nom: string, a: Record<string, unknown>): Promise<unknown> {
    switch (nom) {
      case "depot_infos": {
        const l = await lecture(a.depot, a.branche);
        return { depot: l.depot, branche: l.branche, sha: l.sha, prive: l.prive, fichiers: l.fichiers.length, lus: l.fichiers.filter((f) => f.contenu !== undefined).length, sensibles: l.ignores.filter((i) => i.raison === "sensible").map((i) => i.chemin), tronque: l.tronque };
      }
      case "depot_arborescence": {
        const l = await lecture(a.depot);
        const p = typeof a.prefixe === "string" ? a.prefixe : "";
        const f = l.fichiers.filter((x) => x.chemin.startsWith(p));
        const max = borne(a.max, 300, 2000);
        return { total: f.length, fichiers: f.slice(0, max).map((x) => ({ chemin: x.chemin, taille: x.taille, lu: x.contenu !== undefined })) };
      }
      case "depot_lire": {
        if (typeof a.chemin !== "string") throw new Error("chemin attendu");
        if (estSensible(a.chemin)) throw new Error("fichier sensible : contenu jamais lu");
        const l = await lecture(a.depot);
        const f = l.fichiers.find((x) => x.chemin === a.chemin);
        if (!f) throw new Error("fichier introuvable");
        if (f.contenu === undefined) throw new Error(`fichier non lu (${l.ignores.find((i) => i.chemin === f.chemin)?.raison ?? "inconnu"})`);
        const lignes = f.contenu.split("\n");
        const debut = borne(a.debut, 1, lignes.length);
        const n = borne(a.lignes, 400, 2000);
        return { chemin: f.chemin, lignes: lignes.length, texte: lignes.slice(debut - 1, debut - 1 + n).map((x, i) => `${debut + i}\t${x}`).join("\n") };
      }
      case "depot_chercher": {
        if (typeof a.motif !== "string") throw new Error("motif attendu");
        const l = await lecture(a.depot);
        return { resultats: chercher(l, a.motif, borne(a.max, 50, 200)) };
      }
      case "depot_note_technique": {
        const l = await lecture(a.depot);
        // Pages publiques seulement (pas l'administration, les gabarits d'e-mail ni la doc), accueil en premier.
        const prive = /(^|\/)(admin|emails?|docs?|scripts|supabase|templates?|partials?|node_modules|tests?)\//i;
        const pages = l.fichiers
          .filter((f) => f.contenu !== undefined && /\.html?$/i.test(f.chemin) && !prive.test(f.chemin))
          .sort((a, b) => Number(/^(public\/)?index\.html?$/i.test(b.chemin)) - Number(/^(public\/)?index\.html?$/i.test(a.chemin)))
          .map((f) => ({ url: `https://depot.invalid/${f.chemin.replace(/^public\//, "").replace(/^index\.html?$/i, "")}`, html: f.contenu! }));
        const c = criteresDeterministes(pages, l);
        return { sha: l.sha, pages: pages.length, notes: notes(c), criteres: c.map((x) => ({ id: x.id, axe: x.axe, titre: x.titre, ok: x.ok, valeur: x.valeur, correction: x.correction })) };
      }
      default:
        throw Object.assign(new Error(`outil inconnu : ${nom}`), { code: -32602 });
    }
  }

  /** Traite un message JSON-RPC ; null pour une notification (pas de réponse). */
  async function traiter(m: { jsonrpc?: string; id?: number | string | null; method?: string; params?: Record<string, unknown> }): Promise<Record<string, unknown> | null> {
    const id = m.id ?? null;
    const ok = (result: unknown) => ({ jsonrpc: "2.0", id, result });
    if (m.id === undefined) return null;
    switch (m.method) {
      case "initialize":
        return ok({ protocolVersion: typeof m.params?.protocolVersion === "string" ? m.params.protocolVersion : "2025-06-18", capabilities: { tools: {} }, serverInfo: { name: "oia-depot", version: "1.0.0" }, instructions: "Lecture seule des dépôts GitHub des sites suivis par OIA Visibility. Aucun outil n'écrit." });
      case "ping":
        return ok({});
      case "tools/list":
        return ok({ tools: OUTILS });
      case "tools/call": {
        const nom = String(m.params?.name ?? "");
        try {
          const r = await appeler(nom, (m.params?.arguments as Record<string, unknown>) ?? {});
          return ok({ content: [{ type: "text", text: JSON.stringify(r, null, 2) }] });
        } catch (err) {
          const e = err as Error & { code?: number };
          if (e.code === -32602) return { jsonrpc: "2.0", id, error: { code: -32602, message: e.message } };
          return ok({ content: [{ type: "text", text: e.message.replace(o.token ?? "\u0000", "***") }], isError: true });
        }
      }
      default:
        return { jsonrpc: "2.0", id, error: { code: -32601, message: `méthode inconnue : ${m.method}` } };
    }
  }
  return { traiter, appeler };
}

// Lancement direct : stdio.
if (process.argv[1] && /depot-server\.(ts|js)$/.test(process.argv[1])) {
  const autorises = (process.env.OIA_DEPOTS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const serveur = creerServeurDepot({ autorises, token: process.env.OIA_DEPOTS_TOKEN || null });
  const rl = createInterface({ input: process.stdin });
  rl.on("line", async (ligne) => {
    if (!ligne.trim()) return;
    let m: Parameters<typeof serveur.traiter>[0];
    try {
      m = JSON.parse(ligne);
    } catch {
      process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "JSON illisible" } })}\n`);
      return;
    }
    const r = await serveur.traiter(m);
    if (r) process.stdout.write(`${JSON.stringify(r)}\n`);
  });
}
