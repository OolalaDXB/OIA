import { describe, expect, it } from "vitest";
import {
  assertPublicUrl,
  assertResponseNotInternal,
  dryRunSiteInit,
  InternalAddressError,
} from "../src/site-init";

describe("assertPublicUrl refuses internal addresses (règle 15)", () => {
  const cases: Array<[string, string]> = [
    ["http://localhost/", "localhost"],
    ["http://sub.localhost/", "localhost"],
    ["http://127.0.0.1/", "loopback"],
    ["http://10.0.0.1/", "RFC 1918"],
    ["http://172.20.0.1/", "RFC 1918"],
    ["http://192.168.1.1/", "RFC 1918"],
    ["http://169.254.1.1/", "link-local"],
    ["http://[::1]/", "loopback"],
    ["http://[fe80::1]/", "link-local"],
    ["http://[fc00::1]/", "unique local"],
    ["ftp://example.test/", "unsupported protocol"],
    ["not-a-url", "not a valid"],
  ];
  for (const [url, reason] of cases) {
    it(`refuses ${url}`, () => {
      expect(() => assertPublicUrl(url)).toThrow(InternalAddressError);
      try {
        assertPublicUrl(url);
      } catch (e) {
        expect((e as InternalAddressError).reason).toMatch(new RegExp(reason, "i"));
      }
    });
  }
});

describe("assertPublicUrl accepts public URLs and the test suffix", () => {
  it("accepts https://fictive-site.example.test/", () => {
    const u = assertPublicUrl("https://fictive-site.example.test/", { allowedLocal: [".example.test"] });
    expect(u.hostname).toBe("fictive-site.example.test");
  });

  it("accepts a plain IP 1.1.1.1 (not in an internal range)", () => {
    expect(() => assertPublicUrl("https://1.1.1.1/")).not.toThrow();
  });

  it("refuses 192.168 even inside .example.test suffix match (defence in depth)", () => {
    // allowedLocal is applied by hostname, not by IP. 192.168 is still refused
    // because 192.168.x.x doesn't end with .example.test.
    expect(() => assertPublicUrl("http://192.168.1.1/", { allowedLocal: [".example.test"] })).toThrow();
  });
});

describe("dryRunSiteInit", () => {
  it("builds a subject id from the hostname (www. stripped)", () => {
    const out = dryRunSiteInit({ clientId: "fictive-client", url: "https://www.fictive-subject.example.test/" });
    expect(out.subjectId).toBe("fictive-subject-example-test");
    expect(out.primaryUrl).toBe("https://www.fictive-subject.example.test/");
    expect(out.repo).toBeUndefined();
  });

  it("passes the repo option through", () => {
    const out = dryRunSiteInit({ clientId: "fictive-client", url: "https://a.example.test/", repo: "ownr/repo" });
    expect(out.repo).toEqual({ ownerName: "ownr/repo" });
  });

  it("refuses an internal URL", () => {
    expect(() => dryRunSiteInit({ clientId: "fictive-client", url: "http://localhost/" })).toThrow(InternalAddressError);
  });
});

describe("assertResponseNotInternal refuses an internal redirect target", () => {
  it("refuses a 3xx Location that resolved to an internal IP", () => {
    expect(() => assertResponseNotInternal("http://10.0.0.5/admin")).toThrow(InternalAddressError);
  });
});
