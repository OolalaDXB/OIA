import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { checkLinks, isBroken, probeEgress, summarise, type LinkCheckResult } from "@oia/ingestion/link-check";
import { PROJECT_REGISTRY, SOURCE_REGISTRY } from "@oia/registry";
import { fromRoot } from "./paths";

/**
 * Check every URL the system publishes, and write the verdict back where the
 * URL lives.
 *
 * The prompt for this was blunt: too many published links 404. A URL in a YAML
 * file proves that somebody typed it. This makes each one either a checked fact
 * with a date, or a visible problem.
 *
 * Needs network egress, so it runs in CI or locally — the agent sandbox is
 * blocked and says so rather than reporting every link as dead, which would be
 * the worst possible failure mode for a tool about verification.
 *
 *   pnpm --filter @oia/workers check:links
 *   pnpm --filter @oia/workers check:links -- --dry-run
 */

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(hit.indexOf("=") + 1) : "";
}

interface Target {
  url: string;
  where: string;
  /** The YAML file to stamp, when the URL lives in the registry. */
  file?: string;
}

function collectTargets(): Target[] {
  const targets: Target[] = [];

  for (const p of PROJECT_REGISTRY.projects) {
    if (p.url) targets.push({ url: p.url, where: `project ${p.slug}`, file: `projects/${p.slug}.yaml` });
  }
  for (const s of SOURCE_REGISTRY.sources) {
    if (s.url) targets.push({ url: s.url, where: `source ${s.id}`, file: `sources/${s.id}.yaml` });
    if (s.access.endpoint) targets.push({ url: s.access.endpoint, where: `source ${s.id} endpoint` });
  }

  // Opportunity links from the shipped dataset: the ones most likely to rot,
  // because a call is taken down when it closes.
  try {
    const data = JSON.parse(readFileSync(fromRoot("apps/web/src/data/console.json"), "utf8")) as {
      records: { id: string; officialUrl?: string; applicationUrl?: string }[];
    };
    for (const r of data.records) {
      if (r.officialUrl) targets.push({ url: r.officialUrl, where: `opportunity ${r.id}` });
      if (r.applicationUrl) targets.push({ url: r.applicationUrl, where: `opportunity ${r.id} (application)` });
    }
  } catch {
    // No dataset yet — the registry URLs are still worth checking.
  }

  return targets;
}

/**
 * Stamp the result onto the YAML file that carries the URL. Only `urlVerified`
 * and `lastUrlCheck` are touched, and only on a CONCLUSIVE answer: a blocked
 * or failing server must never flip a good link to unverified.
 */
function stampRegistry(root: string, file: string, result: LinkCheckResult): boolean {
  const path = join(root, file);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  if (result.status === "BLOCKED_BY_POLICY" || result.status === "SERVER_ERROR") return false;

  const verified = result.status === "OK" || result.status === "REDIRECTED";
  const date = result.checkedAt.slice(0, 10);
  let next = text;

  next = /^urlVerified:/m.test(next)
    ? next.replace(/^urlVerified:.*$/m, `urlVerified: ${verified}`)
    : next.replace(/^(url:.*)$/m, `$1\nurlVerified: ${verified}`);

  next = /^lastUrlCheck:/m.test(next)
    ? next.replace(/^lastUrlCheck:.*$/m, `lastUrlCheck: "${date}"`)
    : next.replace(/^(urlVerified:.*)$/m, `$1\nlastUrlCheck: "${date}"`);

  if (next === text) return false;
  writeFileSync(path, next, "utf8");
  return true;
}

async function main() {
  const dryRun = arg("dry-run") !== undefined;
  const root = fromRoot("registry");
  const targets = collectTargets();

  const probeOpts = {
    userAgent: "OIA link checker (+https://github.com/OolalaDXB/OIA)",
    timeoutMs: 15000,
  };

  // Establish that this machine can reach the open web BEFORE concluding
  // anything about anybody's URL. Skipping this step is how a verification tool
  // starts publishing confident nonsense.
  const egress = await probeEgress(probeOpts);
  if (!egress.reachable) {
    console.error(
      "This machine cannot reach the open web, so no link can be checked from here.\n" +
        `Canaries: ${egress.evidence}\n` +
        "Nothing was stamped and nothing is claimed about any URL. Run this in CI or locally.",
    );
    if (!dryRun) {
      writeFileSync(
        fromRoot("outputs/link-check.md"),
        [
          "# Link check — NOT PERFORMED",
          "",
          "This run could not reach the open web, so it says nothing about any URL.",
          "",
          `Canaries: \`${egress.evidence}\``,
          "",
          "> Reporting these links as broken would have attributed our own network",
          "> restrictions to other people's websites — the one mistake a link",
          "> checker must not make.",
          "",
        ].join("\n"),
        "utf8",
      );
    }
    process.exit(1);
    return;
  }

  console.log(`egress confirmed (${egress.evidence}) — checking ${targets.length} published link(s)…`);
  const results = await checkLinks(
    targets.map((t) => t.url),
    { ...probeOpts, concurrency: 4 },
  );
  const byUrl = new Map(results.map((r) => [r.url, r]));
  const report = summarise(results);

  let stamped = 0;
  const lines: string[] = ["# Link check", "", `Checked ${report.checked} distinct URL(s).`, ""];

  if (report.inconclusive.length === report.checked && report.checked > 0) {
    // The honest failure mode: if everything was blocked, say the check did not
    // happen rather than publishing a wall of red.
    console.error(
      "every request was blocked or failed at the server — this environment cannot reach the open web.\n" +
        "Nothing was stamped: reporting every link as dead would be worse than not checking.",
    );
    lines.push("**The check did not happen.** Every request was blocked by our own egress policy or failed at the", "server, so nothing is known about these URLs and nothing was stamped.", "");
    if (!dryRun) writeFileSync(fromRoot("outputs/link-check.md"), lines.join("\n"), "utf8");
    process.exit(1);
    return;
  }

  const broken: string[] = [];
  const moved: string[] = [];
  for (const t of targets) {
    const r = byUrl.get(t.url);
    if (!r) continue;
    if (isBroken(r.status)) broken.push(`- **${t.where}** — ${r.status} · ${r.note}\n  - ${t.url}`);
    if (r.status === "REDIRECTED" && r.finalUrl) {
      moved.push(`- **${t.where}** — now redirects to ${r.finalUrl}\n  - ${t.url}`);
    }
    if (t.file && !dryRun && stampRegistry(root, t.file, r)) stamped += 1;
  }

  lines.push(
    `- resolving: ${report.ok}`,
    `- **broken: ${report.broken.length}**`,
    `- refused us (not broken): ${report.refused.length}`,
    `- inconclusive: ${report.inconclusive.length}`,
    "",
  );
  if (broken.length > 0) lines.push("## Broken — these need fixing", "", ...broken, "");
  if (moved.length > 0) lines.push("## Moved — still work, but the published URL is stale", "", ...moved, "");
  if (report.refused.length > 0) {
    lines.push(
      "## Refused us",
      "",
      "These returned 401/403/429. The server declined our request; the page itself may be perfectly fine in a browser.",
      "",
      ...report.refused.map((r) => `- ${r.url} — ${r.note}`),
      "",
    );
  }

  if (!dryRun) writeFileSync(fromRoot("outputs/link-check.md"), lines.join("\n"), "utf8");
  console.log(
    `resolving ${report.ok} · broken ${report.broken.length} · refused ${report.refused.length} · ` +
      `inconclusive ${report.inconclusive.length}${dryRun ? " (dry run, nothing written)" : ` · stamped ${stamped} registry file(s)`}`,
  );
  for (const b of broken) console.log(b);
}

if (process.argv[1] && process.argv[1].endsWith("check-links.ts")) {
  main().catch((err) => {
    console.error("check-links failed:", err);
    process.exitCode = 1;
  });
}

export { collectTargets, stampRegistry };
