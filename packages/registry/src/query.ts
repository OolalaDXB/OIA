import type { ProjectProfile } from "@oia/database";
import type { ProjectEntry, ProjectRegistry } from "./schema";

/**
 * Pure, dependency-free queries over a loaded registry. No fs, no yaml — this
 * module is what the browser bundle imports (the web app reads the generated
 * snapshot, never the YAML tree).
 */

export function activeProjects(registry: ProjectRegistry): ProjectEntry[] {
  return registry.projects.filter((p) => p.active);
}

export function findProject(registry: ProjectRegistry, slug: string): ProjectEntry | undefined {
  return registry.projects.find((p) => p.slug === slug);
}

/** Projects with automated discovery switched on, in stable slug order. */
export function discoverableProjects(registry: ProjectRegistry): ProjectEntry[] {
  return activeProjects(registry)
    .filter((p) => p.discovery.enabled)
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

/**
 * The matching-signal view of a project: exactly the existing ProjectProfile
 * shape, so the suggestion engine and the scoring package keep consuming the
 * type they already know.
 */
export function toProfile(entry: ProjectEntry): ProjectProfile {
  return {
    slug: entry.slug,
    name: entry.name,
    legalEntities: entry.legalEntities,
    sectors: entry.sectors,
    geographies: entry.geographies,
    stage: entry.stage,
    fundingTypes: entry.fundingTypes,
    ...(entry.amountRange ? { amountRange: entry.amountRange } : {}),
    keywords: entry.keywords,
    exclusions: entry.exclusions,
  };
}

export function toProfiles(registry: ProjectRegistry): ProjectProfile[] {
  return activeProjects(registry).map(toProfile);
}

/** True when the owner has signed the profile off (matters for how it is shown). */
export function isConfirmed(entry: ProjectEntry): boolean {
  return entry.profileReview.status === "CONFIRMED_BY_OWNER";
}
