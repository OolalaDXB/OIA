import { describe, expect, it } from "vitest";
import {
  ClientSchema,
  SiteSchema,
  SubjectRefSchema,
  assertTenantReadAllowed,
  checkTenancy,
  resolveActionMode,
  type Client,
  type Site,
  type SubjectRef,
} from "../src/tenancy";

function sampleClient(overrides: Partial<Client> = {}): Client {
  return ClientSchema.parse({
    id: "fictive-client",
    displayName: "Fictive Client (donnée fictive)",
    ownership: "external",
    status: "active",
    monthlyBudgetUsd: 30,
    defaultRepoActionMode: "proposition",
    contacts: [{ id: "owner-fictive", displayName: "Fictive Owner", email: "owner@example.test", role: "owner" }],
    ...overrides,
  });
}
function sampleSite(overrides: Partial<Site> = {}): Site {
  return SiteSchema.parse({
    id: "fictive-site",
    clientId: "fictive-client",
    primaryUrl: "https://fictive-site.example.test/",
    additionalUrls: [],
    status: "active",
    repository: null,
    ...overrides,
  });
}
function sampleSubject(overrides: Partial<SubjectRef> = {}): SubjectRef {
  return SubjectRefSchema.parse({
    id: "fictive-subject",
    clientId: "fictive-client",
    siteIds: ["fictive-site"],
    status: "active",
    ...overrides,
  });
}

describe("tenancy contract", () => {
  it("a well-formed bundle has no problems", () => {
    expect(checkTenancy({ clients: [sampleClient()], sites: [sampleSite()], subjects: [sampleSubject()] })).toEqual([]);
  });

  it("a site must reference a known client", () => {
    const problems = checkTenancy({
      clients: [sampleClient()],
      sites: [sampleSite({ clientId: "ghost" })],
      subjects: [],
    });
    expect(problems).toContain('site fictive-site: unknown clientId "ghost"');
  });

  it("a subject cannot cross clients via its siteIds", () => {
    const other = sampleClient({ id: "other-client" });
    const otherSite = sampleSite({ id: "other-site", clientId: "other-client" });
    const problems = checkTenancy({
      clients: [sampleClient(), other],
      sites: [sampleSite(), otherSite],
      subjects: [sampleSubject({ siteIds: ["fictive-site", "other-site"] })],
    });
    expect(problems).toContain('subject fictive-subject: siteId "other-site" belongs to client "other-client", not "fictive-client"');
  });

  it("external client cannot grant direct repo action", () => {
    const site = sampleSite({
      repository: { url: "https://github.test/ownr/repo", branch: "main", actionMode: "direct" },
    });
    const problems = checkTenancy({ clients: [sampleClient()], sites: [site], subjects: [] });
    expect(problems).toContain('site fictive-site: external client cannot grant "direct" repo action');
  });

  it("internal client may grant direct, external must stay at proposition", () => {
    const internal = sampleClient({ id: "internal-client", ownership: "internal", defaultRepoActionMode: "direct" });
    const external = sampleClient();
    const internalSite = sampleSite({
      id: "internal-site",
      clientId: "internal-client",
      repository: { url: "https://github.test/mt/repo", branch: "main", actionMode: "direct" },
    });
    expect(resolveActionMode(internal, internalSite)).toBe("direct");

    const externalSiteNoRepo = sampleSite();
    expect(resolveActionMode(external, externalSiteNoRepo)).toBe("proposition");

    // Defence in depth: resolveActionMode rebinds `direct` to `proposition`
    // for external clients even if a mis-written row got past checkTenancy.
    const malformed = sampleSite({
      repository: { url: "https://github.test/ownr/repo", branch: "main", actionMode: "direct" },
    });
    expect(resolveActionMode(external, malformed)).toBe("proposition");
  });

  it("read with a wrong client scope raises", () => {
    const row = { clientId: "a", siteId: "s", subjectId: null };
    expect(() => assertTenantReadAllowed(row, { clientId: "b" })).toThrow(/tenant isolation/);
    expect(() => assertTenantReadAllowed(row, { clientId: "a" })).not.toThrow();
  });
});
