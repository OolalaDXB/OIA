import type { ProjectProfile } from "@oia/database";
import { PROJECT_REGISTRY, activeProjects, toProfile, toProfiles, type ProjectEntry } from "@oia/registry";

/**
 * The workspace's view of "which projects does OIA work for?".
 *
 * These used to be a hand-maintained array in this file. They now come from the
 * registry (`registry/projects/*.yaml` → generated snapshot), so adding next
 * year's project is one YAML file and no code change, and so the console can
 * show whether a profile is owner-confirmed or still a working hypothesis.
 *
 * Entity doctrine (reminder, encoded per project in `legalEntities`): EU/FR
 * funding routes through Oolala France SAS, GCC commercial through Oolala Next
 * FZ-LLC; dedicated entities only on precise triggers.
 */

/** Full registry entries (identity, status, discovery config, review state). */
export const PROJECT_ENTRIES: ProjectEntry[] = activeProjects(PROJECT_REGISTRY);

/** Matching-signal view — the EXISTING ProjectProfile shape the matcher takes. */
export const THESTUDIO_PROJECTS: ProjectProfile[] = toProfiles(PROJECT_REGISTRY);

export function projectEntry(slug: string): ProjectEntry | undefined {
  return PROJECT_ENTRIES.find((p) => p.slug === slug);
}

export function projectName(slug: string): string {
  return projectEntry(slug)?.name ?? slug;
}

/** Re-exported so consumers need one import for "the projects and their shape". */
export { toProfile };
export type { ProjectEntry };
