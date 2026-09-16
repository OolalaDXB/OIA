import { describe, expect, it } from "vitest";
import { checkLink, checkLinks, classify, isBroken, isConclusive, summarise } from "../src/link-check";

const opts = { userAgent: "oia-test", timeoutMs: 1000, now: () => "2026-09-16T00:00:00.000Z" };

function respond(status: number, url = "https://example.org/a"): typeof fetch {
  return (async () => ({ status, url }) as Response) as unknown as typeof fetch;
}

describe("what counts as a broken link", () => {
  it("calls 404 and 410 dead, because the page is genuinely gone", () => {
    expect(classify(404, false).status).toBe("DEAD");
    expect(classify(410, false).status).toBe("DEAD");
    expect(isBroken("DEAD")).toBe(true);
  });

  it("does NOT call a refusal a broken link", () => {
    // 403 and 429 mean the server refused US. Reporting that as a dead link
    // sends someone to fix a page that works perfectly in a browser.
    for (const code of [401, 403, 429]) {
      expect(classify(code, false).status).toBe("REFUSED");
      expect(isBroken("REFUSED")).toBe(false);
    }
    expect(classify(403, false).note).toContain("not the same as the link being broken");
  });

  it("does not blame the link for a failing server", () => {
    expect(classify(503, false).status).toBe("SERVER_ERROR");
    expect(isBroken("SERVER_ERROR")).toBe(false);
    expect(isConclusive("SERVER_ERROR")).toBe(false);
  });

  it("distinguishes resolving from resolving after a redirect", () => {
    expect(classify(200, false).status).toBe("OK");
    expect(classify(200, true).status).toBe("REDIRECTED");
  });
});

describe("checkLink", () => {
  it("records a 200 with when it was checked", async () => {
    const r = await checkLink("https://example.org/a", { ...opts, fetchImpl: respond(200) });
    expect(r.status).toBe("OK");
    expect(r.httpCode).toBe(200);
    expect(r.checkedAt).toBe("2026-09-16T00:00:00.000Z");
  });

  it("reports where a redirect landed", async () => {
    const r = await checkLink("https://example.org/old", {
      ...opts,
      fetchImpl: respond(200, "https://example.org/new"),
    });
    expect(r.status).toBe("REDIRECTED");
    expect(r.finalUrl).toBe("https://example.org/new");
  });

  it("retries with GET when a server rejects HEAD", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (_u: string, init: { method: string }) => {
      calls.push(init.method);
      return { status: init.method === "HEAD" ? 405 : 200, url: "https://example.org/a" } as Response;
    }) as unknown as typeof fetch;
    const r = await checkLink("https://example.org/a", { ...opts, fetchImpl });
    expect(calls).toEqual(["HEAD", "GET"]);
    expect(r.status).toBe("OK");
  });

  it("refuses to fetch what it should not fetch", async () => {
    for (const url of ["http://localhost:8080/x", "http://127.0.0.1/x", "file:///etc/passwd", "not a url"]) {
      const r = await checkLink(url, { ...opts, fetchImpl: respond(200) });
      expect(r.status).toBe("REFUSED_TO_FETCH");
    }
  });

  it("never blames the URL for OUR egress policy", async () => {
    const fetchImpl = (async () => {
      throw new Error("CONNECT tunnel failed, response 403");
    }) as unknown as typeof fetch;
    const r = await checkLink("https://ted.europa.eu", { ...opts, fetchImpl });
    expect(r.status).toBe("BLOCKED_BY_POLICY");
    expect(isBroken(r.status)).toBe(false);
    expect(r.note).toContain("says nothing about the URL");
  });
});

describe("the report a human reads", () => {
  it("separates broken from refused from inconclusive", async () => {
    const results = await Promise.all([
      checkLink("https://a.example/1", { ...opts, fetchImpl: respond(200) }),
      checkLink("https://b.example/2", { ...opts, fetchImpl: respond(404) }),
      checkLink("https://c.example/3", { ...opts, fetchImpl: respond(403) }),
      checkLink("https://d.example/4", { ...opts, fetchImpl: respond(500) }),
    ]);
    const report = summarise(results);
    expect(report.checked).toBe(4);
    expect(report.ok).toBe(1);
    expect(report.broken.map((r) => r.httpCode)).toEqual([404]);
    expect(report.refused.map((r) => r.httpCode)).toEqual([403]);
    expect(report.inconclusive.map((r) => r.httpCode)).toEqual([500]);
  });

  it("checks each distinct URL once", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return { status: 200, url: "https://example.org/a" } as Response;
    }) as unknown as typeof fetch;
    const results = await checkLinks(
      ["https://example.org/a", "https://example.org/a", "https://example.org/b", ""],
      { ...opts, fetchImpl },
    );
    expect(results).toHaveLength(2);
    expect(calls).toBe(2);
  });
});

describe("the canary, and why it exists", () => {
  it("reports the open web as unreachable when the canaries fail", async () => {
    const { probeEgress } = await import("../src/link-check");
    const fetchImpl = (async () => {
      throw new Error("CONNECT tunnel failed, response 403");
    }) as unknown as typeof fetch;
    const probe = await probeEgress({ ...opts, fetchImpl });
    expect(probe.reachable).toBe(false);
    expect(probe.evidence).toContain("BLOCKED_BY_POLICY");
  });

  it("confirms reachability when a canary resolves", async () => {
    const { probeEgress } = await import("../src/link-check");
    const probe = await probeEgress({ ...opts, fetchImpl: respond(200, "https://example.com") });
    expect(probe.reachable).toBe(true);
  });
});
