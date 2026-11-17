import { createVerify, generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import { assertion, bilanGsc, createGscClient, lireCompteService, proprieteDuSite, type GscFetch } from "../src/hygiene/gsc";

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const COMPTE = JSON.stringify({ type: "service_account", client_email: "oia-visibility@projet-fictif.iam.gserviceaccount.com", private_key: PEM, token_uri: "https://oauth2.googleapis.com/token" });
const SITE = "https://studio-fictif.example";

function fauxGoogle(etat: { permission?: string; propriete?: string; sitemaps?: unknown[]; verdict?: string }, appels: { url: string; methode: string; corps?: string; auth?: string }[]): GscFetch {
  return async (url, init) => {
    appels.push({ url, methode: init?.method ?? "GET", corps: init?.body, auth: init?.headers?.authorization });
    const rep = (o: unknown) => ({ ok: true, status: 200, text: async () => JSON.stringify(o) });
    if (url.startsWith("https://oauth2.googleapis.com/token")) return rep({ access_token: "jeton-fictif", expires_in: 3600 });
    if (url.endsWith("/webmasters/v3/sites")) return rep({ siteEntry: [{ siteUrl: etat.propriete ?? "sc-domain:studio-fictif.example", permissionLevel: etat.permission ?? "siteFullUser" }, { siteUrl: "https://autre.example/", permissionLevel: "siteOwner" }] });
    if (url.includes("/sitemaps/") && init?.method === "PUT") return rep({});
    if (url.endsWith("/sitemaps")) return rep({ sitemap: etat.sitemaps ?? [] });
    if (url.includes("searchAnalytics")) return rep({ rows: [{ keys: ["padel exempleville"], clicks: 4, impressions: 120, ctr: 0.03, position: 8.26 }] });
    if (url.includes("urlInspection")) {
      const u = JSON.parse(init!.body!).inspectionUrl as string;
      return rep({ inspectionResult: { indexStatusResult: u.endsWith("/padel") ? { verdict: "NEUTRAL", coverageState: "Explorée, actuellement non indexée" } : { verdict: etat.verdict ?? "PASS", coverageState: "Envoyée et indexée", googleCanonical: `${SITE}/`, userCanonical: `${SITE}/` } } });
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ error: { message: "introuvable" } }) };
  };
}

describe("Search Console : compte de service", () => {
  it("lit le JSON, refuse un fichier incomplet, signe un jeton RS256 vérifiable", () => {
    expect(() => lireCompteService("pas du json")).toThrow(/illisible/);
    expect(() => lireCompteService(JSON.stringify({ type: "service_account" }))).toThrow(/incomplet/);
    const jwt = assertion(lireCompteService(COMPTE), Date.UTC(2026, 10, 17));
    const [tete, corps, signe] = jwt.split(".");
    const charge = JSON.parse(Buffer.from(corps!, "base64url").toString());
    expect(charge).toMatchObject({ iss: "oia-visibility@projet-fictif.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/webmasters", aud: "https://oauth2.googleapis.com/token" });
    expect(charge.exp - charge.iat).toBe(3600);
    expect(createVerify("RSA-SHA256").update(`${tete}.${corps}`).verify(publicKey, Buffer.from(signe!, "base64url"))).toBe(true);
  });

  it("choisit la propriété de domaine, sinon le préfixe d'adresse", () => {
    const e = [{ siteUrl: "https://www.studio-fictif.example/", permissionLevel: "siteOwner" }, { siteUrl: "sc-domain:studio-fictif.example", permissionLevel: "siteFullUser" }];
    expect(proprieteDuSite(SITE, e)!.siteUrl).toBe("sc-domain:studio-fictif.example");
    expect(proprieteDuSite(SITE, [e[0]!])!.siteUrl).toBe("https://www.studio-fictif.example/");
    expect(proprieteDuSite(SITE, [])).toBeNull();
  });
});

describe("Search Console : bilan d'un site", () => {
  const maintenant = new Date("2026-11-17T08:00:00Z");
  it("soumet le sitemap s'il manque, inspecte l'échantillon, lit les requêtes", async () => {
    const appels: { url: string; methode: string; corps?: string; auth?: string }[] = [];
    const r = await bilanGsc(createGscClient(COMPTE, fauxGoogle({}, appels), () => maintenant.getTime()), SITE, `${SITE}/sitemap.xml`, [`${SITE}/`, `${SITE}/padel`], maintenant);
    expect(r.propriete).toBe("sc-domain:studio-fictif.example");
    expect(r.actions).toEqual([{ action: "sitemap soumis à Google", cible: `${SITE}/sitemap.xml`, resultat: "fait" }]);
    expect(appels.find((a) => a.methode === "PUT")!.url).toContain(encodeURIComponent(`${SITE}/sitemap.xml`));
    expect(appels.filter((a) => a.url.startsWith("https://oauth2")).length).toBe(1); // jeton réutilisé
    expect(appels.filter((a) => !a.url.startsWith("https://oauth2")).every((a) => a.auth === "Bearer jeton-fictif")).toBe(true);
    const ko = Object.fromEntries(r.controles.map((c) => [c.id, c.ok]));
    expect(ko).toMatchObject({ "gsc-propriete": true, "gsc-sitemap": true, "gsc-indexation": false, "gsc-canonique": true });
    expect(r.controles.find((c) => c.id === "gsc-indexation")!.valeur).toBe("1/2 pages indexées");
    expect(r.requetes[0]).toEqual({ requete: "padel exempleville", impressions: 120, clics: 4, position: 8.3 });
    const req = JSON.parse(appels.find((a) => a.url.includes("searchAnalytics"))!.corps!);
    expect(req).toMatchObject({ startDate: "2026-10-17", endDate: "2026-11-14", dimensions: ["query"] });
  });

  it("autorisation Restreinte : rien n'est écrit ; propriété absente : critique, avec l'adresse du compte à ajouter", async () => {
    const appels: { url: string; methode: string }[] = [];
    const r = await bilanGsc(createGscClient(COMPTE, fauxGoogle({ permission: "siteRestrictedUser" }, appels), () => maintenant.getTime()), SITE, `${SITE}/sitemap.xml`, [], maintenant);
    expect(appels.some((a) => a.methode === "PUT")).toBe(false);
    expect(r.actions[0]!.resultat).toMatch(/Restreinte/);
    const absent = await bilanGsc(createGscClient(COMPTE, fauxGoogle({ propriete: "sc-domain:autre-chose.example" }, []), () => maintenant.getTime()), SITE, null, [], maintenant);
    expect(absent.controles).toHaveLength(1);
    expect(absent.controles[0]).toMatchObject({ id: "gsc-propriete", ok: false, gravite: "critique" });
    expect(absent.controles[0]!.correction).toContain("oia-visibility@projet-fictif.iam.gserviceaccount.com");
  });

  it("une erreur de Google ne cite jamais la clé privée", async () => {
    const refus: GscFetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: "invalid_grant", error_description: "Invalid JWT Signature." }) });
    const e = (await bilanGsc(createGscClient(COMPTE, refus), SITE, null, [], maintenant).catch((x: Error) => x)) as Error;
    expect(e.message).toBe("Search Console jeton : HTTP 400 (Invalid JWT Signature.)");
    expect(e.message).not.toContain("PRIVATE KEY");
  });
});
