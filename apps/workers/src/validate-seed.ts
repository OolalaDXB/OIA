import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { validateSeedDataset } from "@oia/ingestion";
import { fromRoot } from "./paths";

/**
 * Seed-manifest validation CLI (spec §1). Validates
 * data/seeds/bawaba-funding-opportunities.json against the explicit schema and
 * reports internal inconsistencies. NEVER invents records: a missing file is
 * reported honestly.
 *
 *   pnpm --filter @oia/workers run validate:seed -- \
 *     --seed data/seeds/bawaba-funding-opportunities.json
 */
function argValue(flag: string, dflt: string): string {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1]! : dflt;
}

const seedPath = fromRoot(argValue("--seed", "data/seeds/bawaba-funding-opportunities.json"));
const outPath = fromRoot("outputs/milestone-0/seed-validation.md");
mkdirSync(dirname(outPath), { recursive: true });

function write(md: string) {
  writeFileSync(outPath, md, "utf8");
  console.log(md);
  console.log(`\n(written to ${outPath})`);
}

if (!existsSync(seedPath)) {
  write(
    [
      "# Seed validation — NOT RUN",
      "",
      `Seed file not found: \`${seedPath}\``,
      "",
      "The ten-record dataset has not been supplied yet. Per instruction §6 the",
      "ten-record execution is PAUSED until both files exist:",
      "",
      "- `data/seeds/bawaba-funding-opportunities.json`",
      "- `data/seeds/bawaba-funding-opportunities.md`",
      "",
      "The schema + validator + inconsistency checks are implemented and tested",
      "(`@oia/ingestion` seed.unit.test) and will run automatically once the file",
      "is provided. A documented empty template is at",
      "`data/seeds/bawaba-funding-opportunities.template.json`.",
      "",
    ].join("\n"),
  );
  process.exit(0);
}

const raw = JSON.parse(readFileSync(seedPath, "utf8"));
const result = validateSeedDataset(raw);

const md = [
  "# Seed validation report",
  "",
  `Seed file: \`${seedPath}\``,
  `Schema valid: **${result.ok ? "YES" : "NO"}**`,
  "",
  "## Schema errors",
  ...(result.errors.length ? result.errors.map((e) => `- ${e}`) : ["- none"]),
  "",
  `## Internal inconsistencies (${result.inconsistencies.length})`,
  "",
  "> These are the seed's own claims cross-examined by deterministic rules. Each",
  "> is a hypothesis to test against real sources, not an automatic failure.",
  "",
  ...(result.inconsistencies.length
    ? result.inconsistencies.map((i) => `- **${i.recordId}** — \`${i.rule}\`: ${i.detail}`)
    : ["- none detected"]),
  "",
  `Records: ${result.dataset?.records.length ?? 0}`,
  "",
].join("\n");

write(md);
process.exit(result.ok ? 0 : 1);
