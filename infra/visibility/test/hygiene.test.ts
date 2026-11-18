import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bilanBing, createBingClient, dateBing, type BingFetch } from "../src/hygiene/bing";
import { constatsHygiene, controlerSite, parseRobotsTxt, parseSitemapXml } from "../src/hygiene/controles";
import { MemoryEngineDb } from "../src/engine/db";
import { runEngine } from "../src/engine/run";
import { noJudge } from "../src/judge";
import type { FetchedPage, PageFetcher } from "../src/site/pages";

const SITE = "https://studio-fictif.example";
const page = (titre: string, desc: string, extra = "") =>
  `<!doctype html><html lang="fr"><head><title>${titre}</title><meta name="description" content="${desc}"><link rel="canonical" href="${SITE}/">${extra}<script type="application/ld+json">{"@type":"LocalBusiness"}</script></head><body><h1>x</h1></body></html>`;
const BONNE_DESC = "Cours de padel pour débutants et confirmés à Exempleville, séances individuelles et en groupe, à partir de 40 euros.";

function faux(routes: Record<string, { status: number; body: string; ct?: string }>): PageFetcher {
  return async (url: string): Promise<FetchedPage> => {
    const r = routes[url] ?? routes["*"] ?? { status: 404, body: "introuvable", ct: "text/plain" };
    return { url, finalUrl: url, status: r.status, contentType: r.ct ?? (r.body.startsWith("<") && !r.body.startsWith("<?xml") ? "text/html" : "text/plain"), body: r.body };
  };
}

const SAIN = {
  [`${SITE}/robots.txt`]: { status: 200, body: `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${SITE}/sitemap.xml\n` },
  [`${SITE}/sitemap.xml`]: { status: 200, body: `<?xml version="1.0"?><urlset><url><loc>${SITE}/</loc><lastmod>2026-11-01</lastmod></url><url><loc>${SITE}/padel</loc></url></urlset>`, ct: "application/xml" },
  [`${SITE}/`]: { status: 200, body: page("Studio Fictif · coaching de padel à Exempleville", BONNE_DESC) },
  [`${SITE}/padel`]: { status: 200, body: page("Padel à Exempleville · Studio Fictif", BONNE_DESC) },
  [`${SITE}/llms.txt`]: { status: 200, body: "# Studio Fictif\n\n> Coaching de padel à Exempleville, séances individuelles et en groupe.\n" },
};

describe("hygiène : lecture de robots.txt et du sitemap", () => {
  it("repère un blocage total, les ressources bloquées et les sitemaps déclarés", () => {
    expect(parseRobotsTxt("User-agent: *\nDisallow: /\n").toutBloque).toBe(true);
    const r = parseRobotsTxt("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\nDisallow: /assets\nDisallow: /admin\nSitemap: https://a.co/sitemap.xml");
    expect(r.toutBloque).toBe(false);
    expect(r.ressourcesBloquees).toEqual(["/assets"]);
    expect(r.sitemaps).toEqual(["https://a.co/sitemap.xml"]);
    const s = parseSitemapXml("<sitemapindex><sitemap><loc>https://a.co/s1.xml</loc></sitemap></sitemapindex>");
    expect(s.enfants).toEqual(["https://a.co/s1.xml"]);
  });
});

describe("hygiène : contrôles du site en ligne", () => {
  it("un site sain passe tout", async () => {
    const r = await controlerSite(SITE, faux(SAIN), { aleatoire: () => "x" });
    const echecs = r.controles.filter((c) => c.ok === false).map((c) => c.id);
    expect(echecs).toEqual([]);
    expect(r.score).toBe(100);
    expect(r.sitemap.adresses).toHaveLength(2);
  });

  it("un site négligé : chaque défaut devient un constat précis", async () => {
    const routes = {
      ...SAIN,
      [`${SITE}/robots.txt`]: { status: 200, body: "User-agent: *\nDisallow: /assets\n" },
      [`${SITE}/sitemap.xml`]: { status: 200, body: `<urlset><url><loc>${SITE}/</loc></url><url><loc>${SITE}/vieux</loc></url><url><loc>${SITE}/brouillon</loc></url><url><loc>https://autre.example/</loc></url></urlset>`, ct: "application/xml" },
      [`${SITE}/`]: { status: 200, body: page("Accueil", "Court.") },
      [`${SITE}/vieux`]: { status: 404, body: "non" },
      [`${SITE}/brouillon`]: { status: 200, body: page("Brouillon du studio fictif, page de test", BONNE_DESC, '<meta name="robots" content="noindex">') },
      [`${SITE}/llms.txt`]: { status: 200, body: "<!doctype html><html><body>app</body></html>", ct: "text/html" },
      "*": { status: 200, body: "<!doctype html><html><body>introuvable</body></html>", ct: "text/html" },
    };
    const r = await controlerSite(SITE, faux(routes), { aleatoire: () => "x" });
    const ko = Object.fromEntries(r.controles.filter((c) => c.ok === false).map((c) => [c.id, c.valeur]));
    expect(Object.keys(ko).sort()).toEqual(
      ["descriptions-longueur", "llms-txt", "robots-ressources", "robots-sitemap", "sitemap-domaine", "sitemap-noindex", "sitemap-pages-200", "titres-longueur", "vrai-404"].sort(),
    );
    expect(ko["llms-txt"]).toMatch(/page d'accueil répond à sa place/);
    expect(ko["vrai-404"]).toMatch(/HTTP 200/);
    const constats = constatsHygiene(r.controles);
    expect(constats.every((c) => c.source === "indexation" && String(c.cle).startsWith("indexation:"))).toBe(true);
  });
});

describe("Bing Webmaster Tools", () => {
  const CLE = "abcdef0123456789abcdef0123456789";
  function fauxBing(etat: { feeds: { Url: string; Status?: string }[]; verifie?: boolean; present?: boolean }, appels: { methode: string; url: string; corps?: string }[]): BingFetch {
    return async (url, init) => {
      const methode = new URL(url).pathname.split("/").pop()!;
      appels.push({ methode, url, corps: init?.body });
      const rep = (d: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify({ d }) });
      if (methode === "GetUserSites") return rep(etat.present === false ? [] : [{ Url: `${SITE}/`, IsVerified: etat.verifie ?? true }]);
      if (methode === "GetFeeds") return rep(etat.feeds);
      if (methode === "SubmitFeed") return rep(null);
      if (methode === "GetCrawlIssues") return rep([{ Url: `${SITE}/vieux`, HttpCode: 404 }]);
      if (methode === "GetCrawlStats") return rep([{ Date: "/Date(1731801600000)/", CrawledPages: 12, InIndex: 9 }]);
      if (methode === "GetQueryStats") return rep([{ Query: "padel exempleville", Impressions: 40, Clicks: 3, AvgImpressionPosition: 7.5 }]);
      return { ok: false, status: 400, text: async () => JSON.stringify({ Message: `méthode inconnue, clé ${CLE}` }) };
    };
  }

  it("soumet le sitemap s'il manque, lit les problèmes et les requêtes", async () => {
    const appels: { methode: string; url: string; corps?: string }[] = [];
    const r = await bilanBing(createBingClient(CLE, fauxBing({ feeds: [] }, appels)), SITE, `${SITE}/sitemap.xml`);
    expect(r.verifie).toBe(true);
    expect(r.actions).toEqual([{ action: "sitemap soumis à Bing", cible: `${SITE}/sitemap.xml`, resultat: "fait" }]);
    expect(JSON.parse(appels.find((a) => a.methode === "SubmitFeed")!.corps!)).toEqual({ siteUrl: `${SITE}/`, feedUrl: `${SITE}/sitemap.xml` });
    expect(r.problemes.total).toBe(1);
    expect(r.requetes[0]).toEqual({ requete: "padel exempleville", impressions: 40, clics: 3, position: 7.5 });
    expect(r.exploration?.Date).toBe("2024-11-17T00:00:00.000Z");
    expect(r.controles.find((c) => c.id === "bing-sitemap")!.ok).toBe(true);
  });

  it("sitemap déjà soumis : aucune écriture ; site absent : critique, rien d'autre", async () => {
    const appels: { methode: string; url: string }[] = [];
    await bilanBing(createBingClient(CLE, fauxBing({ feeds: [{ Url: `${SITE}/sitemap.xml`, Status: "Success" }] }, appels)), SITE, `${SITE}/sitemap.xml`);
    expect(appels.some((a) => a.methode === "SubmitFeed")).toBe(false);
    const absent = await bilanBing(createBingClient(CLE, fauxBing({ feeds: [], present: false }, [])), SITE, null);
    expect(absent.controles).toHaveLength(1);
    expect(absent.controles[0]).toMatchObject({ id: "bing-verifie", ok: false, gravite: "critique" });
  });

  it("la clé n'apparaît jamais dans une erreur", async () => {
    const autre = createBingClient(CLE, async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ Message: `refus pour la clé ${CLE}` }) }));
    const e = (await autre.sites().catch((x: Error) => x)) as Error;
    expect(e.message).not.toContain(CLE);
    expect(e.message).toContain("***");
    expect(() => createBingClient("pas une clé !")).toThrow();
    expect(dateBing("/Date(0)/")).toBe("1970-01-01T00:00:00.000Z");
  });
});

describe("moteur : demande HYGIENE", () => {
  function preparer() {
    const db = new MemoryEngineDb(() => new Date("2026-11-17T08:00:00Z"));
    db.sujets.set("studio-fictif", { subject_id: "studio-fictif", client_id: "client-fictif", client_nom: "C", site_url: SITE, nom: "Studio Fictif", langues: ["fr"], marches: [], panel_version: null, executions: [], plafond_usd: null, plafond_global_usd: null });
    return db;
  }
  const opts = (db: MemoryEngineDb, env: Record<string, string> = {}, bing?: BingFetch) => ({
    db, dir: join(mkdtempSync(join(tmpdir(), "oia-hyg-")), "m"), hote: "t", version: "v", env, now: () => new Date("2026-11-17T08:00:00Z"),
    fetch: faux(SAIN), crawlie: ["faux"], allowedLocal: ["studio-fictif.example"], quotidien: false, bing,
    collector: () => { throw new Error("aucune collecte"); }, judge: () => noJudge(),
  });

  it("planifiée au passage quotidien, gratuite ; sans clé Bing, les contrôles du site suffisent", async () => {
    const db = preparer();
    expect(await db.planifierHygiene()).toBe(1);
    expect(await db.planifierHygiene()).toBe(0);
    const r = await runEngine(opts(db) as never);
    expect(r.traitees[0]).toMatchObject({ type: "HYGIENE", statut: "DONE" });
    expect(r.traitees[0]!.resultat).toMatchObject({ score: 100, ecarts: 0, bing: "non lu : clé absente : BING_WEBMASTER_API_KEY" });
    expect(db.analyses[0]!.nature).toBe("indexation");
  });

  it("avec la clé Bing : le site absent de Bing devient un constat critique", async () => {
    const db = preparer();
    await db.planifierHygiene();
    const bing: BingFetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ d: [] }) });
    const r = await runEngine(opts(db, { BING_WEBMASTER_API_KEY: "abcdef0123456789abcdef0123456789" }, bing) as never);
    expect(r.traitees[0]!.resultat).toMatchObject({ ecarts: 1, bing: "non vérifié" });
    expect(db.constats[0]).toMatchObject({ cle: "indexation:bing-verifie", gravite: "critique", source: "indexation" });
  });
});

describe("Bing : hôte exact", () => {
  it("propriété sur la forme sans www alors que le site est servi sur www : signalée", async () => {
    const f: BingFetch = async (url) => {
      const m = new URL(url).pathname.split("/").pop();
      const d = m === "GetUserSites" ? [{ Url: "https://studio-fictif.example/", IsVerified: true }] : [];
      return { ok: true, status: 200, text: async () => JSON.stringify({ d }) };
    };
    const r = await bilanBing(createBingClient("abcdef0123456789abcdef0123456789", f), "https://www.studio-fictif.example", null);
    expect(r.controles.find((c) => c.id === "bing-hote")).toMatchObject({ ok: false, gravite: "important" });
    const ok = await bilanBing(createBingClient("abcdef0123456789abcdef0123456789", f), "https://studio-fictif.example", null);
    expect(ok.controles.find((c) => c.id === "bing-hote")!.ok).toBe(true);
  });
});
