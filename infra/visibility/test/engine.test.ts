/**
 * Moteur branché sur la file (mandat v16, bloc B), sur la FAUSSE base en mémoire : site
 * entièrement fictif servi par un fetch injecté, faux Crawlie, collecteur et juge fictifs.
 * Aucune requête réseau, aucun appel payant, rien hors d'un dossier temporaire.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CollectRequest, Collector } from "../src/collector";
import { engineRole, MemoryEngineDb, MOTEUR_SQL, PsqlEngineDb, type SqlParam } from "../src/engine/db";
import { checkGo, dbWindowId, engineHost, evidenceUuid, runEngine, type EngineOptions } from "../src/engine/run";
import { noJudge } from "../src/judge";
import type { FetchedPage, PageFetcher } from "../src/site/pages";

const SITE = "https://atelier-fictif.example/";
const SUBJECT = "atelier-fictif-example";
const CLIENT = "client-fictif";
const KEYS = { OPENAI_API_KEY: "k", ANTHROPIC_API_KEY: "k", OPENROUTER_API_KEY: "k", MISTRAL_API_KEY: "k" };

const HOME = `<!doctype html><html lang="fr"><head>
<title>Atelier Fictif | Cours de poterie à Lyon</title>
<meta name="description" content="Cours de poterie et stages, à Lyon.">
<meta property="og:site_name" content="Atelier Fictif">
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  name: "Atelier Fictif",
  address: { "@type": "PostalAddress", streetAddress: "1 rue Fictive", postalCode: "69000", addressLocality: "Lyon", addressCountry: "FR" },
  makesOffer: [{ "@type": "Offer", name: "Cours de poterie", price: "45", priceCurrency: "EUR" }],
})}</script>
</head><body><h1>Cours de poterie à Lyon</h1><a href="/tarifs">Tarifs</a></body></html>`;

const PAGES: Record<string, string> = {
  [SITE]: HOME,
  "https://atelier-fictif.example/tarifs": "<html lang=fr><body><h1>Tarifs</h1><p>Cours : 45 €.</p></body></html>",
};

function fakeSite(): PageFetcher {
  return async (url): Promise<FetchedPage> => {
    const body = PAGES[url];
    return body ? { url, finalUrl: url, status: 200, contentType: "text/html; charset=utf-8", body } : { url, finalUrl: url, status: 404, contentType: "text/html", body: "introuvable" };
  };
}

function fakeCrawlie(root: string): string[] {
  const report = join(root, "crawlie-fictif.json");
  writeFileSync(
    report,
    JSON.stringify({
      config: { url: SITE, render: false },
      summary: { totalPages: 2, indexablePages: 2 },
      pages: [
        { url: SITE, status: 200, title: "Atelier Fictif", wordCount: 80, text: "Cours dès 45 €", indexable: true, schemaTypes: ["LocalBusiness"] },
        { url: "https://atelier-fictif.example/tarifs", status: 200, title: "Tarifs", wordCount: 20, text: "Cours 45 €", indexable: true, schemaTypes: [] },
      ],
      issues: [],
      robotsFound: true,
      robotsBlocked: [],
      sitemapFound: true,
      llmsTxtFound: false,
    }),
  );
  const bin = join(root, "crawlie-fictif.sh");
  writeFileSync(bin, `#!/bin/sh\nout=""; prev=""\nfor a in "$@"; do [ "$prev" = "-o" ] && out="$a"; prev="$a"; done\ncp "${report}" "$out"\n`);
  chmodSync(bin, 0o755);
  return [bin];
}

/** Réponses fictives : deux acteurs cités plusieurs fois, la marque, un homonyme. */
function fakeCollector(clock: () => Date, calls: CollectRequest[]): Collector {
  return {
    name: "oia-direct",
    async collect(req) {
      calls.push(req);
      const text = [
        "Voici quelques ateliers à Lyon :",
        "1. **Terre Alpha** – un atelier de poterie avec plusieurs tours, [site](https://terre-alpha.example/).",
        "2. **Argile Bêta** propose des stages le week-end.",
        req.engine === "claude" ? "À ne pas confondre : Atelier Fictive Boutique, une boutique sans lien avec Atelier Fictif." : "Atelier Fictif propose aussi des cours du soir.",
      ].join("\n");
      return { collectorName: "oia-direct", collectorRunId: `fictif:${calls.length}`, rawText: text, structured: { cost: { usd: 0.01, readable: true } }, citations: [{ url: "https://terre-alpha.example/" }], costUsd: 0.01, engineVersion: "fictif-1", receivedAt: clock().toISOString() };
    },
  };
}

function setup() {
  const root = mkdtempSync(join(tmpdir(), "oia-engine-"));
  let t = new Date("2026-12-01T10:00:00Z");
  const clock = () => t;
  const setClock = (iso: string) => (t = new Date(iso));
  const db = new MemoryEngineDb(clock);
  db.sujets.set(SUBJECT, { subject_id: SUBJECT, client_id: CLIENT, client_nom: "Client fictif", site_url: SITE, nom: "Atelier Fictif", langues: ["fr"], marches: ["FR"], panel_version: null, executions: [], plafond_usd: 200, plafond_global_usd: 300 });
  const calls: CollectRequest[] = [];
  const opts = (extra: Partial<EngineOptions> = {}): EngineOptions => ({
    db,
    dir: join(root, "moteur"),
    hote: "mac-fictif",
    version: "abc1234",
    env: { ...KEYS },
    now: clock,
    fetch: fakeSite(),
    crawlie: fakeCrawlie(root),
    collector: () => fakeCollector(clock, calls),
    judge: () => noJudge(),
    judgeName: "aucun",
    ...extra,
  });
  return { root, db, clock, setClock, calls, opts };
}

const siteAdd = (db: MemoryEngineDb) => db.demander({ type: "SITE_ADD", client_id: CLIENT, subject_id: SUBJECT, charge: { url: SITE, nom: "Atelier Fictif", langues: ["fr"], marches: ["FR"] } });

/** GO simulé, tel que vis_go_* l'enregistre : coût vu = estimation courante ; renvoie ce coût. */
function giveGo(db: MemoryEngineDb, window: string, debut: string | null): number {
  const f = db.fenetres.get(window)!;
  f.statut = "go_donne";
  if (debut) f.debut = debut;
  const cout = db.estimations.get(window)!.cout_estime_usd;
  f.go = { go_par: "mickael", go_le: "2026-12-01T10:00:00Z", cout_vu_au_go_usd: cout };
  return cout;
}

const validateAll = (db: MemoryEngineDb, nature: string) => {
  for (const [id, v] of db.propositions) if (v[0]!.nature === nature && v[v.length - 1]!.etat === "propose") db.decider(id, "valide");
};

describe("moteur (bloc B) : une demande de chaque type, sur la fausse base", () => {
  it("SITE_ADD → RECON → WINDOW_RUN → 5 jours → clôture → REPORT → REMEASURE_PROPOSE", async () => {
    const { db, setClock, calls, opts } = setup();

    // SITE_ADD : propositions et estimation de la reconnaissance, sans aucun appel payant.
    const d1 = siteAdd(db);
    const r1 = await runEngine(opts());
    expect(r1.traitees).toEqual([expect.objectContaining({ id: d1.id, type: "SITE_ADD", statut: "DONE" })]);
    expect(calls).toHaveLength(0);
    const natures = [...db.propositions.values()].map((v) => v[0]!.nature);
    expect(natures).toContain("fait");
    expect(natures.filter((n) => n === "question").length).toBe(10);
    expect(natures).toContain("audit");
    expect([...db.propositions.values()].every((v) => v[0]!.propose_par === "moteur" && v[0]!.id.startsWith(`${SUBJECT}:`))).toBe(true);
    const recon = dbWindowId(SUBJECT, "reconnaissance");
    expect(db.estimations.get(recon)).toMatchObject({ nature: "reconnaissance", libelle: "Reconnaissance", jours_prevus: 1 });
    expect(r1.traitees[0]!.resultat).toMatchObject({ faits_mistral: expect.stringMatching(/aucun GO/) });
    const q = [...db.propositions.values()].find((v) => v[0]!.nature === "question")![0]!;
    expect(q.contenu).toMatchObject({ langue: "fr", marquee: expect.any(Boolean), moteurs: expect.arrayContaining(["chatgpt", "gemini", "perplexity"]) });

    // RECON sans GO : refusée, aucune collecte.
    db.demander({ type: "RECON", client_id: CLIENT, subject_id: SUBJECT, charge: { window_id: recon } });
    const r2 = await runEngine(opts());
    expect(r2.traitees[0]).toMatchObject({ type: "RECON", statut: "FAILED", erreur: expect.stringMatching(/aucun GO enregistré en base/) });
    expect(calls).toHaveLength(0);
    expect(db.alertes.at(-1)).toMatchObject({ type: "ECHEC_DEMANDE", gravite: "bloquant", client_id: CLIENT });

    // RECON avec GO : une journée de questions non marquées, acteurs et homonymes, estimation du J0.
    validateAll(db, "question");
    db.sujets.get(SUBJECT)!.panel_version = 1;
    const coutRecon = giveGo(db, recon, "2026-12-01");
    db.demander({ type: "RECON", client_id: CLIENT, subject_id: SUBJECT, charge: { window_id: recon, cout_vu_usd: coutRecon } });
    const r3 = await runEngine(opts());
    expect(r3.traitees[0]).toMatchObject({ type: "RECON", statut: "DONE" });
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every((c) => c.windowId.startsWith("reconnaissance-"))).toBe(true);
    expect(db.evidence.size).toBe(calls.length);
    expect([...db.evidence.values()].every((e) => e.window_id === recon && e.client_id === CLIENT)).toBe(true);
    expect(db.jours.get(`${recon}#1`)).toMatchObject({ etat: "complet" });
    expect(db.fenetres.get(recon)!.statut).toBe("close");
    const concurrents = [...db.propositions.values()].filter((v) => v[0]!.nature === "concurrent").map((v) => v[0]!.contenu.nom);
    expect(concurrents).toEqual(expect.arrayContaining(["Terre Alpha", "Argile Bêta"]));
    const j0 = dbWindowId(SUBJECT, "j0");
    expect(db.estimations.get(j0)).toMatchObject({ nature: "reference", libelle: "J0", jours_prevus: 5, heure_utc: "07:00" });

    // WINDOW_RUN sans GO : refusée.
    validateAll(db, "concurrent");
    db.demander({ type: "WINDOW_RUN", client_id: CLIENT, subject_id: SUBJECT, charge: { window_id: j0 } });
    expect((await runEngine(opts())).traitees[0]).toMatchObject({ statut: "FAILED", erreur: expect.stringMatching(/aucun GO/) });

    // WINDOW_RUN avec GO : fenêtre inscrite, rien collecté avant le début.
    const coutJ0 = giveGo(db, j0, "2026-12-02");
    const before = calls.length;
    db.demander({ type: "WINDOW_RUN", client_id: CLIENT, subject_id: SUBJECT, charge: { window_id: j0, cout_vu_usd: coutJ0, debut: "2026-12-02", gel: `freeze-${j0}` } });
    const r4 = await runEngine(opts({ quotidien: true }));
    expect(r4.traitees[0]!.erreur).toBeNull();
    expect(r4.traitees[0]).toMatchObject({ type: "WINDOW_RUN", statut: "DONE", resultat: expect.objectContaining({ debut: "2026-12-02", jours: 5 }) });
    expect(calls.length).toBe(before);

    // Cinq passages quotidiens : jours consignés, puis clôture, rapport et page client en base.
    for (const day of ["2026-12-02", "2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06"]) {
      setClock(`${day}T07:00:00Z`);
      await runEngine(opts({ quotidien: true }));
    }
    expect([1, 2, 3, 4, 5].map((n) => db.jours.get(`${j0}#${n}`)?.etat)).toEqual(["complet", "complet", "complet", "complet", "complet"]);
    expect(db.fenetres.get(j0)!.statut).toBe("close");
    expect(db.pages.map((p) => [p.window_id, p.nature, p.langue])).toEqual([[j0, "rapport", "fr"], [j0, "page_client", "fr"]]);
    expect(db.pages.every((p) => !/<script\b/i.test(p.html))).toBe(true);
    expect(db.alertes.filter((a) => a.type === "RAPPORT_PRET")).toHaveLength(1);
    const evidence = db.evidence.size;

    // Relance le même jour : rien n'est refait.
    await runEngine(opts({ quotidien: true }));
    expect(db.evidence.size).toBe(evidence);
    expect(db.pages).toHaveLength(2);
    expect(db.alertes.filter((a) => a.type === "RAPPORT_PRET")).toHaveLength(1);

    // REPORT : rapport et page relus du cache, réécrits en base.
    db.demander({ type: "REPORT", client_id: CLIENT, subject_id: SUBJECT, charge: { window_id: j0 } });
    expect((await runEngine(opts())).traitees[0]).toMatchObject({ type: "REPORT", statut: "DONE" });
    expect(db.pages).toHaveLength(4);

    // REMEASURE_PROPOSE : J1 chiffré, 21 jours après la dernière exécution, jamais lancé.
    db.sujets.get(SUBJECT)!.executions = [{ recommandation: "rec-fictive-001", date: "2026-12-10", fenetre: null }];
    db.demander({ type: "REMEASURE_PROPOSE", client_id: CLIENT, subject_id: SUBJECT });
    const r5 = await runEngine(opts());
    expect(r5.traitees[0]).toMatchObject({ type: "REMEASURE_PROPOSE", statut: "DONE", resultat: expect.objectContaining({ au_plus_tot: "2026-12-31", fenetre: dbWindowId(SUBJECT, "j1") }) });
    expect(db.estimations.get(dbWindowId(SUBJECT, "j1"))).toMatchObject({ nature: "remesure", libelle: "J1", compare_avec: j0 });
    expect(db.fenetres.get(dbWindowId(SUBJECT, "j1"))!.statut).toBe("proposee");
    // Le passage quotidien réestime la même remesure, sans en créer une seconde.
    await runEngine(opts({ quotidien: true }));
    expect([...db.fenetres.keys()].filter((k) => k.endsWith("-j2"))).toEqual([]);
    expect(db.estimations.get(dbWindowId(SUBJECT, "j1"))!.cout_estime_usd).toBe(r5.traitees[0]!.resultat!.cout_estime_usd);

    // Signe de vie à chaque passage : hôte, commit, prochain passage dans 5 minutes.
    const last = db.signes.at(-1)!;
    expect(last).toMatchObject({ hote: "mac-fictif", version: "abc1234" });
    expect(Date.parse(last.prochain) - Date.parse(last.le)).toBe(5 * 60_000);
  }, 60_000);
});

describe("moteur : file, reprise, concurrence, idempotence", () => {
  it("une demande DONE n'est jamais reprise, ni terminée deux fois", async () => {
    const { db, opts } = setup();
    const d = siteAdd(db);
    await runEngine(opts());
    expect(db.demandes.find((x) => x.id === d.id)!.statut).toBe("DONE");
    expect((await runEngine(opts())).traitees).toEqual([]);
    await expect(db.terminer(d.id, {}, null)).rejects.toThrow(/55000/);
  });

  it("reprise après plantage : RUNNING de plus de 30 minutes repasse en file, pas avant", async () => {
    const { db, opts, setClock } = setup();
    const d = db.demander({ type: "REMEASURE_PROPOSE", client_id: CLIENT, subject_id: SUBJECT });
    Object.assign(d, { statut: "RUNNING", commencee_le: "2026-12-01T09:40:00Z" });
    expect((await runEngine(opts())).traitees).toEqual([]);
    setClock("2026-12-01T10:11:00Z");
    const r = await runEngine(opts());
    // Reprise en base (vis_moteur_prendre) ; ici, la demande reprise est traitée normalement.
    expect(r.traitees.map((t) => t.id)).toEqual([d.id]);
    expect(db.demandes[0]).toMatchObject({ statut: "DONE", tentatives: 1, resultat: { proposee: false } });
  });

  it("après 3 prises abandonnées, la demande passe FAILED avec une alerte (comme la base)", async () => {
    const { db, opts } = setup();
    const d = db.demander({ type: "REMEASURE_PROPOSE", client_id: CLIENT, subject_id: SUBJECT });
    Object.assign(d, { statut: "RUNNING", commencee_le: "2026-12-01T09:00:00Z", tentatives: 3 });
    expect((await runEngine(opts())).traitees).toEqual([]);
    expect(db.demandes[0]).toMatchObject({ statut: "FAILED", erreur: expect.stringMatching(/abandonnée 3 fois/) });
    expect(db.alertes.at(-1)!.type).toBe("ECHEC_DEMANDE");
  });

  it("preuves : une preuve existante d'un autre texte refuse tout le paquet (23514)", async () => {
    const { db } = setup();
    const row = { id: evidenceUuid("a"), client_id: CLIENT, site_id: SUBJECT, subject_id: SUBJECT, window_id: "w", prompt_id: "fr-01", prompt_version: 1, prompt_language: "fr", engine: "chatgpt", engine_version: null, collector_name: "oia-direct", collector_run_id: "r", received_at: "2026-12-01T10:00:00Z", raw_text: "texte", structured: {}, citations: [], cost_usd: 0 };
    expect(await db.preuves([row])).toBe(1);
    expect(await db.preuves([row])).toBe(0);
    await expect(db.preuves([{ ...row, id: evidenceUuid("b") }, { ...row, raw_text: "autre" }])).rejects.toThrow(/23514/);
    expect(db.evidence.size).toBe(1);
  });

  it("deux passages en concurrence ne prennent jamais la même demande", async () => {
    const { db, opts } = setup();
    const ids = Array.from({ length: 6 }, () => db.demander({ type: "REMEASURE_PROPOSE", client_id: CLIENT, subject_id: "sujet-inconnu" }).id);
    const [a, b] = await Promise.all([runEngine(opts({ hote: "a" })), runEngine(opts({ hote: "b" }))]);
    const taken = [...a.traitees, ...b.traitees].map((t) => t.id);
    expect(taken.sort()).toEqual([...ids].sort());
    expect(new Set(taken).size).toBe(6);
    expect(a.traitees.length).toBeGreaterThan(0);
    expect(b.traitees.length).toBeGreaterThan(0);
  });

  it("fausse base : comme la vraie, pas d'en_cours sans GO", async () => {
    const { db } = setup();
    await db.estimer({ subject_id: SUBJECT, window_id: "w-1", nature: "reference", libelle: "J0", compare_avec: null, jours_prevus: 5, questions: 1, moteurs: [], cout_estime_usd: 1, detail_estimation: { appels: 1, par_moteur: {}, juge: { nom: "aucun", usd: 0 } } });
    await expect(db.fenetre(SUBJECT, "w-1", "en_cours", null)).rejects.toThrow(/55000/);
  });

  it("un passage sans demande signe quand même sa présence", async () => {
    const { db, opts } = setup();
    await runEngine(opts());
    expect(db.signes).toHaveLength(1);
  });
});

describe("moteur : GO, plafonds et coût illisible relus en base", () => {
  const go = { window_id: "w", statut: "go_donne" as const, debut: "2026-12-02", heure_utc: "07:00", go_par: "mickael", go_le: "2026-12-01T10:00:00Z", cout_vu_au_go_usd: 5, cout_estime_usd: 5, plafond_usd: 20, reel_usd: 0, engage_usd: 5, plafond_global_usd: 100 };
  it("refus lisibles, avec le type d'alerte", () => {
    expect(() => checkGo(null, "x")).toThrow(/introuvable/);
    expect(() => checkGo({ ...go, go_le: null }, "x")).toThrow(/aucun GO/);
    expect(() => checkGo({ ...go, cout_estime_usd: null }, "x")).toThrow(expect.objectContaining({ alerte: "COUT_ILLISIBLE" }));
    expect(() => checkGo({ ...go, cout_vu_au_go_usd: 4 }, "x")).toThrow(/coût vu au GO différent/);
    expect(() => checkGo({ ...go, plafond_usd: null }, "x")).toThrow(expect.objectContaining({ alerte: "PLAFOND" }));
    expect(() => checkGo({ ...go, reel_usd: 16 }, "x")).toThrow(expect.objectContaining({ alerte: "PLAFOND" }));
    expect(() => checkGo(go, "x", 4.5)).toThrow(/coût vu de la demande/);
    expect(checkGo(go, "x", 5).plafond_usd).toBe(20);
  });

  it("RECON au plafond : refusée, alerte PLAFOND, aucun appel", async () => {
    const { db, opts, calls } = setup();
    siteAdd(db);
    await runEngine(opts());
    validateAll(db, "question");
    db.sujets.get(SUBJECT)!.panel_version = 1;
    const recon = dbWindowId(SUBJECT, "reconnaissance");
    giveGo(db, recon, "2026-12-01");
    db.budget.reel_usd.set(CLIENT, 199.9);
    db.demander({ type: "RECON", client_id: CLIENT, subject_id: SUBJECT, charge: { window_id: recon } });
    const r = await runEngine(opts());
    expect(r.traitees[0]!.statut).toBe("FAILED");
    expect(db.alertes.at(-1)!.type).toBe("PLAFOND");
    expect(calls).toHaveLength(0);
  });
});

describe("base réelle par psql : requêtes paramétrées", () => {
  it("aucune valeur dans le SQL, toutes en variables psql", async () => {
    const seen: { sql: string; params: Record<string, SqlParam> }[] = [];
    const db = new PsqlEngineDb(async (sql, params) => {
      seen.push({ sql, params });
      return sql.includes("vis_moteur_prendre") ? null : "1";
    });
    const hostile = "x'); drop table vis.evidence; --";
    await db.prendre(hostile);
    await db.alerter({ client_id: hostile, subject_id: null, gravite: "alerte", type: "JOUR_PARTIEL", message: hostile });
    await db.proposer({ subject_id: "s", id: "s:fait:a", nature: "fait", contenu: { enonce: hostile }, source: null });
    for (const s of seen) {
      expect(s.sql).not.toContain(hostile);
      expect(s.sql).not.toContain("drop table");
      expect(Object.values(s.params).map((v) => (typeof v === "object" ? JSON.stringify(v) : String(v))).join(" ")).toContain("drop table");
    }
    // Rôle du moteur posé avant chaque requête ; chaque fonction appelée est dans la liste attendue.
    for (const s of seen) expect(s.sql.startsWith("set role service_role;\n")).toBe(true);
    const names = new Set(MOTEUR_SQL.map((x) => x.split("(")[0]));
    for (const s of seen) expect(names.has(/select (vis_moteur_\w+)/.exec(s.sql)![1]!)).toBe(true);
  });

  it("identifiants : uuid stable pour une preuve, hôte sans adresse", () => {
    expect(evidenceUuid("oia-direct:s:j0:2026-12-02:fr-01@v1:chatgpt")).toBe(evidenceUuid("oia-direct:s:j0:2026-12-02:fr-01@v1:chatgpt"));
    expect(evidenceUuid("a")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(engineHost({ OIA_VIS_ENGINE_HOST: "Mac-Studio.local" })).toBe("mac-studio");
    expect(engineHost({ OIA_VIS_ENGINE_HOST: "192.168.1.4" })).toBe("moteur");
    // Le rôle du moteur est toujours posé : jamais le rôle de connexion seul.
    expect(engineRole({})).toBe("service_role");
    expect(engineRole({ OIA_VIS_ENGINE_ROLE: "" })).toBe("service_role");
    expect(() => engineRole({ OIA_VIS_ENGINE_ROLE: "x; reset role" })).toThrow(/refusé/);
  });

  it("le cache du moteur ne s'écrit jamais dans le dépôt", async () => {
    const { opts } = setup();
    await expect(runEngine(opts({ dir: join(__dirname, "..", "moteur-test-refus") }))).rejects.toThrow(/dépôt/);
    expect(existsSync(join(__dirname, "..", "moteur-test-refus"))).toBe(false);
  });
});


describe("installation launchd (préparée, rien chargé)", () => {
  it("preparer : deux plist valides, 5 minutes et passage quotidien, journaux hors du dépôt", async () => {
    const { readFileSync } = await import("node:fs");
    const home = mkdtempSync(join(tmpdir(), "oia-engine-home-"));
    const out = join(home, "plist");
    const root = join(__dirname, "..");
    const stdout = execFileSync("bash", [join(root, "scripts", "engine-install.sh"), "preparer", out, "--heure-utc", "07:00"], { env: { ...process.env, HOME: home }, encoding: "utf8" });
    expect(stdout).toMatch(/rien n'est chargé/);
    const file = readFileSync(join(out, "com.oia.visibility.moteur.plist"), "utf8");
    const daily = readFileSync(join(out, "com.oia.visibility.moteur.quotidien.plist"), "utf8");
    expect(file).toMatch(/<key>StartInterval<\/key><integer>300<\/integer>/);
    expect(file).toMatch(/<key>KeepAlive<\/key><dict><key>SuccessfulExit<\/key><false\/>/);
    expect(daily).toMatch(/<string>--quotidien<\/string>/);
    expect(daily).toMatch(/StartCalendarInterval/);
    for (const p of [file, daily]) {
      expect(p).not.toMatch(/@[A-Z_]+@/);
      expect(p).toContain(`${home}/Library/Logs/oia-visibility/`);
    }
    // Rien d'installé : aucun dossier LaunchAgents ni Logs créé.
    expect(existsSync(join(home, "Library"))).toBe(false);
  });
});

describe("psql : valeurs sur l'entrée standard, citées par psql", () => {
  it("script : un \\set par variable, aucune valeur dans la requête", async () => {
    const { psqlScript } = await import("../src/engine/db");
    const v = "a'b\\c\nd";
    const script = psqlScript("select :'p_x';\n", { p_x: v });
    expect(script).toBe("\\set p_x 'a''b\\\\c\\nd'\nselect :'p_x';\n");
    expect(() => psqlScript("select 1;", { "p_x; drop": "1" })).toThrow(/refusé/);
  });

  // Postgres jetable, local (socket Unix dans un dossier temporaire, aucun port TCP) : sauté sans initdb.
  const hasPg = spawnSync("initdb", ["--version"]).status === 0 && spawnSync("psql", ["--version"]).status === 0;
  it.skipIf(!hasPg)("aller-retour exact par une vraie psql : apostrophes, barres obliques, lignes, :'var', commandes psql", async () => {
    const { createHash } = await import("node:crypto");
    const { psqlRunner } = await import("../src/engine/db");
    const dir = mkdtempSync(join(tmpdir(), "oia-pg-"));
    const data = join(dir, "data");
    const sock = mkdtempSync(join("/tmp", "oia-pg-sock-"));
    execFileSync("initdb", ["-D", data, "-A", "trust", "-U", "postgres", "--no-sync"], { stdio: "ignore" });
    execFileSync("pg_ctl", ["-D", data, "-o", `-c listen_addresses='' -k ${sock} -p 54329`, "-w", "-l", join(dir, "log"), "start"], { stdio: "ignore" });
    try {
      const run = psqlRunner("psql", ["-h", sock, "-p", "54329", "-U", "postgres", "-d", "postgres"]);
      const values = ["x'); drop table t; --", "a\\b\\\\c", "ligne 1\nligne 2\r\nfin", "`date` :'p_y' :p_y \\gexec \\! echo", "é « » 漢字 😀", "", "'", "\\"];
      for (const v of values) {
        const md5 = createHash("md5").update(v, "utf8").digest("hex");
        expect(await run("select md5(:'p_x');\n", { p_x: v, p_y: "autre" })).toBe(md5);
      }
      const j = { enonce: "l'atelier \\ « cours »\n", n: 3 };
      expect(JSON.parse((await run("select (:'p_j'::jsonb)::text;\n", { p_j: j }))!)).toEqual(j);
      expect(await run("select nullif(:'p_n', '') is null;\n", { p_n: null })).toBe("t");
      await expect(run("select 1/0;\n", {})).rejects.toThrow(/division by zero/);
    } finally {
      execFileSync("pg_ctl", ["-D", data, "-m", "immediate", "stop"], { stdio: "ignore" });
    }
  }, 60_000);
});
