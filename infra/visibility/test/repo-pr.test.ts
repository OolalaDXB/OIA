import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fixRobotsTxt } from "../src/repo/fixers";
import { ensureGitInit, postPullRequestDisabled, prepareSimulatedPR } from "../src/repo/pr";
import { readRepo } from "../src/repo/reader";
import { ClientSchema, SiteSchema, type Client, type Site } from "../src/tenancy";

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, "fixtures", "repos");

function mkClient(overrides: Partial<Client> = {}): Client {
  return ClientSchema.parse({
    id: "fictive-client",
    displayName: "Fictive Client (donnée fictive)",
    ownership: "external",
    status: "active",
    monthlyBudgetUsd: 30,
    defaultRepoActionMode: "proposition",
    contacts: [{ id: "owner", displayName: "Fictive Owner", email: "owner@example.test", role: "owner" }],
    ...overrides,
  });
}
function mkSite(overrides: Partial<Site> = {}): Site {
  return SiteSchema.parse({
    id: "fictive-site",
    clientId: "fictive-client",
    primaryUrl: "https://fictive-site.example.test/",
    status: "active",
    repository: { url: "https://github.test/fictive/html", branch: "main", actionMode: "proposition" },
    ...overrides,
  });
}

let workRoot = "";
beforeEach(() => {
  workRoot = mkdtempSync(join(tmpdir(), "oia-vis-pr-"));
});
afterEach(() => {
  rmSync(workRoot, { recursive: true, force: true });
});

describe("prepareSimulatedPR on a fictive repo", () => {
  function prepFixtureCopy(name: string) {
    const target = join(workRoot, name);
    cpSync(join(fixtures, name), target, { recursive: true });
    ensureGitInit(target);
    return target;
  }

  it("creates a branch, commits a fix and renders a PR body (no push)", () => {
    const repo = prepFixtureCopy("html-fictive");
    const m = readRepo(repo);
    const fix = fixRobotsTxt(m, { siteUrl: "https://fictive-site.example.test/", brand: "Fictive Brand" });
    const client = mkClient();
    const site = mkSite();
    const pr = prepareSimulatedPR({
      client,
      site,
      repoRoot: repo,
      fixes: [fix],
      recommendationId: "rec-fictive-1",
      decisionId: "dec-fictive-1",
      evidences: [{ label: "Crawlie audit · pilote fictif", sha256: "deadbeef" }],
      title: "robots.txt minimale",
      ciExpected: "pass",
    });
    expect(pr.branch).toBe("oia-visibility/rec-fictive-1");
    expect(pr.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(pr.body).toMatch(/Recommendation `rec-fictive-1`/);
    expect(pr.body).toMatch(/Mode : `proposition`/);
    expect(pr.body).toMatch(/robots\.txt/);
  });

  it("refuses to run when mode is `lecture`", () => {
    const repo = prepFixtureCopy("html-fictive");
    const m = readRepo(repo);
    const fix = fixRobotsTxt(m, { siteUrl: "https://fictive-site.example.test/", brand: "Fictive Brand" });
    const client = mkClient({ defaultRepoActionMode: "lecture" });
    const site = mkSite({ repository: { url: "https://github.test/fictive/html", branch: "main", actionMode: "lecture" } });
    expect(() =>
      prepareSimulatedPR({
        client,
        site,
        repoRoot: repo,
        fixes: [fix],
        recommendationId: "r",
        decisionId: "d",
        evidences: [],
        title: "x",
      }),
    ).toThrow(/action mode is "lecture"/);
  });

  it("refuses to post a real PR tonight (D4 guard is always on)", async () => {
    const client = mkClient();
    const site = mkSite();
    await expect(
      postPullRequestDisabled({
        client,
        site,
        pr: {
          branch: "oia-visibility/x",
          commitSha: "x",
          title: "x",
          body: "x",
          fixes: [],
          ciExpected: "unknown",
        },
      }),
    ).rejects.toThrow(/real GitHub posting is disabled/);
  });

  it("refuses to post when the resolved mode is lecture (defence in depth)", async () => {
    const client = mkClient({ defaultRepoActionMode: "lecture" });
    const site = mkSite({ repository: null });
    await expect(
      postPullRequestDisabled({
        client,
        site,
        pr: {
          branch: "oia-visibility/x",
          commitSha: "x",
          title: "x",
          body: "x",
          fixes: [],
          ciExpected: "unknown",
        },
      }),
    ).rejects.toThrow(/action mode is "lecture"/);
  });
});
