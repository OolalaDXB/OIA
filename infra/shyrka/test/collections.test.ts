import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Collections, niveauDepot } from "../src/corpus/collections.js";
import { lireExport } from "../src/corpus/conversations.js";
import type { Generateur } from "../src/corpus/propositions.js";
import { normer, type Vectoriseur } from "../src/corpus/sens.js";
import { composer, Corpus } from "../src/executive/corpus.js";
import type { DossierVerifie } from "../src/memoire/volume.js";

/** Sources groupées (mandat du 9 novembre 2026) : dépôts, corpus du 8 novembre, exports de conversations. Données fictives. */

let dir: string;
let corpus: Corpus;
let g: Collections;
const verifie = (s: string): DossierVerifie => ({ chemin: join(dir, s), volume: { point: dir, monte: true, chiffre: true, image: "t", inscriptible: true, detail: "t" } });
const vectoriser: Vectoriseur = async (t) => t.map((x) => { const v = new Float32Array(32); for (const m of x.toLowerCase().match(/[a-zé]{3,}/g) ?? []) v[m.length % 32]! += 1; return normer(v); });
let niveauxModele: string[] = [];
const generer: Generateur = async (_s, u) => JSON.stringify({ niveaux: [...u.matchAll(/^\[(\d+)\]/gm)].map((m) => ({ i: Number(m[1]), niveau: niveauxModele[Number(m[1])] ?? "interne", raison: "fictif" })) });

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "shyrka-collections-")));
  let col: Collections | null = null;
  corpus = new Corpus(verifie("c"), () => composer([], col?.sourcesCorpus() ?? []), () => null);
  g = col = new Collections({ dossier: verifie("c"), corpus, vectoriser, generer });
});
afterEach(() => {
  corpus.fermer();
  g.fermer();
  rmSync(dir, { recursive: true, force: true });
});

const ecrire = (chemin: string, texte: string) => {
  mkdirSync(join(chemin, ".."), { recursive: true });
  writeFileSync(chemin, texte);
};
function depot(nom: string): string {
  const r = join(dir, "depots", nom);
  ecrire(join(r, ".git", "HEAD"), "ref: refs/heads/main\n");
  ecrire(join(r, ".git", "objets.md"), "# historique\n\nNe doit jamais être indexé.\n");
  ecrire(join(r, "README.md"), "# Projet fictif Nébula\n\nLe projet fictif Nébula livre son tableau de bord en mai.\n\nNote : aucune donnée Swift ici.\n");
  ecrire(join(r, "docs", "guide.md"), "# Guide\n\nLe guide fictif explique la vue neb_stats_v2.\n");
  ecrire(join(r, "clients", "contrats.md"), "# Contrats\n\nLe contrat fictif du client Alpha court jusqu'en 2027.\n");
  ecrire(join(r, ".env.local"), "CLE=sk-live-ABCDEFGHIJKLMNOPQRSTUV\n");
  ecrire(join(r, "exports", "ventes.csv"), "client,montant\nAlpha,100\n");
  ecrire(join(r, "docs", "acces.md"), "# Accès\n\npassword: Hk82!vQz\n");
  ecrire(join(r, "src", "index.ts"), "export const x = 1;\n");
  ecrire(join(r, "docs", "vide.md"), "# Titre seul");
  return r;
}
const q = async (t: string) => (await vectoriser([t]))[0]!;

describe("dépôts : documentation seulement, exclusions signalées, validation par dépôt", () => {
  it("analyse sans indexer ; exclut historique, secrets, données de clients ; affine le niveau par dossier", () => {
    const c = g.analyserDepot(depot("nebula"), false);
    expect(c).toMatchObject({ etat: "a_valider", niveauDefaut: "interne" });
    const r = g.resume(c.id) as { aIndexer: number; exclusions: Record<string, number>; signales: { chemin: string }[]; passagesSwiftExclus: number; groupes: { groupe: string; niveau: string }[] };
    expect(r.aIndexer).toBe(4); // README, docs/guide.md, docs/vide.md, clients/contrats.md
    expect(r.exclusions).toEqual({ "fichier de secrets (environnement, clé, jeton)": 1, "données de clients ou sauvegarde": 1, "secret signalé : ressemble à un secret": 1 });
    expect(r.signales.map((x) => x.chemin).sort()).toEqual([".env.local", "docs/acces.md"]);
    expect(r.passagesSwiftExclus).toBe(1);
    expect(r.groupes.find((x) => x.groupe === "clients")?.niveau).toBe("confidentiel");
    expect(g.elements(c.id).some((e) => e.chemin.startsWith(".git"))).toBe(false);
    expect(corpus.comptes().extraits).toBe(0); // rien d'indexé avant la validation
    expect(niveauDepot("FlyMyFam", false).niveau).toBe("personnel");
    expect(niveauDepot("holdex-global-wealth", false).niveau).toBe("confidentiel");
    expect(niveauDepot("BEAUX", true).niveau).toBe("public");
  });

  it("valider : indexé, retrouvé, au bon niveau ; la ligne Swift n'est jamais indexée ; exclure un dossier le retire", async () => {
    const c = g.analyserDepot(depot("nebula"), false);
    g.valider(c.id);
    await g.attendre();
    const r = corpus.chercher("tableau de bord Nébula", { type: "mickael" }, 5, { vecteur: await q("tableau de bord Nébula"), sansSeuil: true });
    expect(r.find((x) => x.titre === "nebula · README.md")).toMatchObject({ connecteur: "depot-local", niveau: "interne", nature: "document" });
    expect(corpus.chercher("Swift", { type: "mickael" }, 5)).toEqual([]);
    const contrat = () => corpus.chercher("contrat client Alpha", { type: "mickael" }, 5).filter((x) => x.titre.includes("contrats"));
    expect(contrat()[0]?.niveau).toBe("confidentiel");
    expect(corpus.chercher("contrat client Alpha", { type: "mickael" }, 5, { niveaux: ["public", "interne"] }).filter((x) => x.titre.includes("contrats"))).toEqual([]);
    expect(g.elements(c.id).find((e) => e.chemin === "docs/vide.md")).toMatchObject({ statut: "exclu" }); // vide : exclu, sans bloquer les autres
    g.exclure(c.id, "clients");
    expect(contrat()).toEqual([]);
    g.changerNiveau(c.id, "public", "docs");
    expect(corpus.chercher("guide neb_stats_v2", { type: "mickael" }, 5)[0]?.niveau).toBe("public");
  });

  it("rafraîchir : un dépôt validé suit ses fichiers ; un nouveau secret est exclu et signalé ; un fichier disparu sort de l'index", async () => {
    const r = depot("nebula");
    const c = g.analyserDepot(r, false);
    g.valider(c.id);
    await g.attendre();
    ecrire(join(r, "docs", "nouveau.md"), "# Nouveau\n\nLa page fictive Orbite décrit la version deux.\n");
    ecrire(join(r, "docs", "fuite.md"), "# Fuite\n\napi_key = sk-test-ABCDEFGHIJ1234567890\n");
    unlinkSync(join(r, "docs", "guide.md"));
    const res = await g.rafraichir(join(dir, "depots"), {});
    await g.attendre();
    expect(res).toMatchObject({ sources: 1, retires: 1 });
    expect(corpus.chercher("page Orbite version", { type: "mickael" }, 5).length).toBeGreaterThan(0);
    expect(corpus.chercher("neb_stats_v2", { type: "mickael" }, 5)).toEqual([]);
    expect((g.resume(c.id) as { signales: { chemin: string }[] }).signales.map((x) => x.chemin)).toContain("docs/fuite.md");
  });
});

describe("corpus du 8 novembre (fictif ici) : niveau par fichier, faits par niveau, Swift écarté, analyse d'IA", () => {
  it("indexe les fichiers et les faits ; P3 en personnel ; un fait Swift n'est jamais indexé", async () => {
    const s = join(dir, "semence");
    ecrire(join(s, "manifest.json"), JSON.stringify({ documents: [{ filename: "01_IDENTITE.md", privacy: "P2" }, { filename: "02_SANTE.md", privacy: "P3" }] }));
    ecrire(join(s, "01_IDENTITE.md"), "# Identité fictive\n\nMickaël préfère les réponses courtes (fictif).\n");
    ecrire(join(s, "02_SANTE.md"), "# Santé fictive\n\nRoutine fictive de course à pied le matin.\n");
    ecrire(join(s, "facts.jsonl"), [
      JSON.stringify({ id: "f1", section: "Préférences", text: "Fait fictif : préfère le thé vert.", privacy: "P2" }),
      JSON.stringify({ id: "f2", section: "Santé", text: "Fait fictif : allergie aux noix.", privacy: "P3" }),
      JSON.stringify({ id: "f3", section: "Carrière", text: "Fait fictif : poste chez Swift.", privacy: "P2" }),
    ].join("\n"));
    const c = g.analyserSemence(s);
    expect((g.resume(c.id) as { groupes: { groupe: string; niveau: string }[] }).groupes.map((x) => [x.groupe, x.niveau])).toEqual([
      ["01_IDENTITE.md", "confidentiel"], ["02_SANTE.md", "personnel"], ["facts.jsonl (P2)", "confidentiel"], ["facts.jsonl (P3)", "personnel"], ["manifest.json", "confidentiel"],
    ]);
    g.valider(c.id);
    await g.attendre();
    const thé = corpus.chercher("thé vert", { type: "mickael" }, 5);
    expect(thé[0]).toMatchObject({ ref: "fait f1", nature: "analyse_ia", niveau: "confidentiel" });
    expect(corpus.chercher("allergie noix", { type: "mickael" }, 5)[0]).toMatchObject({ ref: "fait f2", niveau: "personnel" });
    expect(corpus.chercher("poste Swift", { type: "mickael" }, 5).filter((x) => x.ref === "fait f3")).toEqual([]);
  });
});

describe("exports de conversations : une conversation = un document, niveau proposé par le modèle local, Swift exclu", () => {
  const zipper = (nom: string, contenu: unknown, entree = "conversations.json") => {
    const d = join(dir, `z-${nom}`);
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, entree), JSON.stringify(contenu));
    execFileSync("/usr/bin/zip", ["-q", "-r", join(dir, nom), entree], { cwd: d });
    return join(dir, nom);
  };
  const chatgpt = (id: string, titre: string, echanges: [string, string][]) => {
    const mapping: Record<string, unknown> = { racine: { message: null, parent: null } };
    let parent = "racine";
    echanges.forEach(([role, texte], i) => {
      const n = `${id}-${i}`;
      mapping[n] = { message: { author: { role }, content: { parts: [texte] }, create_time: 1_762_600_000 + i }, parent };
      parent = n;
    });
    return { id, title: titre, create_time: 1_762_600_000, current_node: parent, mapping };
  };

  it("ChatGPT : conversations lues dans l'ordre, Swift et secret exclus, niveaux proposés, indexées comme analyses d'IA", async () => {
    const zip = zipper("export.zip", [
      chatgpt("c1", "Plan fictif du lancement Hélix", [["user", "Quel plan pour le lancement fictif Hélix ?"], ["assistant", "Lancer Hélix en trois étapes fictives : bêta, presse, ouverture."]]),
      chatgpt("c2", "Mutuelle fictive", [["user", "Compare deux mutuelles santé fictives pour ma famille."], ["assistant", "La mutuelle fictive A rembourse mieux l'optique."]]),
      chatgpt("c3", "Travail chez Swift", [["user", "Résume la réunion Swift."], ["assistant", "Résumé fictif."]]),
      chatgpt("c4", "Clé", [["user", "Ma clé api_key = sk-test-ABCDEFGHIJ1234567890 marche pas"], ["assistant", "Vérifie-la."]]),
    ]);
    const lu = await lireExport(zip);
    expect(lu.fournisseur).toBe("chatgpt");
    expect(lu.conversations[0]!.messages.map((m) => m.auteur)).toEqual(["Mickaël", "IA"]);
    niveauxModele = ["interne", "personnel"];
    const c = await g.analyserExport(zip);
    const r = g.resume(c.id) as { aIndexer: number; exclusions: Record<string, number>; parNiveau: Record<string, number> };
    expect(r).toMatchObject({ aIndexer: 2, exclusions: { "règle Swift": 1, "secret signalé : ressemble à une clé d'API": 1 }, parNiveau: { interne: 1, personnel: 1 } });
    expect(g.elements(c.id).find((e) => e.motif === "règle Swift")?.titre).toBe("(conversation exclue par la règle Swift)"); // même le titre n'est pas gardé
    g.valider(c.id);
    await g.attendre();
    const x = corpus.chercher("lancement Hélix étapes", { type: "mickael" }, 5);
    expect(x[0]).toMatchObject({ connecteur: "conversation-ia", nature: "analyse_ia", niveau: "interne", titre: "Plan fictif du lancement Hélix" });
    expect(x[0]!.ref).toMatch(/^messages? /);
    expect(corpus.chercher("mutuelle optique", { type: "mickael" }, 5, { niveaux: ["public", "interne"] })).toEqual([]);
    expect(corpus.chercher("réunion Swift", { type: "mickael" }, 5).filter((y) => y.connecteur === "conversation-ia")).toEqual([]);
  });

  it("Claude : format reconnu ; archive piégée ou sans conversations.json refusée", async () => {
    const zip = zipper("claude.zip", [{ uuid: "u1", name: "Idée fictive", created_at: "2026-11-01T10:00:00Z", chat_messages: [{ sender: "human", text: "Une idée fictive de nom ?", created_at: "2026-11-01T10:00:00Z" }, { sender: "assistant", content: [{ type: "text", text: "Pourquoi pas « Aster » (fictif)." }] }] }]);
    const lu = await lireExport(zip);
    expect(lu).toMatchObject({ fournisseur: "claude", conversations: [{ titre: "Idée fictive", messages: [{ auteur: "Mickaël" }, { auteur: "IA", texte: "Pourquoi pas « Aster » (fictif)." }] }] });
    await expect(lireExport(zipper("autre.zip", { x: 1 }, "notes.json"))).rejects.toMatchObject({ code: "pas_un_export" });
    const piege = join(dir, "piege.zip");
    execFileSync("python3", ["-c", `import zipfile; z=zipfile.ZipFile(${JSON.stringify(piege)},"w"); z.writestr("../conversations.json","[]"); z.close()`]);
    await expect(lireExport(piege)).rejects.toMatchObject({ code: "chemin_piege" });
  });
});

describe("questions personnelles (essai réel du 9 novembre)", () => {
  it("noms propres : « Vannes » trouvé comme un identifiant ; mots courants ignorés", async () => {
    const { nomsPropres } = await import("../src/executive/corpus.js");
    expect(nomsPropres("Que représente Vannes pour moi ?")).toEqual(["vannes"]);
    expect(nomsPropres("Quel est le projet de Mickaël avec Shyrka ?")).toEqual([]);
    const { questionPersonnelle } = await import("../src/passerelle/serveur.js");
    expect(questionPersonnelle("Dans quelle banque ai-je mes comptes ?")).toBe(true);
    expect(questionPersonnelle("Quel service SILLON utilise-t-il ?")).toBe(false);
  });

  it("une question sur Mickaël fait passer ses sources personnelles devant la documentation des dépôts", async () => {
    const r = depot("nebula");
    ecrire(join(r, "docs", "banques.md"), "# Banques\n\nLe module fictif compare les banques, les comptes et les frais bancaires des clients.\n");
    const c = g.analyserDepot(r, false);
    g.valider(c.id);
    const s = join(dir, "semence");
    ecrire(join(s, "manifest.json"), JSON.stringify({ documents: [] }));
    ecrire(join(s, "facts.jsonl"), JSON.stringify({ id: "b1", section: "Finances", text: "Fait fictif : les comptes de Mickaël sont à la banque Nordis.", privacy: "P3" }));
    const sem = g.analyserSemence(s);
    g.valider(sem.id);
    await g.attendre();
    const q = "Dans quelle banque ai-je mes comptes ?";
    const qv = (await vectoriser([q]))[0]!;
    const perso = corpus.chercher(q, { type: "mickael" }, 3, { vecteur: qv, personnelle: true, sansSeuil: true });
    expect(perso[0]).toMatchObject({ connecteur: "semence", ref: "fait b1" });
    const vannes = corpus.chercher("Que représente Nordis pour moi ?", { type: "mickael" }, 3, { vecteur: await q2("Que représente Nordis pour moi ?") });
    expect(vannes[0]).toMatchObject({ ref: "fait b1", identifiant: true });
  });
});
const q2 = async (t: string) => (await vectoriser([t]))[0]!;
