import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultRegistryRoot, loadRegistry, loadSources } from "./load";
import { validateRegistry, validateSources } from "./validate";

/**
 * CLI: pnpm --filter @oia/registry generate
 *
 * Writes `packages/registry/src/snapshot.json` — the browser-readable snapshot
 * the static console bundles at build time (a browser cannot read the YAML
 * tree, and a package must not import files from outside its own root).
 *
 * `registry/projects/*.yaml` stays the source of truth; this file is generated,
 * committed, and a test fails the build if the two ever drift apart.
 */
const registry = loadRegistry(defaultRegistryRoot());
const errors = validateRegistry(registry).filter((i) => i.level === "ERROR");
if (errors.length > 0) {
  for (const e of errors) console.error(`ERROR [${e.where}] ${e.message}`);
  console.error("refusing to generate a snapshot from an invalid registry");
  process.exit(1);
}

// No timestamp on purpose: the snapshot must be byte-stable so a re-generation
// with no profile change produces no diff. Git provides the "when".
const out = join(dirname(fileURLToPath(import.meta.url)), "snapshot.json");
writeFileSync(out, JSON.stringify({ generatedAt: "", projects: registry.projects }, null, 2) + "\n");
console.log(`wrote ${out} (${registry.projects.length} projects)`);

const sources = loadSources(defaultRegistryRoot());
const sourceErrors = validateSources(sources).filter((i) => i.level === "ERROR");
if (sourceErrors.length > 0) {
  for (const e of sourceErrors) console.error(`ERROR [${e.where}] ${e.message}`);
  process.exit(1);
}
const sourcesOut = join(dirname(fileURLToPath(import.meta.url)), "sources.snapshot.json");
writeFileSync(sourcesOut, JSON.stringify({ sources: sources.sources }, null, 2) + "\n");
console.log(`wrote ${sourcesOut} (${sources.sources.length} sources)`);
