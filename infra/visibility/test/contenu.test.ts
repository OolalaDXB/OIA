import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { constatsContenu, criteresDeterministes, criteresModele, notes, noterContenu } from "../src/contenu/note";
import { chercher, estSensible, lireDepotGithub, parseDepot, type GithubFetch } from "../src/repo/github";
import { MemoryEngineDb } from "../src/engine/db";
import { runEngine } from "../src/engine/run";
import { noJudge } from "../src/judge";
import type { FetchedPage } from "../src/site/pages";

const BON = `<!doctype html><html lang="fr"><head><title>Studio Fictif · coaching de padel à Exempleville</title>
<meta name="description" content="Cours de padel pour débutants et confirmés à Exempleville, séances individuelles et en groupe, à partir de 40 €.">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script type="application/ld+json">{"@type":"LocalBusiness","name":"Studio Fictif"}</script></head>
<body><h1>Coaching de padel</h1><p>Séance d'essai à partir de 40 €. Témoignage : « super coach ».</p>
<a href="/padel">Padel</a><a href="/mentions-legales">Mentions légales</a><a href="tel:+33100000000">Appeler</a>
<a href="/reserver">Réserver une séance</a><img src="a.jpg" alt="terrain"></body></html>`;
const MAUVAIS = `<html><head><title>x</title></head><body><h1>a</h1><h1>b</h1><a href="#">Instagram</a><a href="/admin">admin</a><img src="b.jpg"></body></html>`;

describe("note du contenu : critères déterministes", () => {
  it("un site soigné réussit l'essentiel, un site bâclé échoue avec des constats précis", () => {
    const bon = criteresDeterministes([{ url: "https://studio-fictif.example/", html: BON }, { url: "https://studio-fictif.example/padel", html: BON.replace("Studio Fictif · coaching", "Padel · coaching") }], null);
    const ok = Object.fromEntries(bon.map((c) => [c.id, c.ok]));
    expect(ok).toMatchObject({ titres: true, viewport: true, "donnees-structurees": true, "contact-direct": true, conversion: true, "prix-visibles": true, "accueil-vers-offres": true, "liens-factices": true, "admin-public": true });
    const mauvais = criteresDeterministes([{ url: "https://bacle.example/", html: MAUVAIS }], null);
    const ids = constatsContenu(mauvais).map((c) => c.cle);
    expect(ids).toEqual(expect.arrayContaining(["contenu:titres", "contenu:h1", "contenu:langue", "contenu:liens-factices", "contenu:admin-public", "contenu:contact-direct", "contenu:prix-visibles"]));
    const n = notes(mauvais);
    expect(n.technique).toBeLessThan(30);
    expect(n.commercial).toBe(0);
  });

  it("le dépôt ajoute ses critères ; un .env versionné est critique, sans jamais lire son contenu", () => {
    const depot = { depot: "o/r", branche: "main", sha: "abc1234", prive: false, tronque: false, ignores: [], fichiers: [{ chemin: "index.html", taille: 10, contenu: BON }, { chemin: ".env", taille: 30 }, { chemin: "sitemap.xml", taille: 5, contenu: "<urlset/>" }] };
    const c = criteresDeterministes([{ url: "https://studio-fictif.example/", html: BON }], depot);
    const secrets = c.find((x) => x.id === "secrets-versionnes")!;
    expect(secrets.ok).toBe(false);
    expect(secrets.gravite).toBe("critique");
    expect(c.find((x) => x.id === "sitemap")!.ok).toBe(true);
    expect(c.find((x) => x.id === "llms-txt")!.ok).toBe(false);
  });
});

describe("note du contenu : grille du modèle", () => {
  const page = { url: "https://studio-fictif.example/", html: BON };
  const llm = (criteres: unknown[]) => ({
    name: "faux", defaultModel: "faux",
    async extract(req: { schema: { parse: (x: unknown) => unknown } }) {
      return { data: req.schema.parse({ criteres, synthese: "Synthèse fictive." }) as never, run: { provider: "faux", model: "faux", promptHash: "x" } };
    },
  });
  it("une note sans citation présente sur le site est annulée (non vérifiable)", async () => {
    const r = await criteresModele(llm([
      { id: "proposition-valeur", note: 2, citation: "Séance d'essai à partir de 40 €", justification: "Accroche claire." },
      { id: "differenciation", note: 2, citation: "Champion du monde trois fois", justification: "Inventé." },
      { id: "objections", note: 0, citation: null, justification: "Pas de FAQ." },
    ]) as never, { nom: "Studio Fictif", pages: [page], modele: "faux" });
    const by = Object.fromEntries(r.criteres.map((c) => [c.id, c]));
    expect(by["proposition-valeur"]!.ok).toBe(true);
    expect(by.differenciation!.ok).toBeNull();
    expect(by.differenciation!.valeur).toMatch(/non vérifiable/);
    expect(by.objections!.ok).toBe(false);
    expect(by.confiance!.ok).toBeNull();
  });
});

describe("dépôt GitHub en lecture seule", () => {
  it("refuse une adresse douteuse, reconnaît les secrets", () => {
    expect(parseDepot("https://github.com/OolalaDXB/coachgari.git")).toEqual({ proprietaire: "OolalaDXB", nom: "coachgari" });
    expect(() => parseDepot("o/../x")).toThrow();
    expect(() => parseDepot("https://evil.example/o/r")).toThrow();
    expect(estSensible("config/.env.production")).toBe(true);
    expect(estSensible(".env.example")).toBe(false);
    expect(estSensible("keys/server.pem")).toBe(true);
    expect(estSensible("index.html")).toBe(false);
  });

  it("lit les fichiers texte, ne télécharge jamais un fichier sensible, n'envoie le jeton qu'en en-tête", async () => {
    const appels: { url: string; auth?: string }[] = [];
    const f: GithubFetch = async (url, init) => {
      appels.push({ url, auth: init.headers.authorization });
      const rep = (o: unknown) => ({ ok: true, status: 200, text: async () => (typeof o === "string" ? o : JSON.stringify(o)) });
      if (url.endsWith("/repos/o/r")) return rep({ default_branch: "main", private: true });
      if (url.includes("/commits/main")) return rep({ sha: "f00dcafe12345" });
      if (url.includes("/git/trees/")) return rep({ truncated: false, tree: [{ path: "index.html", type: "blob", size: 20 }, { path: ".env", type: "blob", size: 40 }, { path: "logo.png", type: "blob", size: 900 }, { path: "node_modules/x/index.js", type: "blob", size: 5 }] });
      if (url.includes("/contents/index.html")) return rep("<title>Bonjour</title>");
      return { ok: false, status: 404, text: async () => "" };
    };
    const l = await lireDepotGithub({ depot: "o/r", token: "jeton-fictif-0000", fetch: f });
    expect(l.sha).toBe("f00dcafe12345");
    expect(l.fichiers.map((x) => x.chemin)).toEqual(["index.html", ".env", "logo.png"]);
    expect(l.fichiers.find((x) => x.chemin === ".env")!.contenu).toBeUndefined();
    expect(l.ignores).toEqual(expect.arrayContaining([{ chemin: ".env", raison: "sensible" }, { chemin: "logo.png", raison: "binaire" }]));
    expect(appels.some((a) => a.url.includes(".env"))).toBe(false);
    expect(appels.every((a) => !a.url.includes("jeton-fictif"))).toBe(true);
    expect(appels.every((a) => a.auth === "Bearer jeton-fictif-0000")).toBe(true); // dépôt privé : API des contenus, avec le jeton
    expect(chercher(l, "bonjour")).toEqual([{ chemin: "index.html", ligne: 1, texte: "<title>Bonjour</title>" }]);
  });
});

describe("moteur : demande NOTE_CONTENU", () => {
  const page = (url: string, body: string): FetchedPage => ({ url, finalUrl: url, status: 200, contentType: "text/html", body });
  const site = async (url: string) => (url.endsWith("/robots.txt") ? page(url, "User-agent: *\nAllow: /") : page(url, BON));
  const github: GithubFetch = async (url) => {
    const rep = (o: unknown) => ({ ok: true, status: 200, text: async () => (typeof o === "string" ? o : JSON.stringify(o)) });
    if (url.endsWith("/repos/o/site")) return rep({ default_branch: "main", private: false });
    if (url.includes("/commits/")) return rep({ sha: "abcdef0123456" });
    if (url.includes("/git/trees/")) return rep({ truncated: false, tree: [{ path: "index.html", type: "blob", size: 100 }] });
    return rep(BON);
  };
  const fauxLlm = () => ({
    name: "faux", defaultModel: "faux", usage: () => ({ inputTokens: 10_000, outputTokens: 2_000 }),
    async extract(req: { schema: { parse: (x: unknown) => unknown } }) {
      return { data: req.schema.parse({ criteres: [{ id: "proposition-valeur", note: 2, citation: "Séance d'essai à partir de 40 €", justification: "Claire." }], synthese: "Bon début." }) as never, run: { provider: "faux", model: "faux", promptHash: "x" } };
    },
  });
  function preparer(go = true) {
    const db = new MemoryEngineDb(() => new Date("2026-11-16T20:00:00Z"));
    if (go) db.notesGo.set("note-1", { depot: "o/site", cout_max_usd: 0.2 });
    const d = db.demander({ type: "NOTE_CONTENU", client_id: "client-fictif", subject_id: "studio-fictif", charge: { note_id: "note-1", url: "https://studio-fictif.example", nom: "Studio Fictif", depot: "o/site", cout_max_usd: 0.2 } });
    return { db, d };
  }
  const opts = (db: MemoryEngineDb) => ({
    db, dir: join(mkdtempSync(join(tmpdir(), "oia-note-")), "m"), hote: "t", version: "v", env: {}, now: () => new Date("2026-11-16T20:00:00Z"),
    fetch: site, crawlie: ["faux"], allowedLocal: ["studio-fictif.example"], github, noteLlm: fauxLlm,
    collector: () => { throw new Error("aucune collecte"); }, judge: () => noJudge(),
  });

  it("note les trois axes, écrit l'analyse « contenu » et ses constats", async () => {
    const { db, d } = preparer();
    const r = await runEngine(opts(db) as never);
    expect(r.traitees[0]).toMatchObject({ id: d.id, type: "NOTE_CONTENU", statut: "DONE" });
    const a = db.analyses[0]!;
    expect(a.nature).toBe("contenu");
    const s = a.scores as Record<string, number>;
    expect(s.technique).toBeGreaterThan(0.5);
    expect(s.commercial).toBeGreaterThan(0);
    expect((a.resultat as { depot: { sha: string } }).depot.sha).toBe("abcdef0123456");
    expect(db.constats.every((c) => c.source === "contenu")).toBe(true);
    expect(r.traitees[0]!.resultat).toMatchObject({ modele: "ok", depot: "o/site@abcdef0" });
  });

  it("sans GO en base : refusée, aucun appel au modèle", async () => {
    const { db } = preparer(false);
    let appels = 0;
    const r = await runEngine({ ...opts(db), noteLlm: () => { appels++; return fauxLlm(); } } as never);
    expect(r.traitees[0]!.statut).toBe("FAILED");
    expect(appels).toBe(0);
  });

  it("note sans modèle si la clé manque : le commercial ne repose que sur les critères mesurés", () => {
    const n = noterContenu([{ url: "https://studio-fictif.example/", html: BON }], null);
    expect(n.notes.commercial).not.toBeNull();
  });
});

describe("serveur MCP oia-depot", () => {
  const f: GithubFetch = async (url) => {
    const rep = (o: unknown) => ({ ok: true, status: 200, text: async () => (typeof o === "string" ? o : JSON.stringify(o)) });
    if (url.endsWith("/repos/o/site")) return rep({ default_branch: "main", private: false });
    if (url.includes("/commits/")) return rep({ sha: "abcdef0123456" });
    if (url.includes("/git/trees/")) return rep({ truncated: false, tree: [{ path: "index.html", type: "blob", size: 100 }, { path: ".env", type: "blob", size: 9 }] });
    return rep("<html lang=\"fr\"><title>Accueil du site fictif</title></html>");
  };
  it("liste ses outils, lit en liste blanche seulement, refuse les fichiers sensibles", async () => {
    const { creerServeurDepot } = await import("../src/mcp/depot-server");
    const s = creerServeurDepot({ autorises: ["o/site"], fetch: f });
    const init = await s.traiter({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
    expect((init!.result as { serverInfo: { name: string } }).serverInfo.name).toBe("oia-depot");
    expect(await s.traiter({ jsonrpc: "2.0", method: "notifications/initialized" })).toBeNull();
    const liste = await s.traiter({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    expect((liste!.result as { tools: { name: string }[] }).tools.map((t) => t.name)).toContain("depot_lire");
    const lu = await s.traiter({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "depot_lire", arguments: { depot: "o/site", chemin: "index.html" } } });
    expect(JSON.stringify(lu)).toContain("Accueil du site fictif");
    const env = await s.traiter({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "depot_lire", arguments: { depot: "o/site", chemin: ".env" } } });
    expect((env!.result as { isError: boolean }).isError).toBe(true);
    const hors = await s.traiter({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "depot_infos", arguments: { depot: "autre/depot" } } });
    expect(JSON.stringify(hors)).toContain("non autorisé");
    const infos = await s.traiter({ jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "depot_infos", arguments: { depot: "o/site" } } });
    expect(JSON.stringify(infos)).toContain(".env");
    const note = await s.traiter({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "depot_note_technique", arguments: { depot: "o/site" } } });
    expect(JSON.stringify(note)).toContain("secrets-versionnes");
  });
});

describe("dépôt public", () => {
  it("lit les fichiers par raw.githubusercontent.com, sans jeton envoyé hors de l'API", async () => {
    const appels: { url: string; auth?: string }[] = [];
    const f: GithubFetch = async (url, init) => {
      appels.push({ url, auth: init.headers.authorization });
      const rep = (o: unknown) => ({ ok: true, status: 200, text: async () => (typeof o === "string" ? o : JSON.stringify(o)) });
      if (url.endsWith("/repos/o/pub")) return rep({ default_branch: "main", private: false });
      if (url.includes("/commits/")) return rep({ sha: "1234567abcdef" });
      if (url.includes("/git/trees/")) return rep({ truncated: false, tree: [{ path: "a b.html", type: "blob", size: 5 }] });
      return rep("<p>x</p>");
    };
    const l = await lireDepotGithub({ depot: "o/pub", token: "jeton-fictif-0000", fetch: f });
    expect(l.fichiers[0]!.contenu).toBe("<p>x</p>");
    const brut = appels.find((a) => a.url.startsWith("https://raw.githubusercontent.com/"))!;
    expect(brut.url).toBe("https://raw.githubusercontent.com/o/pub/1234567abcdef/a%20b.html");
    expect(brut.auth).toBeUndefined();
  });
});

describe("grille rendue en objet par le modèle", () => {
  it("est remise en tableau avec l'id du critère", async () => {
    const page = { url: "https://studio-fictif.example/", html: BON };
    const llm = {
      name: "faux", defaultModel: "faux",
      async extract(req: { schema: { parse: (x: unknown) => unknown } }) {
        return { data: req.schema.parse({ "proposition-valeur": { note: 2, citation: "Séance d'essai à partir de 40 €", justification: "Claire." }, synthese: "S." }) as never, run: { provider: "faux", model: "faux", promptHash: "x" } };
      },
    };
    const r = await criteresModele(llm as never, { nom: "Studio Fictif", pages: [page], modele: "faux" });
    expect(r.criteres.find((c) => c.id === "proposition-valeur")!.ok).toBe(true);
  });
});
