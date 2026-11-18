import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canonique, clePublique, lireClePrivee, sceller, verifier } from "../src/rapport/sceau";
import { construireRapport } from "../src/rapport/construire";
import { verifierFichier } from "../src/rapport/verifier";
import { MemoryEngineDb } from "../src/engine/db";
import { runEngine } from "../src/engine/run";
import { noJudge } from "../src/judge";

const paire = () => generateKeyPairSync("ed25519");
const pem = (k: ReturnType<typeof paire>["privateKey"]) => String(k.export({ type: "pkcs8", format: "pem" }));
const maintenant = new Date("2026-12-02T09:14:00Z");

const sujet = { id: "studio-fictif", client_id: "client-fictif", nom: "Studio Fictif", url: "https://studio-fictif.example" };
const entreeAudit = {
  type: "AUDIT_INITIAL", du: null, au: "2026-12-01", sujet,
  indexation: { id: "a-idx", recu_le: "2026-11-30T08:00:00Z", scores: { indexation: 0.75 }, metriques: { google_pages_indexees: 2, google_pages_inspectees: 7, google_impressions_28j: 120 }, controles: [{ id: "llms", ok: false, titre: "llms.txt absent" }] },
  lighthouse: [{ id: "a-lh-m", recu_le: "2026-11-30T08:01:00Z", strategie: "mobile", scores: { performance: 0.62, accessibilite: 0.9, bonnes_pratiques: 1, seo: 0.92 } }],
  contenu: { id: "a-ct", recu_le: "2026-11-29T10:00:00Z", scores: { technique: 0.68, fonctionnel: 0.92, commercial: 0.64 } },
  constats: [{ id: "c1", cle: "llms", gravite: "important", titre: "llms.txt absent", correction: "Publier /llms.txt", derniere_fois: "2026-11-30" }],
  audit_ia: { id: "ae-ia", realise_le: "2026-11-28", score: 12, moteurs: ["chatgpt"], matrice: [{ id: "K01" }], methode: "Audit IA express." },
  preuves_ia: [{ id: "ev1", moteur: "chatgpt", question: "K01", recu_le: "2026-11-28T09:00:00Z", empreinte: "a".repeat(64) }],
  rapports_externes: [{ id: "ae-ext", outil: "Rapport fictif", realise_le: "2026-11-20", score: 54 }],
  plan: { id: "p1", le: "2026-11-30T09:00:00Z", resume: "Deux chantiers.", groupes: [{ titre: "Indexation", priorite: "P0", sources: ["Hygiène", "Rapport fictif"], actions: ["constat:llms"], etapes: ["Publier llms.txt"], critere_reussite: "Le contrôle ne le relève plus", qui: "equipe", effort: "XS" }] },
};

describe("sceau des rapports", () => {
  it("JSON canonique : l'ordre des clés ne change rien, les undefined sont retirés", () => {
    expect(canonique({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(canonique({ x: 1, y: 2 })).toBe(canonique({ y: 2, x: 1 }));
  });

  it("signe et vérifie ; la moindre modification est détectée ; une autre clé est refusée", () => {
    const { privateKey } = paire();
    const k = lireClePrivee(Buffer.from(pem(privateKey)).toString("base64"));
    const pub = clePublique(k);
    const rapport = { a: 1, liste: ["x", "y"] };
    const s = sceller(rapport, k, maintenant);
    expect(s.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(verifier(JSON.parse(JSON.stringify({ liste: ["x", "y"], a: 1 })), s, pub.pem)).toEqual({ integre: true });
    expect(verifier({ a: 2, liste: ["x", "y"] }, s, pub.pem)).toMatchObject({ integre: false, raison: expect.stringContaining("modifié") });
    const autre = clePublique(lireClePrivee(pem(paire().privateKey)));
    expect(verifier(rapport, s, autre.pem)).toMatchObject({ integre: false, raison: expect.stringContaining("clé publique différente") });
    expect(verifier(rapport, { ...s, signature: sceller({ autre: true }, k, maintenant).signature }, pub.pem)).toMatchObject({ integre: false, raison: "signature invalide" });
  });

  it("refuse une clé qui n'est pas Ed25519", () => {
    const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    expect(() => lireClePrivee(String(privateKey.export({ type: "pkcs8", format: "pem" })))).toThrow(/Ed25519/);
  });
});

describe("construction des rapports (règles fixes, sourcées)", () => {
  it("audit initial : chaque relevé devient une source, la réponse d'IA garde l'empreinte de sa réponse brute", () => {
    const { rapport, markdown } = construireRapport(entreeAudit, maintenant);
    expect(rapport.format).toBe("oia-rapport/1");
    expect(rapport.synthese).toMatchObject({ score_indexation: 75, google_pages_indexees: 2, score_ia: 12, constats_ouverts: 1, chantiers: 1, rapports_externes: 1 });
    const natures = rapport.sources.map((s) => s.nature);
    expect(natures).toEqual(expect.arrayContaining(["indexation", "lighthouse", "audit_ia", "reponse_ia", "contenu", "rapport_externe", "constat", "plan"]));
    const brute = rapport.sources.find((s) => s.nature === "reponse_ia")!;
    expect(brute).toMatchObject({ empreinte: "a".repeat(64), empreinte_de: "reponse_brute" });
    expect(markdown).toContain("Pages indexées par Google (pages inspectées) | 2 (7)");
    expect(markdown).toContain("technique 68 / 100");
    expect(markdown).toContain("- [ ] Publier llms.txt");
    expect(markdown).toMatch(/\[S1\]/);
    expect(markdown).toContain("## Sources");
  });

  it("suivi du plan : états comptés, gestes de la période listés avec leur preuve", () => {
    const { rapport, markdown } = construireRapport({
      type: "SUIVI_PLAN", du: "2026-11-01", au: "2026-11-30", sujet,
      actions: [
        { action_cle: "constat:llms", titre: "llms.txt absent", priorite: "P0", suivi: "fait", verification: "corrige_verifie", echeance: "2026-11-25" },
        { action_cle: "recommandation:r1", titre: "Fiche annuaire", priorite: "P1", suivi: "a_planifier", en_retard: true, echeance: "2026-11-10" },
      ],
      gestes: [{ id: 7, action_cle: "constat:llms", etat: "fait", responsable: "Mickaël", preuve: "https://studio-fictif.example/llms.txt", le: "2026-11-20T10:00:00Z" }],
      plan: null,
    }, maintenant);
    expect(rapport.synthese).toMatchObject({ actions: 2, faites: 1, verifiees: 1, en_retard: 1, a_planifier: 1, gestes_periode: 1 });
    expect(markdown).toContain("| Dont corrections vérifiées | 1 |");
    expect(markdown).toContain("corrigé, vérifié");
    expect(markdown).toContain("(en retard)");
  });

  it("résultats : départ, fin de période et écart ; aucune invention si un indicateur manque", () => {
    const { rapport, markdown } = construireRapport({
      type: "RESULTATS", du: "2026-11-01", au: "2026-11-30", sujet,
      depart: { id: "a0", recu_le: "2026-11-01T08:00:00Z", google_pages_indexees: 2, score_indexation: 75 },
      serie: [{ id: "a1", recu_le: "2026-11-15T08:00:00Z", google_pages_indexees: 4 }, { id: "a2", recu_le: "2026-11-30T08:00:00Z", google_pages_indexees: 6, score_indexation: 88 }],
      mesures_ia: [], corrections_verifiees: [],
    }, maintenant);
    expect(rapport.synthese).toMatchObject({ google_pages_indexees: { depart: 2, fin: 6 }, score_indexation: { depart: 75, fin: 88 }, releves: 2 });
    expect(markdown).toContain("| Pages indexées Google | 2 | 6 | +4 |");
    expect(markdown).toContain("| Clics Google 28 j | non mesuré | non mesuré | – |");
    expect(rapport.sources.map((s) => s.id)).toEqual(["a0", "a2", "a1"]);
  });
});

describe("moteur : demande RAPPORT", () => {
  function preparer() {
    const db = new MemoryEngineDb(() => maintenant);
    db.sujets.set("studio-fictif", { subject_id: "studio-fictif", client_id: "client-fictif", client_nom: "C", site_url: sujet.url, nom: "Studio Fictif", langues: ["fr"], marches: ["FR"], panel_version: null, executions: [], plafond_usd: 5, plafond_global_usd: 25 });
    const d = db.demander({ type: "RAPPORT", client_id: "client-fictif", subject_id: "studio-fictif", charge: { rapport: "AUDIT_INITIAL", au: "2026-12-01" } });
    db.rapportEntrees.set(d.id, entreeAudit);
    return { db, d };
  }
  const opts = (db: MemoryEngineDb, env: Record<string, string>) => ({
    db, dir: join(mkdtempSync(join(tmpdir(), "oia-rapport-")), "m"), hote: "t", version: "v", env, now: () => maintenant,
    fetch: async () => { throw new Error("aucune lecture du site"); }, crawlie: ["faux"],
    collector: () => { throw new Error("aucune collecte"); }, judge: () => noJudge(),
    auditLlm: () => { throw new Error("aucun modèle"); },
  });

  it("scelle le rapport, enregistre la clé publique ; l'export se vérifie hors de la base", async () => {
    const { db, d } = preparer();
    const { privateKey } = paire();
    const r = await runEngine(opts(db, { OIA_RAPPORT_CLE_PRIVEE: Buffer.from(pem(privateKey)).toString("base64") }) as never);
    expect(r.traitees[0]).toMatchObject({ id: d.id, type: "RAPPORT", statut: "DONE" });
    const enr = db.rapports[0] as { rapport: unknown; markdown: string; sceau: { empreinte: string; signature: string; cle_id: string } };
    expect(enr.markdown).toContain("## Sceau");
    expect(enr.markdown).toContain(enr.sceau.empreinte);
    const clePem = db.cles.get(enr.sceau.cle_id)!;
    // Aller-retour par JSON, comme un export du cockpit : toujours intègre.
    const fichier = JSON.stringify({ rapport: JSON.parse(JSON.stringify(enr.rapport)), sceau: enr.sceau, cle_publique: clePem });
    expect(verifierFichier(fichier, clePem)).toMatchObject({ integre: true, cle: "fournie à part" });
    // Un chiffre retouché : détecté.
    const triche = JSON.parse(fichier);
    triche.rapport.synthese.google_pages_indexees = 7;
    expect(verifierFichier(JSON.stringify(triche), clePem)).toMatchObject({ integre: false });
  });

  it("sans clé de signature : refusé, rien n'est enregistré", async () => {
    const { db, d } = preparer();
    const r = await runEngine(opts(db, {}) as never);
    expect(r.traitees[0]).toMatchObject({ id: d.id, statut: "FAILED" });
    expect(db.rapports).toHaveLength(0);
  });
});
