import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadKnowledge } from "./load";
import { validateKnowledge } from "./validate";

/** CLI: pnpm --filter @oia/knowledge validate */
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../knowledge");
const kb = loadKnowledge(root);
const issues = validateKnowledge(kb);

console.log(
  `knowledge: ${kb.products.length} product(s), ${kb.facts.length} fact(s), ${kb.capabilities.length} capabilit(ies), ${kb.entities.length} entit(ies), ${kb.evidence.length} evidence item(s)`,
);
for (const i of issues) console.log(`${i.level} [${i.where}] ${i.message}`);
const errors = issues.filter((i) => i.level === "ERROR");
console.log(errors.length === 0 ? "VALID — no errors" : `INVALID — ${errors.length} error(s)`);
process.exit(errors.length === 0 ? 0 : 1);
