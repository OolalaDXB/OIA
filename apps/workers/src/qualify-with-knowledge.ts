import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { composeSolution, loadKnowledge, checkDisclosure } from "@oia/knowledge";
import { fromRoot } from "./paths";

/**
 * OIA reader over the canonical knowledge layer (mandate §27, §37).
 * Given tender/grant criteria, answers "what can we REALLY propose" by
 * assembling what exists in the registry — sources, evidence, maturity,
 * limits, external-safe facts, and the gaps to close. Never a plausible
 * story. Output goes to knowledge/generated/ stamped with the commit it was
 * generated from (§21) so staleness is detectable.
 *
 * Usage: tsx src/qualify-with-knowledge.ts "AI governance" "audit trail" ...
 *        (defaults to the §37 example criteria; geographies via GEOS=EU,FR)
 */

const criteria = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["AI governance", "identity", "audit trail", "payment integration", "EU delivery capability"];
const geographies = (process.env.GEOS ?? "EU,FR").split(",").map((g) => g.trim());

const kb = loadKnowledge(fromRoot("knowledge"));
const s = composeSolution(kb, criteria, geographies);

let commit = "unknown";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: fromRoot(".") }).toString().trim();
} catch {
  // Outside a git checkout: stamp stays "unknown" — still honest.
}
const date = new Date().toISOString().slice(0, 10);

const lines: string[] = [];
lines.push(`# Solution composition — what we can REALLY propose`);
lines.push("");
lines.push(`> Generated from commit \`${commit}\` on ${date} — regenerate after any knowledge change (stale otherwise).`);
lines.push("");
lines.push(`**Criteria:** ${criteria.join(" · ")}  `);
lines.push(`**Target geographies:** ${geographies.join(", ")}`);
lines.push("");

lines.push(`## Products involved`);
for (const p of s.products) lines.push(`- **${p.name}** (${p.status}) — ${p.oneLine}`);
if (s.products.length === 0) lines.push("- none matched");
lines.push("");

lines.push(`## Capabilities (with real status — never more than the evidence)`);
for (const { criterion, capability: c, evidence } of s.capabilities) {
  lines.push(`### ${c.name}`);
  lines.push(`- matches criterion: "${criterion}"`);
  lines.push(`- status: **${c.status}** · evidence maturity: **${c.maturity}**`);
  if (c.limitations.length) lines.push(`- limitations: ${c.limitations.join(" / ")}`);
  lines.push(
    evidence.length
      ? `- evidence: ${evidence.map((e) => `${e.title} [${e.maturity}]`).join("; ")}`
      : `- evidence: none registered`,
  );
  lines.push("");
}

lines.push(`## Eligibility routes (entities)`);
for (const e of s.entityRoutes) lines.push(`- **${e.name}** (${e.status}${e.jurisdiction ? `, ${e.jurisdiction}` : ""}) — ${e.roles.join("; ")}`);
if (s.entityRoutes.length === 0) lines.push("- no ACTIVE entity covers the requested geographies");
lines.push("");

lines.push(`## Delivery capacity`);
for (const e of s.deliveryCapacity) {
  lines.push(`- **${e.name}**: ${e.deliveryCapacity!.description} (headcount: ${e.deliveryCapacity!.headcount ?? "n/a"}; footprint: ${e.eligibleGeographies.join(", ") || "n/a"})`);
}
lines.push("");

if (s.partnerCoverage.length > 0) {
  lines.push(`## Delivery coverage via partnership (not an in-house brick)`);
  for (const pc of s.partnerCoverage) {
    lines.push(`- criterion "${pc.criterion}": ${pc.note}`);
  }
  lines.push("");
}

lines.push(`## External-safe facts usable in the response`);
for (const f of s.externalSafeFacts) lines.push(`- ${f.statement.trim().replace(/\s+/g, " ")} _(${f.id})_`);
lines.push("");

lines.push(`## Gaps — what we must NOT claim (and should close)`);
for (const g of s.gaps) lines.push(`- ${g}`);
if (s.gaps.length === 0) lines.push("- none detected for these criteria");
lines.push("");

const doc = lines.join("\n");

// Disclosure gate on our own generated output (dogfooding §30, minimal form).
const violations = checkDisclosure(kb, doc);
if (violations.length > 0) {
  console.error("DISCLOSURE VIOLATIONS — output NOT written:");
  for (const v of violations) console.error(`- [${v.kind}] ${v.match}: ${v.detail}`);
  process.exit(1);
}

const outDir = fromRoot("knowledge/generated");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `solution-${date}.md`);
writeFileSync(outPath, doc, "utf8");
console.log(`Wrote ${outPath} (commit ${commit}, ${s.capabilities.length} capability match(es), ${s.gaps.length} gap(s))`);
