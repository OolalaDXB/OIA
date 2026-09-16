import { loadRegistry } from "./load";
import { validateRegistry } from "./validate";

/** CLI: pnpm --filter @oia/registry validate */
const registry = loadRegistry();
const issues = validateRegistry(registry);

console.log(
  `registry: ${registry.projects.length} project(s), ` +
    `${registry.projects.filter((p) => p.active).length} active, ` +
    `${registry.projects.filter((p) => p.discovery.enabled).length} with automated discovery, ` +
    `${registry.projects.filter((p) => p.profileReview.status === "CONFIRMED_BY_OWNER").length} owner-confirmed`,
);
for (const i of issues) console.log(`${i.level} [${i.where}] ${i.message}`);
const errors = issues.filter((i) => i.level === "ERROR");
console.log(errors.length === 0 ? "VALID — no errors" : `INVALID — ${errors.length} error(s)`);
process.exit(errors.length === 0 ? 0 : 1);
