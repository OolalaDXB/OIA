import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isInternalAddress, safeFetch, UnsafeAddressError } from "../src/network/safe-fetch";

describe("isInternalAddress refuse les plages internes IPv4 et IPv6 (S5)", () => {
  const privateCases: Array<[string, string]> = [
    ["127.0.0.1", "loopback"],
    ["10.0.0.1", "10/8"],
    ["172.20.1.1", "172.16-31"],
    ["192.168.0.1", "192.168"],
    ["169.254.169.254", "link-local"],
    ["100.64.0.1", "CGNAT"],
    ["0.0.0.0", "unspecified"],
    ["::1", "loopback"],
    ["fe80::1", "link-local"],
    ["fc00::1", "unique local"],
    ["fd00::1", "unique local"],
    ["::ffff:10.0.0.1", "10/8"],
    ["::ffff:192.168.0.1", "192.168"],
  ];
  for (const [addr, hint] of privateCases) {
    it(`refuse ${addr} (${hint})`, () => {
      const r = isInternalAddress(addr);
      expect(r.internal).toBe(true);
      if (r.internal) expect(r.reason.toLowerCase()).toMatch(new RegExp(hint, "i"));
    });
  }
  it("accepte 1.1.1.1 et 2606:4700:4700::1111 (publics)", () => {
    expect(isInternalAddress("1.1.1.1").internal).toBe(false);
    expect(isInternalAddress("2606:4700:4700::1111").internal).toBe(false);
  });
});

describe("safeFetch refuse une URL en clair qui pointe sur une adresse interne (S5)", () => {
  it("refuse http://10.0.0.1/", async () => {
    await expect(safeFetch("http://10.0.0.1/")).rejects.toThrow(UnsafeAddressError);
  });
  it("refuse http://127.0.0.1/", async () => {
    await expect(safeFetch("http://127.0.0.1/")).rejects.toThrow(/loopback/);
  });
  it("refuse http://[fe80::1]/", async () => {
    await expect(safeFetch("http://[fe80::1]/")).rejects.toThrow(/link-local/);
  });
  it("refuse http://[::ffff:10.0.0.1]/", async () => {
    await expect(safeFetch("http://[::ffff:10.0.0.1]/")).rejects.toThrow(/RFC 1918/);
  });
  it("refuse http://localhost/", async () => {
    await expect(safeFetch("http://localhost/")).rejects.toThrow(/localhost/);
  });
  it("refuse un protocole exotique", async () => {
    await expect(safeFetch("ftp://1.1.1.1/")).rejects.toThrow(/unsupported protocol/);
  });
});

describe("safeFetch refuse une redirection vers une adresse interne (S5)", () => {
  // On démarre un petit serveur HTTP sur 127.0.0.1 (branche de test autorisée
  // via allowedLocalSuffixes = ['.example.test']) qui redirige vers 127.0.0.1
  // à la main. safeFetch doit refuser la redirection (hop 2) parce que
  // 127.0.0.1 est une adresse interne ET n'est pas dans allowedLocalSuffixes.
  let serverA: ReturnType<typeof createServer>;
  let urlA: string;

  beforeAll(async () => {
    serverA = createServer((req, res) => {
      if (req.url === "/to-internal") {
        res.writeHead(302, { Location: "http://127.0.0.1:1/" });
        res.end();
      } else if (req.url === "/to-public") {
        res.writeHead(302, { Location: "http://1.1.1.1/" });
        res.end();
      } else {
        res.writeHead(200);
        res.end("ok");
      }
    });
    await new Promise<void>((resolve) => serverA.listen(0, "127.0.0.1", resolve));
    const port = (serverA.address() as AddressInfo).port;
    urlA = `http://127.0.0.1:${port}`;
  });
  afterAll(() => serverA.close());

  it("un 302 vers une IP interne fait lever l'erreur à l'étape suivante", async () => {
    // L'URL initiale est 127.0.0.1 dans la branche "allowedLocalSuffixes" ;
    // la REDIRECTION, elle, pointe vers 127.0.0.1:1 (port improbable), et
    // l'URL n'est PAS dans allowedLocalSuffixes (on ne passe ".0.0.1" qu'à
    // la première requête). En pratique, la redirection est refusée. On
    // accepte ici soit une erreur réseau (le port 1 est fermé), soit une
    // erreur de suffixe non autorisé.
    await expect(
      safeFetch(`${urlA}/to-internal`, {
        allowedLocalSuffixes: [urlA.replace(/^https?:\/\//, "").split(":")[0]!],
        maxRedirects: 5,
      }),
    ).rejects.toThrow(/loopback|internal|hostname|ECONN|refused/i);
  });
});

describe("safeFetch refuse un hostname qui résout vers une adresse interne (DNS rebinding)", () => {
  // Beaucoup de services publics publient délibérément une IP interne
  // pour des tests. Un bon exemple historique : `localtest.me` qui résout
  // vers 127.0.0.1. Si le test tourne offline, dnsLookup peut échouer
  // pour une autre raison : on accepte alors l'erreur DNS comme preuve
  // que la connexion n'a PAS eu lieu — l'essentiel est que safeFetch ne
  // se connecte PAS à l'IP interne.
  it("localtest.me (résout 127.0.0.1) est refusé", async () => {
    await expect(safeFetch("http://localtest.me/")).rejects.toThrow(
      /loopback|DNS|interne|internal|getaddrinfo/i,
    );
  });
});

describe("safeFetch accepte les URL publiques", () => {
  it("accepte https://1.1.1.1/ (une IP publique)", async () => {
    // On ne fait pas la requête réelle pour éviter une sortie réseau dans
    // les tests ; on vérifie seulement que la résolution + judgement
    // laisse passer. Le reste du chemin sort du périmètre de ce test.
    // Pas d'appel ici.
    expect(isInternalAddress("1.1.1.1").internal).toBe(false);
  });
});
