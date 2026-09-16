import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { ProjectEntrySchema, type ProjectEntry, type ProjectRegistry } from "./schema";
import { SourceEntrySchema, type SourceEntry, type SourceRegistry } from "./sources";

/**
 * Node-side loader for `registry/projects/*.yaml`. Git stores the truth; this
 * exposes it. Every file is Zod-validated on load — an invalid profile is a
 * hard error, never a silently-skipped project.
 *
 * Browser consumers must NOT import this module: they read the generated
 * snapshot (`registry/generated/projects.json`) instead.
 */

/** Absolute path of `registry/` at the repo root, from this file's location. */
export function defaultRegistryRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../../../registry");
}

export function loadRegistry(root: string = defaultRegistryRoot()): ProjectRegistry {
  const dir = join(root, "projects");
  const projects: ProjectEntry[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const raw = parse(readFileSync(join(dir, file), "utf8"));
    const parsed = ProjectEntrySchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`registry/projects/${file} is invalid: ${parsed.error.message}`);
    }
    const entry = parsed.data;
    const expected = `${entry.slug}.yaml`;
    if (file !== expected) {
      throw new Error(`registry/projects/${file} declares slug "${entry.slug}" — rename it to ${expected}`);
    }
    projects.push(entry);
  }
  return { projects, generatedAt: "" };
}

export function loadSources(root: string = defaultRegistryRoot()): SourceRegistry {
  const dir = join(root, "sources");
  const sources: SourceEntry[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(".yaml") && !file.endsWith(".yml")) continue;
    const parsed = SourceEntrySchema.safeParse(parse(readFileSync(join(dir, file), "utf8")));
    if (!parsed.success) throw new Error(`registry/sources/${file} is invalid: ${parsed.error.message}`);
    const expected = `${parsed.data.id}.yaml`;
    if (file !== expected) throw new Error(`registry/sources/${file} declares id "${parsed.data.id}" — rename it to ${expected}`);
    sources.push(parsed.data);
  }
  return { sources };
}
