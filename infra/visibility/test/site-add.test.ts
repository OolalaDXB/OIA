/**
 * Ajout d'un site (mandat v15, bloc A) sur un site ENTIÈREMENT FICTIF servi par un fetch
 * injecté : aucune requête réseau réelle, Crawlie remplacé par un faux exécutable, moteurs et
 * Mistral remplacés par des fabriques fictives. Les sujets s'écrivent dans un dossier temporaire.
 */
import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { parse, stringify } from "yaml";
import { createFakeProvider } from "../../../packages/providers/src/fake";
import type { CollectRequest, Collector } from "../src/collector";
import { loadSubject } from "../src/load";
import { FaitsSchema, lirePropositions } from "../src/proposition";
import { CompetitorSchema, PanelSchema, type Panel } from "../src/schema";
import { InternalAddressError } from "../src/site-init";
import { parseArgs, siteAdd, type SiteAddOptions } from "../src/site-add";
import { extractActors, ActorsFileSchema } from "../src/site/actors";
import { checkIndexation } from "../src/site/audit";
import { findHomonyms, HomonymsFileSchema } from "../src/site/homonyms";
import type { FetchedPage, PageFetcher } from "../src/site/pages";
import { RepoPathError } from "../src/site/paths";
import type { AnswerRow } from "../src/site/text";

const toolRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const SITE = "https://coach-zed.example/";
const DAY = "2026-12-02";
const now = () => new Date(`${DAY}T10:00:00Z`);

const HOME = `<!doctype html><html lang="fr"><head>
<title>Coach Zed | Coaching sportif à Paris</title>
<meta name="description" content="Coaching sportif individuel et en ligne, à Paris.">
<meta property="og:site_name" content="Coach Zed">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Coach Zed",
  telephone: "+33 1 00 00 00 00",
  address: { "@type": "PostalAddress", streetAddress: "1 rue Fictive", postalCode: "75000", addressLocality: "Paris", addressCountry: "FR" },
  sameAs: ["https://social.example/coachzed"],
  makesOffer: [
    { "@type": "Offer", name: "Coaching individuel", price: "80", priceCurrency: "EUR" },
    { "@type": "Offer", itemOffered: { "@type": "Service", name: "Remise en forme en ligne" }, price: "40", priceCurrency: "EUR" },
  ],
})}</script>
<script type="application/ld+json">{ invalide </script>
</head><body><h1>Votre coach à Paris</h1>
<a href="/tarifs">Tarifs</a> <a href="/contact">Contact</a> <a href="/admin">Admin</a> <a href="/photo.jpg">Photo</a> <a href="https://ailleurs.example/">Ailleurs</a>
</body></html>`;

const PAGES: Record<string, { status: number; body: string; contentType?: string }> = {
  [SITE]: { status: 200, body: HOME },
  "https://coach-zed.example/robots.txt": { status: 200, body: "User-agent: *\nDisallow: /admin\nSitemap: https://coach-zed.example/sitemap.xml\n", contentType: "text/plain" },
  "https://coach-zed.example/tarifs": { status: 200, body: "<html lang=fr><body><h1>Tarifs</h1><p>Séance individuelle : 80 € ; en ligne : 40 €.</p></body></html>" },
  "https://coach-zed.example/contact": { status: 200, body: "<html lang=fr><body><p>Écrire à Coach Zed.</p></body></html>" },
  "https://www.bing.com/search?q=site%3Acoach-zed.example": { status: 200, body: '<ol id="b_results"><li><a href="https://coach-zed.example/">Coach Zed</a></li><li><a href="https://coach-zed.example/tarifs">Tarifs</a></li></ol>' },
  "https://www.google.com/search?q=site%3Acoach-zed.example": { status: 200, body: "<html>Our systems have detected unusual traffic from your computer network. <div class=g-recaptcha></div></html>" },
};

function fakeSite(): { fetch: PageFetcher; seen: string[] } {
  const seen: string[] = [];
  const fetch: PageFetcher = async (url): Promise<FetchedPage> => {
    seen.push(url);
    const p = PAGES[url];
    if (!p) return { url, finalUrl: url, status: 404, contentType: "text/html", body: "introuvable" };
    return { url, finalUrl: url, status: p.status, contentType: p.contentType ?? "text/html; charset=utf-8", body: p.body };
  };
  return { fetch, seen };
}

/** Faux Crawlie : un exécutable qui écrit un rapport fictif à l'endroit demandé par `-o`. */
function fakeCrawlie(root: string): string[] {
  const report = join(root, "crawlie-fictif.json");
  writeFileSync(
    report,
    JSON.stringify({
      config: { url: SITE, render: false },
      summary: { totalPages: 3, indexablePages: 2, healthScore: 70, geoScore: 40 },
      pages: [
        { url: SITE, status: 200, title: "Coach Zed", wordCount: 120, text: "Coaching individuel dès 80 €", indexable: true, metaRobots: null, schemaTypes: ["LocalBusiness"], invalidJsonld: 1 },
        { url: "https://coach-zed.example/tarifs", status: 200, title: "Tarifs", wordCount: 40, text: "Séance 80 €, en ligne 40 €", indexable: true, schemaTypes: [] },
        { url: "https://coach-zed.example/contact", status: 200, title: "Contact", wordCount: 10, text: "", indexable: false, metaRobots: "noindex", schemaTypes: [] },
      ],
      issues: [
        { rule: "structured-data-missing", severity: "warning", url: "https://coach-zed.example/tarifs" },
        { rule: "structured-data-missing", severity: "warning", url: "https://coach-zed.example/contact" },
        { rule: "noindex", severity: "notice", url: "https://coach-zed.example/contact" },
      ],
      robotsFound: true,
      robotsBlocked: ["https://coach-zed.example/admin"],
      sitemapFound: true,
      llmsTxtFound: false,
    }),
  );
  const bin = join(root, "crawlie-fictif.sh");
  writeFileSync(bin, `#!/bin/sh\nout=""; prev=""\nfor a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done\ncp "${report}" "$out"\n`);
  chmodSync(bin, 0o755);
  return [bin];
}

/** Réponses fictives des moteurs : concurrents, homonyme et marque. */
function answerFor(engine: string, promptId: string): { text: string; citations: { url: string }[] } {
  const n = Number(promptId.slice(-2));
  const lines = [
    `Voici quelques options à Paris :`,
    `1. **Studio Alpha** – un studio de coaching avec plusieurs salles, [site](https://studio-alpha.example/cours).`,
    `2. **Marie Durand** : coach personnelle certifiée, elle propose des séances à domicile.`,
    n % 2 === 0 ? `3. **FitBook**, une plateforme de réservation de coachs en ligne.` : `3. **Prix** : de 50 à 90 € la séance.`,
    engine === "claude" ? `À ne pas confondre : Zed Harrow, professeur de step, n'a aucun lien avec Coach Zed.` : `Coach Zed Paris propose aussi du coaching en ligne.`,
    n === 1 ? `**Club Unique** n'apparaît qu'une fois.` : ``,
  ];
  return { text: lines.join("\n"), citations: [{ url: "https://annuaire-fictif.example/fitbook" }, { url: "https://studio-alpha.example/" }] };
}

function fakeCollector(calls: CollectRequest[]): Collector {
  return {
    name: "fictif",
    async collect(req) {
      calls.push(req);
      const a = answerFor(req.engine, req.promptId);
      return { collectorName: "fictif", collectorRunId: `fictif:${req.engine}:${req.promptId}`, rawText: a.text, structured: { cost: { readable: true } }, citations: a.citations, costUsd: 0, engineVersion: "fictif-1", receivedAt: now().toISOString() };
    },
  };
}

const KEYS = { OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "k", OPENROUTER_API_KEY: "k", MISTRAL_API_KEY: "k", OIA_VIS_MONTHLY_CAP_USD: "100" };

function setup(overrides: Partial<SiteAddOptions> = {}) {
  const root = mkdtempSync(join(tmpdir(), "oia-site-add-"));
  const site = fakeSite();
  const llmFactory = vi.fn<NonNullable<SiteAddOptions["llm"]>>(() => {
    throw new Error("appel payant interdit sans --go");
  });
  const collectorFactory = vi.fn<NonNullable<SiteAddOptions["collector"]>>(() => {
    throw new Error("appel payant interdit sans --go");
  });
  const opts: SiteAddOptions = {
    url: SITE,
    clientId: "client-fictif",
    languages: ["fr", "en"],
    countries: ["FR", "AE"],
    go: { faits: false, reconnaissance: false },
    subjectsDir: join(root, "sujets"),
    dataDir: join(root, "data"),
    fetch: site.fetch,
    crawlie: fakeCrawlie(root),
    llm: llmFactory,
    collector: collectorFactory,
    env: {},
    now,
    ...overrides,
  };
  return { root, site, opts, llmFactory, collectorFactory };
}

const readYaml = (p: string) => parse(readFileSync(p, "utf8"));

describe("site add : refus", () => {
  it("refuse une adresse interne, sans rien lire ni écrire", async () => {
    for (const url of ["http://127.0.0.1/", "https://localhost/", "https://192.168.1.10/", "http://[::1]/"]) {
      const { opts, site } = setup({ url });
      await expect(siteAdd(opts)).rejects.toBeInstanceOf(InternalAddressError);
      expect(site.seen).toEqual([]);
      expect(existsSync(opts.subjectsDir)).toBe(false);
    }
  });

  it("refuse une adresse en http", async () => {
    const { opts } = setup({ url: "http://coach-zed.example/" });
    await expect(siteAdd(opts)).rejects.toThrow(/https attendue/);
  });

  it("refuse un dossier de sujets situé dans le dépôt, avant toute lecture", async () => {
    const inRepo = join(toolRoot, "sujets-test-refus");
    const { opts, site } = setup({ subjectsDir: inRepo });
    await expect(siteAdd(opts)).rejects.toBeInstanceOf(RepoPathError);
    expect(existsSync(inRepo)).toBe(false);
    expect(site.seen).toEqual([]);
  });

  it("refuse une langue sans gabarit de panel et un client mal formé", async () => {
    await expect(siteAdd(setup({ languages: ["de"] }).opts)).rejects.toThrow(/aucun gabarit/);
    await expect(siteAdd(setup({ clientId: "Client Fictif" }).opts)).rejects.toThrow(/identifiant de client/);
  });
});

describe("site add : sans --go", () => {
  it("crée un sujet draft valide pour load.ts, sans aucun appel payant", async () => {
    const { opts, site, llmFactory, collectorFactory } = setup();
    const r = await siteAdd(opts);
    expect(llmFactory).not.toHaveBeenCalled();
    expect(collectorFactory).not.toHaveBeenCalled();
    expect(r.paidCalls).toEqual({ mistral: 0, moteurs: 0 });
    // Seulement le site (robots.txt d'abord) et les deux pages de résultats publiques.
    expect(site.seen).toEqual([
      "https://coach-zed.example/robots.txt",
      SITE,
      "https://coach-zed.example/contact",
      "https://coach-zed.example/tarifs",
      "https://www.bing.com/search?q=site%3Acoach-zed.example",
      "https://www.google.com/search?q=site%3Acoach-zed.example",
    ]);

    expect(r.subjectId).toBe("coach-zed-example");
    expect(r.dir).toBe(join(realpathSync(opts.subjectsDir), "coach-zed-example"));
    expect(statSync(opts.subjectsDir).mode & 0o777).toBe(0o700);
    expect(statSync(r.dir).mode & 0o777).toBe(0o700);

    const b = loadSubject(r.dir);
    expect(b.subject.status).toBe("draft");
    expect(b.subject.displayName).toBe("Coach Zed");
    expect(b.subject.markets.map((m) => [m.country, m.label, m.languages])).toEqual([
      ["FR", "Paris", ["fr"]],
      ["AE", "United Arab Emirates", ["en"]],
    ]);
    expect(b.panel.prompts.every((p) => p.status !== "active")).toBe(true);
    expect(b.measurement.windows).toMatchObject([{ id: "j0", status: "planned", days: 5 }]);
    expect(b.measurement.engines.find((e) => e.model === "mistral")?.languages).toEqual(["fr"]);

    // Panel proposé : 10 questions par langue dont 2 marquées, à partir des offres et des lieux.
    const panel: Panel = PanelSchema.parse(readYaml(join(r.dir, "proposition", "panel.yaml")));
    expect(panel.status).toBe("draft");
    for (const l of ["fr", "en"]) {
      const ps = panel.prompts.filter((p) => p.language === l);
      expect(ps).toHaveLength(10);
      expect(ps.filter((p) => p.family === "branded")).toHaveLength(2);
      expect(ps.every((p) => p.status === "proposed")).toBe(true);
    }
    expect(panel.prompts.find((p) => p.language === "fr")!.text).toContain("Paris");
    expect(panel.prompts.find((p) => p.language === "fr")!.text).toBe("Quelles sont les meilleures options pour coaching individuel à Paris ?");
    expect(b.subject.openQuestions).toContain("en : aucune offre en en sur le site, offres reprises d'une autre langue (fr)");

    // Faits déterministes, chacun avec sa page source, au statut extrait.
    const faits = FaitsSchema.parse(readYaml(join(r.dir, "proposition", "faits.yaml"))).faits;
    const pages = new Set(b.subject.sources.map((s) => s.ref));
    expect(faits.every((f) => f.statut === "extrait" && pages.has(f.sourceUrl))).toBe(true);
    const st = faits.map((f) => f.statement);
    expect(st).toContain("Téléphone : +33 1 00 00 00 00");
    expect(st).toContain("Adresse : 1 rue Fictive, 75000 Paris, FR");
    expect(st).toContain("Prix : Coaching individuel — 80 EUR");
    expect(st).toContain("Profil public : https://social.example/coachzed");
    expect(st).toContain("Offre : Remise en forme en ligne");

    // Audit : Crawlie, lecture sans JavaScript, indexation indicative, captcha non contourné.
    const audit = JSON.parse(readFileSync(join(r.dir, "proposition", "audit-lecture.json"), "utf8"));
    expect(audit.crawlie.statut).toBe("fait");
    expect(audit.crawlie.rendu).toBe("sans-javascript");
    expect(audit.crawlie.robots.noindex).toEqual(["https://coach-zed.example/contact"]);
    expect(audit.crawlie.donneesStructurees.pagesSans).toHaveLength(2);
    expect(audit.lecture.pages.find((p: { url: string }) => p.url.endsWith("/tarifs")).prixSansJs).toEqual(["80 €", "40 €"]);
    expect(audit.lecture.pages[0].jsonLdInvalides).toBe(1);
    expect(audit.lecture.ignorees.map((x: { url: string }) => x.url)).toContain("https://coach-zed.example/admin");
    expect(audit.indexation.map((i: { moteur: string; statut: string; indicatif: boolean }) => [i.moteur, i.statut, i.indicatif])).toEqual([
      ["bing", "trouve", true],
      ["google", "non-verifiable", true],
    ]);
    expect(readFileSync(join(r.dir, "proposition", "audit.md"), "utf8")).toContain("non vérifiable");
    // Formats de la revue (src/proposition.ts) : tout se relit sans erreur.
    const props = lirePropositions(r.dir);
    expect(props.meta).toMatchObject({ subjectId: "coach-zed-example", clientId: "client-fictif", proposeLe: DAY });
    expect(props.audit!.constats.map((c) => [c.code, c.niveau])).toEqual([
      ["pages", "ok"],
      ["prix-sans-js", "ok"],
      ["donnees-structurees", "attention"],
      ["robots", "attention"],
      ["llms-txt", "attention"],
      ["index-bing", "ok"],
      ["index-google", "attention"],
    ]);
    expect(props.concurrents).toBeNull();

    // SQL en ajout seul, jamais appliqué ici.
    const sql = readFileSync(join(r.dir, "proposition", "base.sql"), "utf8");
    expect(sql.match(/on conflict/g)).toHaveLength(4);
    expect(sql).toContain("insert into vis.subject (id, client_id, status) values ('coach-zed-example', 'client-fictif', 'draft')");
    expect(sql).not.toMatch(/\b(update|delete|drop|truncate)\b/i);

    // Reconnaissance : planifiée, questions non marquées seulement, coût au majorant.
    const plan = JSON.parse(readFileSync(join(r.dir, "proposition", "reconnaissance.json"), "utf8"));
    expect(plan.statut).toBe("planifiee");
    expect(plan.questions).toHaveLength(16);
    expect(plan.appels).toBe(16 * 5 + 8); // 5 moteurs (Grok compris) ; Mistral : français seulement
    expect(plan.coutMajorantUsd).toBeGreaterThan(0);
    expect(r.costs.faitsMistral.calls).toBe(3);
    expect(existsSync(join(r.dir, "proposition", "acteurs.json"))).toBe(false);
  });

  it("refuse --go sans plafond mensuel, avant tout appel", async () => {
    const { opts, llmFactory, collectorFactory } = setup({ go: { faits: true, reconnaissance: true } });
    await expect(siteAdd(opts)).rejects.toThrow(/plafond mensuel/);
    expect(llmFactory).not.toHaveBeenCalled();
    expect(collectorFactory).not.toHaveBeenCalled();
  });
});

describe("site add : avec --go (fournisseurs fictifs)", () => {
  it("faits par Mistral, reconnaissance, acteurs et homonymes ; sujet valide une fois panel et concurrents validés", async () => {
    const calls: CollectRequest[] = [];
    const mistral = createFakeProvider({ "visibility.site.facts": (input) => ({ faits: input.includes("/tarifs") ? [{ enonce: "Séance individuelle à 80 €", categorie: "price", langue: "fr" }] : [] }) });
    const { opts } = setup({ env: KEYS, llm: () => mistral, collector: () => fakeCollector(calls), go: { faits: true, reconnaissance: true } });
    const r = await siteAdd(opts);
    expect(r.paidCalls.mistral).toBe(3);
    expect(r.paidCalls.moteurs).toBe(88);
    // Aucune question marquée envoyée.
    expect(calls.every((c) => !c.promptText.includes("Coach Zed"))).toBe(true);
    expect(calls.filter((c) => c.engine === "mistral").every((c) => c.promptLanguage === "fr")).toBe(true);

    const faits = FaitsSchema.parse(readYaml(join(r.dir, "proposition", "faits.yaml"))).faits;
    expect(faits.find((f) => f.id === "m-001")).toMatchObject({ statement: "Séance individuelle à 80 €", statut: "extrait", sourceUrl: "https://coach-zed.example/tarifs" });
    expect(faits.some((f) => f.id.startsWith("d-"))).toBe(true);

    const plan = JSON.parse(readFileSync(join(r.dir, "proposition", "reconnaissance.json"), "utf8"));
    expect(plan.statut).toBe("collectee");

    const actors = ActorsFileSchema.parse(JSON.parse(readFileSync(join(r.dir, "proposition", "acteurs.json"), "utf8")));
    const byName = new Map(actors.acteurs.map((a) => [a.name, a]));
    expect(byName.get("Studio Alpha")).toMatchObject({ type: "structure", reponses: 88, statut: "extrait", source: "https://studio-alpha.example/cours" });
    expect(byName.get("Marie Durand")?.type).toBe("personne");
    expect(byName.get("FitBook")?.type).toBe("plateforme");
    expect(byName.has("Prix")).toBe(false);
    expect(byName.has("Coach Zed")).toBe(false);
    expect(byName.has("Club Unique")).toBe(true); // nommé dans les réponses à fr-01 et en-11 (deux questions)

    const homonyms = HomonymsFileSchema.parse(JSON.parse(readFileSync(join(r.dir, "proposition", "homonymes.json"), "utf8")));
    expect(homonyms.homonymes.map((h) => h.nom)).toEqual(["Zed Harrow"]);
    expect(homonyms.homonymes[0]!.occurrences[0]!.moteur).toBe("claude");
    const props = lirePropositions(r.dir);
    expect(props.concurrents!.find((c) => c.name === "Studio Alpha")).toMatchObject({ id: "studio-alpha", type: "structure", domains: ["studio-alpha.example"], citations: 88, statut: "extrait" });
    expect(props.homonymes!.map((h) => [h.id, h.value, h.statut])).toEqual([["zed-harrow", "Zed Harrow", "extrait"]]);

    // Validation simulée (bloc B) : panel actif et validé, concurrents retenus.
    const proposed = PanelSchema.parse(readYaml(join(r.dir, "proposition", "panel.yaml")));
    writeFileSync(join(r.dir, "panel.yaml"), stringify({ ...proposed, status: "validated", validatedBy: "Validateur fictif", validatedAt: DAY, prompts: proposed.prompts.map((p) => ({ ...p, status: "active" })) }));
    const subject = readYaml(join(r.dir, "subject.yaml"));
    subject.competitors = actors.acteurs
      .filter((a) => a.reponses >= 15) // 5 moteurs depuis l'ajout de Grok : « Club Unique » (2 questions) reste sous le choix
      .map((a) => CompetitorSchema.parse({ name: a.name, domains: [], aliases: a.variantes, category: a.type, markets: [], status: "confirmed", rationale: `${a.reponses} réponses de la reconnaissance (exemple ${a.exemple})` }));
    writeFileSync(join(r.dir, "subject.yaml"), stringify(subject));
    const b = loadSubject(r.dir);
    expect(b.panel.status).toBe("validated");
    expect(b.subject.competitors.map((c) => c.name).sort()).toEqual(["FitBook", "Marie Durand", "Studio Alpha"]);

    // Relance sans --go : rien de payant, les fichiers validés ne sont pas touchés.
    const again = await siteAdd({ ...opts, go: { faits: false, reconnaissance: false }, llm: undefined, collector: undefined });
    expect(again.created).toBe(false);
    expect(again.paidCalls).toEqual({ mistral: 0, moteurs: 0 });
    expect(loadSubject(r.dir).panel.status).toBe("validated");
  });
});

describe("acteurs et homonymes d'un corpus fictif", () => {
  const corpus: AnswerRow[] = [
    { id: "r1", engine: "chatgpt", promptId: "en-01", rawText: "Top picks:\n- **Harbor Padel Academy** – courts in the marina.\n- **Lina Ostrova**: certified coach, she trains beginners. See https://profiles.example/lina-ostrova\n- **Pros**: flexible.", citations: [{ url: "https://harbor-padel.example/" }] },
    { id: "r2", engine: "claude", promptId: "en-01", rawText: "## Harbor Padel Academy\nA club with eight courts. Lina Ostrova also coaches there. Note that Zed Harrow, a step coach, is unrelated to Coach Zed.", citations: [] },
    { id: "r3", engine: "perplexity", promptId: "en-02", rawText: "**TrainNow** is an app to book coaches. **Lína Óstrova** is popular. Coach Zed Dubai offers sessions too; see zedharrow-step.com.", citations: [{ url: "https://trainnow.example/app" }] },
  ];

  it("extrait, recompte et classe les acteurs nommés", () => {
    const f = extractActors(corpus, { brandTerms: ["Coach Zed", "coach-zed.example"], places: ["Dubai"], minReponses: 1, now });
    const byName = new Map(f.acteurs.map((a) => [a.name, a]));
    expect(byName.get("Lina Ostrova")).toMatchObject({ type: "personne", reponses: 3, parMoteur: { chatgpt: 1, claude: 1, perplexity: 1 }, parQuestion: { "en-01": 2, "en-02": 1 }, exemple: "r1", source: "https://profiles.example/lina-ostrova", variantes: ["Lína Óstrova"] });
    expect(byName.get("Harbor Padel Academy")).toMatchObject({ type: "structure", reponses: 2, exemple: "r1" });
    expect(byName.get("TrainNow")).toMatchObject({ type: "plateforme", reponses: 1, source: "https://trainnow.example/app" });
    expect(byName.has("Pros")).toBe(false);
    expect(f.acteurs[0]!.name).toBe("Lina Ostrova");
    expect(extractActors(corpus, { brandTerms: ["Coach Zed"], places: [], now }).acteurs.map((a) => a.name)).toEqual(["Lina Ostrova", "Harbor Padel Academy"]);
  });

  it("signale les homonymes avec la réponse et le passage, pas la marque suivie d'un lieu", () => {
    const f = findHomonyms(corpus, { brand: "Coach Zed", aliases: [], domains: ["coach-zed.example"], places: ["Dubai"], now });
    expect(f.termes).toEqual(["zed"]);
    expect(f.homonymes.map((h) => [h.nom, h.type, h.reponses])).toEqual([["Zed Harrow", "nom", 1]]);
    expect(f.homonymes[0]!.occurrences[0]).toMatchObject({ reponse: "r2", moteur: "claude", question: "en-01" });
    expect(f.homonymes[0]!.occurrences[0]!.passage).toContain("Zed Harrow, a step coach");
    // Domaine voisin : signalé quand le mot de la marque fait au moins 4 lettres.
    const g = findHomonyms(corpus, { brand: "Harrow Fit", aliases: [], domains: ["harrow-fit.example"], places: [], now });
    expect(g.homonymes.map((h) => [h.nom, h.type])).toEqual([["Zed Harrow", "nom"], ["zedharrow-step.com", "domaine"]]);
  });
});

describe("indexation : jamais de contournement", () => {
  it("consigne « non vérifiable » sur un refus ou un défi, « aucun-resultat » quand le moteur le dit", async () => {
    const fetch: PageFetcher = async (url) =>
      url.includes("bing")
        ? { url, finalUrl: url, status: 200, contentType: "text/html", body: "<p>There are no results for site:fictif.example</p>" }
        : { url, finalUrl: "https://www.google.com/sorry/index", status: 429, contentType: "text/html", body: "" };
    const r = await checkIndexation("fictif.example", fetch);
    expect(r.map((x) => [x.moteur, x.statut])).toEqual([
      ["bing", "aucun-resultat"],
      ["google", "non-verifiable"],
    ]);
  });
});

describe("arguments de la commande", () => {
  it("lit la commande du mandat", () => {
    expect(parseArgs(["add", "https://coach-zed.example", "--client", "c-1", "--langues", "fr,en", "--marches", "FR,AE"])).toEqual({
      url: "https://coach-zed.example",
      clientId: "c-1",
      clientName: undefined,
      name: undefined,
      languages: ["fr", "en"],
      countries: ["FR", "AE"],
      go: { faits: false, reconnaissance: false },
      base: false,
    });
    expect(parseArgs(["https://x.example", "--client", "c-1", "--langues", "fr", "--marches", "FR", "--go=reconnaissance", "--base"]).go).toEqual({ faits: false, reconnaissance: true });
    expect(() => parseArgs(["https://x.example", "--client", "c-1"])).toThrow(/usage/);
    expect(() => parseArgs(["https://x.example", "--client", "c-1", "--langues", "fr", "--marches", "FR", "--vite"])).toThrow(/option inconnue/);
  });
});
