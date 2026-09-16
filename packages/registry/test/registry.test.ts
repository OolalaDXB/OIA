import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { defaultRegistryRoot, loadRegistry } from "../src/load";
import { validateRegistry } from "../src/validate";
import {
  PROJECT_REGISTRY,
  ProjectRegistrySnapshotSchema,
  activeProjects,
  discoverableProjects,
  findProject,
  toProfile,
  toProfiles,
} from "../src";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = defaultRegistryRoot();
const registry = loadRegistry(root);

describe("project registry", () => {
  it("loads every YAML profile and validates it against the schema", () => {
    expect(registry.projects.length).toBeGreaterThanOrEqual(15);
    for (const p of registry.projects) {
      expect(p.slug).toMatch(/^[a-z0-9-]+$/);
      expect(p.name).not.toEqual("");
    }
  });

  it("has no honesty errors (sign-off dated, hypotheses sourced, discovery answerable)", () => {
    const errors = validateRegistry(registry).filter((i) => i.level === "ERROR");
    expect(errors).toEqual([]);
  });

  it("covers the studio itself, not only its products", () => {
    const studio = findProject(registry, "thestudio-mt");
    expect(studio?.kind).toBe("STUDIO");
    expect(studio?.discovery.watch).toContain("TENDER_RFP");
  });

  it("carries non-software projects too — the registry is not a software registry", () => {
    const kinds = new Set(registry.projects.map((p) => p.kind));
    expect(kinds).toContain("FOUNDATION");
    expect(kinds).toContain("VENTURE");
    expect(kinds).toContain("ADVISORY");
  });

  it("exposes profiles in the EXISTING ProjectProfile shape (no DTO redefined)", () => {
    const bawaba = findProject(registry, "bawaba");
    expect(bawaba).toBeDefined();
    const profile = toProfile(bawaba!);
    expect(Object.keys(profile).sort()).toEqual(
      ["exclusions", "fundingTypes", "geographies", "keywords", "legalEntities", "name", "sectors", "slug", "stage"].sort(),
    );
    expect(toProfiles(registry).length).toBe(activeProjects(registry).length);
  });

  it("only reports a project as discoverable when a query could actually run", () => {
    for (const p of discoverableProjects(registry)) {
      expect(p.discovery.queryTerms.length + p.discovery.cpvCodes.length).toBeGreaterThan(0);
      expect(p.keywords.length).toBeGreaterThan(0);
    }
  });

  it("marks every unconfirmed profile as a hypothesis with a stated source", () => {
    for (const p of registry.projects) {
      if (p.profileReview.status === "DRAFT") {
        expect(p.profileReview.derivedFrom.length).toBeGreaterThan(0);
      } else {
        expect(p.profileReview.confirmedAt).toBeTruthy();
      }
    }
  });

  it("keeps the generated browser snapshot in sync with the YAML source of truth", () => {
    const snapshotRaw = JSON.parse(
      readFileSync(join(__dirname, "../src/snapshot.json"), "utf8"),
    );
    const snapshot = ProjectRegistrySnapshotSchema.parse(snapshotRaw);
    expect(snapshot.projects).toEqual(registry.projects);
    // …and the value the browser actually imports is that same snapshot.
    expect(PROJECT_REGISTRY.projects).toEqual(registry.projects);
  });
});
