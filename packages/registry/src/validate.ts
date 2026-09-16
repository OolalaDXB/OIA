import type { ProjectRegistry } from "./schema";

/**
 * Registry honesty rules. Zod already guarantees the shape; these are the rules
 * that keep the registry TRUE rather than merely well-formed.
 */

export interface RegistryIssue {
  level: "ERROR" | "WARN";
  where: string;
  message: string;
}

export function validateRegistry(registry: ProjectRegistry): RegistryIssue[] {
  const issues: RegistryIssue[] = [];
  const seen = new Set<string>();

  for (const p of registry.projects) {
    const at = `project:${p.slug}`;

    if (seen.has(p.slug)) issues.push({ level: "ERROR", where: at, message: "duplicate slug" });
    seen.add(p.slug);

    // A claimed owner sign-off must carry its date, or it is not a sign-off.
    if (p.profileReview.status === "CONFIRMED_BY_OWNER" && !p.profileReview.confirmedAt) {
      issues.push({ level: "ERROR", where: at, message: "CONFIRMED_BY_OWNER requires confirmedAt" });
    }
    // A hypothesis must say it is one, and say where it came from.
    if (p.profileReview.status === "DRAFT" && p.profileReview.derivedFrom.length === 0) {
      issues.push({
        level: "ERROR",
        where: at,
        message: "DRAFT profile must declare derivedFrom (where the hypothesis comes from)",
      });
    }

    // Discovery that cannot discover is a lie in the UI: it would show a project
    // as watched while no query would ever match.
    if (p.discovery.enabled && p.discovery.queryTerms.length === 0 && p.discovery.cpvCodes.length === 0) {
      issues.push({
        level: "ERROR",
        where: at,
        message: "discovery.enabled needs at least one queryTerm or cpvCode",
      });
    }
    if (p.discovery.enabled && p.keywords.length === 0) {
      issues.push({
        level: "ERROR",
        where: at,
        message: "discovery.enabled needs keywords — the matcher has nothing to score without them",
      });
    }
    if (!p.discovery.enabled && p.active) {
      issues.push({
        level: "WARN",
        where: at,
        message: "active project with no automated discovery (tracked manually)",
      });
    }
    if (p.keywords.length === 0) {
      issues.push({ level: "WARN", where: at, message: "no keywords — no suggestion will ever match" });
    }
    if (!p.oneLiner) {
      issues.push({ level: "WARN", where: at, message: "no oneLiner — the console has nothing to show" });
    }
  }

  return issues;
}
