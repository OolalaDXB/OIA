import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { FactsSchema, PanelSchema, SubjectSchema, type SubjectBundle } from "./schema";

/**
 * Subjects live outside the tool's code: by default `infra/visibility/subjects/`,
 * or any folder named by OIA_VIS_SUBJECTS_DIR (e.g. a private folder for
 * external clients). Every folder in it that holds a subject.yaml is a subject.
 */
export function defaultSubjectsDir(): string {
  const fromEnv = process.env.OIA_VIS_SUBJECTS_DIR;
  if (fromEnv) return resolve(fromEnv);
  return join(dirname(fileURLToPath(import.meta.url)), "../subjects");
}

function readYaml(path: string): unknown {
  return parse(readFileSync(path, "utf8"));
}

export function listSubjectDirs(root: string = defaultSubjectsDir()): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .sort()
    .map((name) => join(root, name))
    .filter((p) => statSync(p).isDirectory() && existsSync(join(p, "subject.yaml")));
}

/** Cross-file rules a schema alone cannot express. Returns human-readable problems. */
export function checkBundle(b: SubjectBundle): string[] {
  const problems: string[] = [];
  const { subject, panel, facts } = b;
  const folder = b.dir.split(/[\\/]/).pop();
  if (folder !== subject.id) problems.push(`folder "${folder}" must equal id "${subject.id}"`);

  const seen = new Set<string>();
  for (const p of panel.prompts) {
    const key = `${p.id}@${p.version}`;
    if (seen.has(key)) problems.push(`prompt ${key} appears twice`);
    seen.add(key);
    if (!subject.languages.includes(p.language)) problems.push(`prompt ${key}: language ${p.language} not in subject.languages`);
    const markets = new Set(subject.markets.map((m) => m.country));
    for (const m of p.markets) if (!markets.has(m)) problems.push(`prompt ${key}: market ${m} not in subject.markets`);
    if (p.status === "retired" && p.supersededBy === undefined) problems.push(`prompt ${key}: retired without supersededBy`);
  }
  const ids = new Set(panel.prompts.map((p) => p.id));
  for (const id of ids) {
    const versions = panel.prompts.filter((p) => p.id === id);
    const active = versions.filter((p) => p.status === "active");
    if (active.length !== 1) problems.push(`prompt ${id}: ${active.length} active versions (exactly 1 expected)`);
    const max = Math.max(...versions.map((p) => p.version));
    if (active[0] && active[0].version !== max) problems.push(`prompt ${id}: active version is not the latest`);
    for (let v = 1; v <= max; v++)
      if (!versions.some((p) => p.version === v)) problems.push(`prompt ${id}: version ${v} missing (old versions are never deleted)`);
  }

  for (const language of subject.languages) {
    const active = panel.prompts.filter((p) => p.status === "active" && p.language === language);
    if (active.length > panel.limits.maxPerLanguage)
      problems.push(`${language}: ${active.length} active prompts > maxPerLanguage ${panel.limits.maxPerLanguage}`);
    const branded = active.filter((p) => p.family === "branded").length;
    if (branded < panel.limits.minBrandedPerLanguage)
      problems.push(`${language}: ${branded} branded prompts < minBrandedPerLanguage ${panel.limits.minBrandedPerLanguage}`);
  }
  if (panel.status === "validated" && (!panel.validatedBy || !panel.validatedAt))
    problems.push("panel validated without validatedBy / validatedAt");

  const sourceIds = new Set(subject.sources.map((s) => s.id));
  for (const f of facts.facts) {
    if (!sourceIds.has(f.sourceId)) problems.push(`fact ${f.id}: unknown sourceId "${f.sourceId}"`);
    if (f.status === "validated" && (!f.validatedBy || !f.validatedAt)) problems.push(`fact ${f.id}: validated without validatedBy / validatedAt`);
  }
  return problems;
}

export function loadSubject(dir: string): SubjectBundle {
  const at = (file: string) => join(dir, file);
  const parseOrThrow = <T>(file: string, schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { message: string } } }) => {
    const r = schema.safeParse(readYaml(at(file)));
    if (!r.success) throw new Error(`${at(file)} is invalid: ${r.error.message}`);
    return r.data;
  };
  const bundle: SubjectBundle = {
    dir,
    subject: parseOrThrow("subject.yaml", SubjectSchema),
    panel: parseOrThrow("panel.yaml", PanelSchema),
    facts: parseOrThrow("facts.yaml", FactsSchema),
  };
  const problems = checkBundle(bundle);
  if (problems.length) throw new Error(`${dir}:\n  - ${problems.join("\n  - ")}`);
  return bundle;
}

export function loadSubjects(root: string = defaultSubjectsDir()): SubjectBundle[] {
  return listSubjectDirs(root).map(loadSubject);
}

/** Strings that identify a subject; none of them may appear in the tool's code. */
export function identifyingTerms(b: SubjectBundle): string[] {
  const { subject } = b;
  const host = (u: string) => new URL(u).hostname.replace(/^www\./, "");
  const terms = [
    subject.id,
    subject.displayName,
    host(subject.urls.primary),
    ...subject.urls.additional.map((a) => host(a.url)),
    ...subject.aliases.filter((a) => a.status !== "rejected").map((a) => a.value),
  ];
  return [...new Set(terms.map((t) => t.trim()).filter((t) => t.length >= 3))];
}
