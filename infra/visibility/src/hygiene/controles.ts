/**
 * Hygiène d'indexation : contrôles du site EN LIGNE, par règles fixes, sans aucun modèle de langage
 * (donc gratuits, et mêmes résultats d'un passage à l'autre).
 *
 * Ce qui est lu : robots.txt, le sitemap (déclaré dans robots.txt ou /sitemap.xml, index compris),
 * llms.txt, une adresse inexistante (vrai statut 404 ?), l'accueil et un échantillon des pages du
 * sitemap (statut, noindex, titre, description, canonical, langue, JSON-LD).
 * Chaque écart devient un constat (source « indexation ») avec sa correction.
 */
import type { PageFetcher } from "../site/pages.js";
import { decodeEntities } from "../site/pages.js";

export interface Controle {
  id: string;
  titre: string;
  categorie: "seo" | "technique" | "visibilite_ia";
  points: number;
  ok: boolean | null;
  valeur: string;
  preuve: Record<string, unknown>;
  gravite: "critique" | "important" | "mineur";
  explication: string;
  correction: string;
  effort: "XS" | "S" | "M" | "L" | "XL";
}

export interface ResultatControles {
  site: string;
  controles: Controle[];
  sitemap: { url: string | null; adresses: string[]; lastmod: Record<string, string> };
  score: number | null;
}

const balises = (html: string, nom: string): string[] => html.match(new RegExp(`<${nom}\\b[^>]*>`, "gi")) ?? [];
const attr = (tag: string, a: string): string | null => {
  const m = new RegExp(`\\b${a}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return m ? decodeEntities(m[2] ?? m[3] ?? m[4] ?? "") : null;
};
const meta = (html: string, nom: string) => balises(html, "meta").find((t) => (attr(t, "name") ?? attr(t, "property"))?.toLowerCase() === nom);
const titreDe = (html: string) => decodeEntities(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? "").replace(/\s+/g, " ").trim();
const descriptionDe = (html: string) => (attr(meta(html, "description") ?? "", "content") ?? "").replace(/\s+/g, " ").trim();
const canonicalDe = (html: string) => attr(balises(html, "link").find((t) => attr(t, "rel")?.toLowerCase() === "canonical") ?? "", "href");
const noindex = (html: string) => /noindex/i.test(attr(meta(html, "robots") ?? "", "content") ?? "");
const estHtml = (ct: string, body: string) => /html/i.test(ct) || /^\s*<(!doctype|html)/i.test(body);
const chemin = (u: string) => {
  try {
    const x = new URL(u);
    return x.pathname + x.search;
  } catch {
    return u;
  }
};
const court = (l: string[], n = 6) => l.slice(0, n).map(chemin);

export function parseSitemapXml(xml: string): { adresses: string[]; lastmod: Record<string, string>; enfants: string[] } {
  const lastmod: Record<string, string> = {};
  const adresses: string[] = [];
  for (const b of xml.match(/<url>[\s\S]*?<\/url>/g) ?? []) {
    const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(b)?.[1]?.replace(/&amp;/g, "&");
    if (!loc) continue;
    adresses.push(loc);
    lastmod[loc] = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(b)?.[1] ?? "";
  }
  const enfants = /<sitemapindex[\s>]/.test(xml) ? [...xml.matchAll(/<sitemap>[\s\S]*?<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]!.replace(/&amp;/g, "&")) : [];
  return { adresses, lastmod, enfants };
}

export function parseRobotsTxt(txt: string): { toutBloque: boolean; ressourcesBloquees: string[]; sitemaps: string[] } {
  const sitemaps: string[] = [];
  const groupes: { agents: string[]; disallow: string[] }[] = [];
  let courant: { agents: string[]; disallow: string[] } | null = null;
  let dernierEtaitAgent = false;
  for (const brut of txt.split(/\r?\n/)) {
    const ligne = brut.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(ligne);
    if (!m) continue;
    const [, cle, val] = m as unknown as [string, string, string];
    const k = cle.toLowerCase();
    if (k === "sitemap") sitemaps.push(val.trim());
    else if (k === "user-agent") {
      if (!courant || !dernierEtaitAgent) {
        courant = { agents: [], disallow: [] };
        groupes.push(courant);
      }
      courant.agents.push(val.trim().toLowerCase());
      dernierEtaitAgent = true;
      continue;
    } else if (k === "disallow" && courant && val.trim()) courant.disallow.push(val.trim());
    dernierEtaitAgent = false;
  }
  const etoile = groupes.filter((g) => g.agents.includes("*")).flatMap((g) => g.disallow);
  return {
    toutBloque: etoile.includes("/"),
    ressourcesBloquees: etoile.filter((d) => /^\/(assets|static|_next|js|css|build|dist)\b|\.(js|css)\$?$/i.test(d)),
    sitemaps,
  };
}

/** Contrôles du site en ligne. `get` ne lève jamais pour un statut HTTP : il rend le statut. */
export async function controlerSite(site: string, get: PageFetcher, o: { echantillon?: number; aleatoire?: () => string } = {}): Promise<ResultatControles> {
  const base = site.replace(/\/$/, "");
  const hote = new URL(base).hostname.replace(/^www\./, "");
  const memeSite = (u: string) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "") === hote;
    } catch {
      return false;
    }
  };
  const lire = async (u: string) => {
    try {
      return await get(u);
    } catch (err) {
      return { url: u, finalUrl: u, status: 0, contentType: "", body: "", erreur: err instanceof Error ? err.message : String(err) };
    }
  };
  const c: Controle[] = [];

  // --- robots.txt
  const robots = await lire(`${base}/robots.txt`);
  const robotsOk = robots.status === 200 && !estHtml(robots.contentType, robots.body);
  const r = robotsOk ? parseRobotsTxt(robots.body) : { toutBloque: false, ressourcesBloquees: [], sitemaps: [] };
  c.push({
    id: "robots-present", titre: "robots.txt servi", categorie: "seo", points: 2, ok: robotsOk, valeur: robotsOk ? "présent" : `absent (HTTP ${robots.status || "injoignable"})`, preuve: { url: `${base}/robots.txt` },
    gravite: "important", effort: "XS", explication: "robots.txt dit aux robots (Google, Bing, robots des IA) ce qu'ils peuvent lire et où trouver le sitemap.",
    correction: "Publier /robots.txt (texte brut) avec « User-agent: * », « Allow: / » et la ligne « Sitemap: https://…/sitemap.xml ».",
  });
  if (robotsOk) {
    c.push({
      id: "robots-tout-bloque", titre: "robots.txt n'interdit pas tout le site", categorie: "seo", points: 4, ok: !r.toutBloque, valeur: r.toutBloque ? "Disallow: / pour tous les robots" : "site ouvert", preuve: {},
      gravite: "critique", effort: "XS", explication: "« Disallow: / » pour tous les robots retire le site de Google, de Bing et des réponses des IA.",
      correction: "Retirer « Disallow: / » du groupe « User-agent: * » ; ne bloquer que l'administration et les pages privées.",
    });
    c.push({
      id: "robots-ressources", titre: "JavaScript et CSS accessibles aux robots", categorie: "technique", points: 2, ok: r.ressourcesBloquees.length === 0,
      valeur: r.ressourcesBloquees.length ? `bloqués : ${r.ressourcesBloquees.join(", ")}` : "accessibles", preuve: { disallow: r.ressourcesBloquees },
      gravite: "important", effort: "XS", explication: "Google a besoin du JavaScript et du CSS pour afficher une page ; s'ils sont bloqués, il voit une page vide ou cassée.",
      correction: "Retirer de robots.txt les lignes Disallow sur /assets (ou /static, /_next, *.js, *.css).",
    });
    c.push({
      id: "robots-sitemap", titre: "Sitemap déclaré dans robots.txt", categorie: "seo", points: 1, ok: r.sitemaps.length > 0, valeur: r.sitemaps.length ? r.sitemaps.join(", ") : "aucune ligne Sitemap", preuve: {},
      gravite: "mineur", effort: "XS", explication: "La ligne Sitemap de robots.txt permet à tous les robots de trouver le sitemap sans inscription.",
      correction: "Ajouter « Sitemap: https://…/sitemap.xml » à la fin de robots.txt.",
    });
  }

  // --- sitemap
  const sitemapUrl = r.sitemaps.find(memeSite) ?? `${base}/sitemap.xml`;
  const sm = await lire(sitemapUrl);
  let adresses: string[] = [];
  let lastmod: Record<string, string> = {};
  const smOk = sm.status === 200 && /<(urlset|sitemapindex)[\s>]/.test(sm.body);
  if (smOk) {
    const p = parseSitemapXml(sm.body);
    adresses = p.adresses;
    lastmod = p.lastmod;
    for (const e of p.enfants.slice(0, 10)) {
      const x = await lire(e);
      if (x.status === 200) {
        const q = parseSitemapXml(x.body);
        adresses.push(...q.adresses);
        Object.assign(lastmod, q.lastmod);
      }
    }
  }
  c.push({
    id: "sitemap-lisible", titre: "Sitemap servi et lisible", categorie: "seo", points: 3, ok: smOk && adresses.length > 0,
    valeur: smOk ? `${adresses.length} adresse(s)` : `illisible (HTTP ${sm.status || "injoignable"})`, preuve: { url: sitemapUrl },
    gravite: "important", effort: "S", explication: "Le sitemap liste les pages à indexer ; sans lui, Bing (qui nourrit ChatGPT et Copilot) découvre les pages tard.",
    correction: "Publier /sitemap.xml (format urlset) avec toutes les pages publiques, et le déclarer dans robots.txt.",
  });
  if (smOk) {
    const etrangeres = adresses.filter((u) => !memeSite(u));
    c.push({
      id: "sitemap-domaine", titre: "Sitemap limité au domaine du site", categorie: "seo", points: 1, ok: etrangeres.length === 0,
      valeur: etrangeres.length ? `${etrangeres.length} adresse(s) d'un autre domaine` : "même domaine", preuve: { adresses: etrangeres.slice(0, 5) },
      gravite: "mineur", effort: "XS", explication: "Un sitemap ne peut lister que les adresses de son propre domaine ; les autres sont ignorées, voire font rejeter le fichier.",
      correction: "Retirer du sitemap les adresses d'autres domaines (chaque domaine a son propre sitemap).",
    });
  }

  // --- échantillon des pages (accueil d'abord)
  const pagesAControler = [...new Set([`${base}/`, ...adresses.filter(memeSite)])].slice(0, o.echantillon ?? 15);
  const lues: { url: string; status: number; html: string; xRobots: string }[] = [];
  for (const u of pagesAControler) {
    const x = await lire(u);
    lues.push({ url: u, status: x.status, html: estHtml(x.contentType, x.body) ? x.body : "", xRobots: "" });
  }
  const enErreur = lues.filter((p) => p.status >= 400 || p.status === 0).map((p) => p.url);
  c.push({
    id: "sitemap-pages-200", titre: "Pages du sitemap accessibles", categorie: "seo", points: 3, ok: lues.length ? enErreur.length === 0 : null,
    valeur: `${lues.length - enErreur.length}/${lues.length} pages en 200`, preuve: { pages: court(enErreur) },
    gravite: "important", effort: "S", explication: "Une page du sitemap en erreur gaspille l'exploration et fait douter les moteurs de tout le sitemap.",
    correction: "Corriger ou rediriger (301) les pages en erreur, ou les retirer du sitemap.",
  });
  const enNoindex = lues.filter((p) => p.html && noindex(p.html)).map((p) => p.url);
  c.push({
    id: "sitemap-noindex", titre: "Aucune page du sitemap en noindex", categorie: "seo", points: 3, ok: lues.length ? enNoindex.length === 0 : null,
    valeur: `${enNoindex.length} page(s) en noindex`, preuve: { pages: court(enNoindex) },
    gravite: "important", effort: "XS", explication: "Annoncer une page dans le sitemap et l'interdire d'index par noindex envoie deux signaux contraires.",
    correction: "Retirer ces pages du sitemap, ou retirer leur noindex si elles doivent être trouvées.",
  });
  const avecHtml = lues.filter((p) => p.html && p.status < 400);
  const titreFaux = avecHtml.filter((p) => { const t = titreDe(p.html); return t.length < 10 || t.length > 65; });
  c.push({
    id: "titres-longueur", titre: "Titres de 10 à 65 caractères", categorie: "seo", points: 2, ok: avecHtml.length ? titreFaux.length === 0 : null,
    valeur: `${avecHtml.length - titreFaux.length}/${avecHtml.length} pages`, preuve: { pages: titreFaux.slice(0, 6).map((p) => ({ page: chemin(p.url), longueur: titreDe(p.html).length })) },
    gravite: "mineur", effort: "XS", explication: "Au-delà de 60 à 65 caractères le titre est coupé dans les résultats ; trop court, il ne dit pas de quoi parle la page.",
    correction: "Écrire pour chaque page un titre de 30 à 60 caractères : offre, lieu, marque.",
  });
  const descFausse = avecHtml.filter((p) => { const d = descriptionDe(p.html); return d.length < 25 || d.length > 160; });
  c.push({
    id: "descriptions-longueur", titre: "Descriptions de 25 à 160 caractères", categorie: "seo", points: 2, ok: avecHtml.length ? descFausse.length === 0 : null,
    valeur: `${avecHtml.length - descFausse.length}/${avecHtml.length} pages`, preuve: { pages: descFausse.slice(0, 6).map((p) => ({ page: chemin(p.url), longueur: descriptionDe(p.html).length })) },
    gravite: "mineur", effort: "XS", explication: "Les moteurs n'affichent qu'environ 160 caractères de la description ; trop courte, ils en fabriquent une à partir de la page.",
    correction: "Ramener chaque description entre 120 et 160 caractères, propre à la page.",
  });
  const sansCanonical = avecHtml.filter((p) => { const k = canonicalDe(p.html); return !k || !memeSite(k); });
  c.push({
    id: "canonical", titre: "Adresse canonique déclarée", categorie: "seo", points: 1, ok: avecHtml.length ? sansCanonical.length === 0 : null,
    valeur: `${avecHtml.length - sansCanonical.length}/${avecHtml.length} pages`, preuve: { pages: court(sansCanonical.map((p) => p.url)) },
    gravite: "mineur", effort: "XS", explication: "La balise canonical dit quelle adresse indexer quand une page est joignable de plusieurs façons (www, paramètres, langues).",
    correction: "Ajouter <link rel=\"canonical\" href=\"https://…\"> sur chaque page, vers sa propre adresse.",
  });
  const accueil = lues[0];
  if (accueil?.html) {
    const lang = attr(balises(accueil.html, "html")[0] ?? "", "lang");
    c.push({
      id: "langue", titre: "Langue de l'accueil déclarée", categorie: "seo", points: 1, ok: !!lang, valeur: lang ?? "absente", preuve: {},
      gravite: "mineur", effort: "XS", explication: "La langue déclarée aide les moteurs à servir la bonne version au bon public.",
      correction: "Ajouter lang=\"fr\" (ou en, ru…) sur la balise <html>.",
    });
    const ld = /application\/ld\+json/i.test(accueil.html);
    c.push({
      id: "jsonld-accueil", titre: "Données structurées sur l'accueil", categorie: "visibilite_ia", points: 2, ok: ld, valeur: ld ? "présentes" : "absentes", preuve: {},
      gravite: "important", effort: "S", explication: "Le JSON-LD dit sans ambiguïté qui vous êtes, où, et ce que vous proposez : les IA s'en servent pour vous citer correctement.",
      correction: "Ajouter un bloc JSON-LD Organization ou LocalBusiness (nom, adresse, contact, sameAs) sur l'accueil.",
    });
  }

  // --- llms.txt
  const llms = await lire(`${base}/llms.txt`);
  const llmsOk = llms.status === 200 && !estHtml(llms.contentType, llms.body) && llms.body.trim().length > 50;
  c.push({
    id: "llms-txt", titre: "llms.txt servi", categorie: "visibilite_ia", points: 1, ok: llmsOk,
    valeur: llmsOk ? "présent" : llms.status === 200 ? "la page d'accueil répond à sa place (fichier absent)" : `absent (HTTP ${llms.status || "injoignable"})`, preuve: {},
    gravite: "mineur", effort: "S", explication: "llms.txt résume le site pour les assistants IA : qui, quoi, où, prix, pages clés.",
    correction: "Publier /llms.txt (Markdown court et factuel) à la racine du site.",
  });

  // --- vrai 404
  const jeton = (o.aleatoire ?? (() => Math.random().toString(36).slice(2, 10)))();
  const inexistante = await lire(`${base}/oia-controle-inexistant-${jeton}`);
  const vrai404 = inexistante.status === 404 || inexistante.status === 410;
  const doux = !vrai404 && inexistante.status === 200;
  const douxNoindex = doux && estHtml(inexistante.contentType, inexistante.body) && noindex(inexistante.body);
  c.push({
    id: "vrai-404", titre: "Une adresse inexistante répond 404", categorie: "technique", points: 2, ok: vrai404 || douxNoindex,
    valeur: vrai404 ? `HTTP ${inexistante.status}` : douxNoindex ? "HTTP 200 mais page en noindex" : `HTTP ${inexistante.status || "injoignable"} (page « introuvable » vue comme une vraie page)`, preuve: {},
    gravite: "important", effort: "S", explication: "Si une adresse inexistante répond 200, les moteurs peuvent indexer des pages vides (« soft 404 ») et gaspiller l'exploration.",
    correction: "Servir le statut 404 (404.html sur un site statique), ou au minimum <meta name=\"robots\" content=\"noindex\"> sur la page introuvable d'une application.",
  });

  const mesures = c.filter((x) => x.ok !== null);
  const total = mesures.reduce((s, x) => s + x.points, 0);
  const score = total ? Math.round((100 * mesures.filter((x) => x.ok).reduce((s, x) => s + x.points, 0)) / total) : null;
  return { site: base, controles: c, sitemap: { url: smOk ? sitemapUrl : null, adresses, lastmod }, score };
}

/** Constats (contrat v3) pour les contrôles manqués. */
export function constatsHygiene(c: Controle[]): Record<string, unknown>[] {
  return c.filter((x) => x.ok === false).map((x) => ({
    cle: `indexation:${x.id}`,
    source: "indexation",
    categorie: x.categorie,
    gravite: x.gravite,
    titre: `À corriger : ${x.titre.charAt(0).toLowerCase()}${x.titre.slice(1)}`.slice(0, 200),
    explication: x.explication,
    correction: x.correction,
    impact: null,
    effort: x.effort,
    qui: "equipe",
    valeur: x.valeur.slice(0, 200),
    preuve: { ...x.preuve, mesure: "site en ligne" },
  }));
}
