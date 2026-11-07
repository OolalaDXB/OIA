import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "yaml";
import { z } from "zod";

/**
 * Modèle de vérification d'un compte · forme données.
 *
 * Source de vérité en Markdown : `agents/modele-verification-compte.md`.
 * Ce module charge chaque famille depuis `verification/<lettre>-*.yaml`
 * et offre deux usages :
 *   - `applicableChecks(subject)` : filtre les contrôles applicables au
 *     sujet (ex. A09 n'a de sens que si l'accord client est demandé).
 *   - `checksForTool(tool)` : donne les contrôles qu'un outil peut
 *     exécuter — utilisé par `src/seo-command/executor.ts` pour relier
 *     un agent à ses contrôles.
 */

export const Tool = z.enum([
  "crawlie",
  "crawlseo",
  "elmo",
  "repo-read",
  "oia",
  "panel",
  "manual",
]);
export type Tool = z.infer<typeof Tool>;

export const Mode = z.enum(["auto", "mixte", "manuel"]);
export type Mode = z.infer<typeof Mode>;

export const Severity = z.enum(["bloquant", "important", "amélioration"]);
export type Severity = z.infer<typeof Severity>;

const CheckId = z.string().regex(/^[A-M]\d{2}$/);

export const CheckSchema = z
  .object({
    id: CheckId,
    label: z.string().min(5),
    tool: Tool,
    mode: Mode,
    severity: Severity,
    tags: z.array(z.string()).default([]),
    note: z.string().optional(),
  })
  .strict()
  .superRefine((c, ctx) => {
    // Un contrôle auto ou mixte DOIT nommer un outil ; sinon la donnée perd sa
    // raison d'être par rapport au document source.
    if ((c.mode === "auto" || c.mode === "mixte") && c.tool === "manual") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `check ${c.id}: mode "${c.mode}" exige un outil non manuel (actuellement "manual")`,
      });
    }
  });

export const FamilySchema = z
  .object({
    schemaVersion: z.literal(1),
    family: z.string().regex(/^[A-M]$/),
    title: z.string().min(2),
    intro: z.string().min(5),
    checks: z.array(CheckSchema).min(1),
  })
  .strict();

export type Check = z.infer<typeof CheckSchema>;
export type Family = z.infer<typeof FamilySchema>;

export function defaultVerificationDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "../verification");
}

export function loadFamilies(root: string = defaultVerificationDir()): Family[] {
  if (!existsSync(root)) return [];
  const files = readdirSync(root)
    .filter((f) => /^[a-m]-[a-z0-9-]+\.yaml$/.test(f))
    .sort();
  const families: Family[] = [];
  for (const f of files) {
    const data = parse(readFileSync(join(root, f), "utf8"));
    const r = FamilySchema.safeParse(data);
    if (!r.success) throw new Error(`${join(root, f)} invalide : ${r.error.message}`);
    families.push(r.data);
  }
  // IDs uniques sur l'ensemble (sinon A01 et B01 pourraient entrer en conflit).
  const seen = new Set<string>();
  for (const fam of families)
    for (const c of fam.checks) {
      if (seen.has(c.id)) throw new Error(`id en double : ${c.id}`);
      seen.add(c.id);
      if (c.id[0] !== fam.family)
        throw new Error(`check ${c.id} déclaré dans famille ${fam.family} (lettre incohérente)`);
    }
  return families;
}

export function flatChecks(families: Family[] = loadFamilies()): Check[] {
  return families.flatMap((f) => f.checks);
}

export function checksForTool(tool: Tool, checks: Check[] = flatChecks()): Check[] {
  return checks.filter((c) => c.tool === tool);
}

export function checksForFamily(letter: string, families: Family[] = loadFamilies()): Check[] {
  const f = families.find((x) => x.family === letter.toUpperCase());
  return f ? f.checks : [];
}

/**
 * Contrôles applicables à l'initialisation d'un site.
 *
 * Règles :
 *  - A09 (accord client sur l'usage des données) seulement si la relation
 *    est externe (`ownership === "external"`) ;
 *  - B10 (hreflang) seulement si le sujet a au moins deux langues ;
 *  - A04 (fiche Google) seulement si `hasLocalPresence === true` (par
 *    défaut, on le laisse en « à confirmer » car un sujet peut être
 *    partiellement local).
 */
export interface Applicability {
  ownership: "internal" | "external";
  languages: string[];
  hasLocalPresence?: boolean;
}

export function applicableChecks(
  context: Applicability,
  checks: Check[] = flatChecks(),
): Check[] {
  return checks.filter((c) => {
    if (c.id === "A09" && context.ownership !== "external") return false;
    if (c.id === "B10" && context.languages.length < 2) return false;
    if (c.id === "A04" && context.hasLocalPresence === false) return false;
    return true;
  });
}
