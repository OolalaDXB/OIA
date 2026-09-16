import { loadRegistry, loadSources } from "./load";
import { validateRegistry, validateSources } from "./validate";

/** CLI: pnpm --filter @oia/registry validate */
const registry = loadRegistry();
const sources = loadSources();
const issues = [...validateRegistry(registry), ...validateSources(sources)];

console.log(
  `registry: ${registry.projects.length} project(s), ` +
    `${registry.projects.filter((p) => p.active).length} active, ` +
    `${registry.projects.filter((p) => p.discovery.enabled).length} with automated discovery, ` +
    `${registry.projects.filter((p) => p.profileReview.status === "CONFIRMED_BY_OWNER").length} owner-confirmed`,
);
console.log(
  `sources: ${sources.sources.length} declared · ` +
    `${sources.sources.filter((s) => s.status === "LIVE").length} live · ` +
    `${sources.sources.filter((s) => s.status === "DECLARED" || s.status === "BLOCKED").length} watched by hand`,
);
for (const i of issues) console.log(`${i.level} [${i.where}] ${i.message}`);
const errors = issues.filter((i) => i.level === "ERROR");
console.log(errors.length === 0 ? "VALID — no errors" : `INVALID — ${errors.length} error(s)`);
process.exit(errors.length === 0 ? 0 : 1);
