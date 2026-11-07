/**
 * Corps de `POST /api/v1/brands` d'Elmo 0.7.7 à partir d'un sujet OIA : la
 * marque, ses concurrents et les questions actives du panel, en un seul appel
 * (schéma `createBrandInputSchema`, apps/web/src/server/onboarding-core.ts).
 *
 * Ce chemin ne déclenche aucun appel LLM côté Elmo : il enregistre la marque
 * et planifie les questions. `enabledModels` n'est pas posé (Elmo ne le prend
 * pas à la création) : il reste `null`, et Elmo interroge alors tous les
 * moteurs de SCRAPE_TARGETS (packages/lib/src/providers/runner.ts:17). Le
 * lancement vérifie donc que SCRAPE_TARGETS couvre exactement les moteurs du
 * sujet.
 *
 * CLI : tsx src/elmo-load.ts <subjectId> <organizationId>  → JSON sur stdout.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { findPrice } from "./cost-grid.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { renderElmoBrief } from "./render.js";
import type { SubjectBundle } from "./schema.js";

export interface ElmoCreateBrand {
  id: string;
  name: string;
  domains: string[];
  aliases: string[];
  competitors: { name: string; domains: string[]; aliases: string[] }[];
  prompts: { value: string; tags: string[]; enabled: boolean }[];
  organizationId: string;
}

interface Brief {
  brand: { slug: string; name: string; website: string; additionalDomains: string[]; aliases: string[]; enabledModels: string[] };
  manualEngines: string[];
  competitors: { name: string; domains: string[]; aliases: string[] }[];
  prompts: { value: string; tags: string[] }[];
  panelStatus: string;
}

export function readBrief(bundle: SubjectBundle): Brief {
  return JSON.parse(renderElmoBrief(bundle)) as Brief;
}

export function toElmoCreateBrand(bundle: SubjectBundle, organizationId: string): ElmoCreateBrand {
  const brief = readBrief(bundle);
  if (brief.panelStatus !== "validated") {
    throw new Error(`panel en statut "${brief.panelStatus}" : seul un panel validé se charge dans Elmo`);
  }
  if (!organizationId.trim()) throw new Error("organizationId vide");
  const host = new URL(brief.brand.website).hostname.replace(/^www\./, "");
  return {
    id: brief.brand.slug,
    name: brief.brand.name,
    domains: [...new Set([host, ...brief.brand.additionalDomains])],
    aliases: brief.brand.aliases,
    competitors: brief.competitors.map((c) => ({ name: c.name, domains: c.domains ?? [], aliases: c.aliases ?? [] })),
    prompts: brief.prompts.map((p) => ({ value: p.value, tags: p.tags.map((t) => t.toLowerCase()), enabled: true })),
    organizationId,
  };
}

/** Même découpage qu'Elmo 0.7.7 (packages/config/src/scrape-targets.ts:27-48). */
export function parseScrapeTargets(value: string): { model: string; provider: string; version?: string; webSearch: boolean }[] {
  return value
    .split(",")
    .map((raw) => raw.trim())
    .filter(Boolean)
    .map((entry) => {
      const parts = entry.split(":");
      if (parts.length < 2) throw new Error(`cible SCRAPE_TARGETS invalide : "${entry}"`);
      const webSearch = parts[parts.length - 1] === "online";
      const versionParts = parts.slice(2, webSearch ? -1 : undefined);
      return {
        model: parts[0]!,
        provider: parts[1]!,
        version: versionParts.length ? versionParts.join(":") : undefined,
        webSearch,
      };
    });
}

/**
 * Vérifie que SCRAPE_TARGETS interroge exactement les moteurs API du sujet :
 * avec `enabledModels` à null, un moteur en trop serait mesuré et payé.
 */
export function checkTargetsMatch(bundle: SubjectBundle, scrapeTargets: string): string[] {
  const wanted = new Set(readBrief(bundle).brand.enabledModels);
  const configured = parseScrapeTargets(scrapeTargets);
  const errors: string[] = [];
  const got = new Set(configured.map((t) => t.model));
  for (const m of wanted) if (!got.has(m)) errors.push(`moteur du sujet absent de SCRAPE_TARGETS : ${m}`);
  for (const m of got) if (!wanted.has(m)) errors.push(`moteur de SCRAPE_TARGETS hors du sujet : ${m}`);
  for (const t of configured) if (!t.webSearch) errors.push(`recherche web absente (:online) : ${t.model}`);
  for (const t of configured) {
    if (!t.version) errors.push(`version absente : ${t.model}:${t.provider}`);
    else if (!findPrice(t.provider, t.version)) errors.push(`modèle absent de la grille de prix (src/cost-grid.ts) : ${t.provider}:${t.version}`);
  }
  if (configured.length !== got.size) errors.push("un moteur apparaît deux fois dans SCRAPE_TARGETS");
  return errors;
}

type WindowNode = { get(k: string): unknown };

function findWindow(yamlText: string, windowId: string): WindowNode {
  const windows = parseDocument(yamlText).get("windows") as { items: WindowNode[] } | undefined;
  const w = windows?.items.find((item) => item.get("id") === windowId);
  if (!w) throw new Error(`fenêtre "${windowId}" absente`);
  return w;
}

/**
 * Passe une fenêtre de `planned` à `running` dans measurement.yaml, avec la
 * date de début (champ `start`) et l'heure UTC dans la note.
 *
 * Modification textuelle limitée aux lignes de la fenêtre : réécrire le
 * document entier par la bibliothèque YAML renormaliserait les collections en
 * ligne et les longues lignes du reste du fichier. Le résultat est relu et
 * vérifié ; un format non prévu est refusé plutôt que modifié au hasard.
 */
export function markWindowRunning(yamlText: string, windowId: string, startedAt: Date): string {
  const w = findWindow(yamlText, windowId);
  if (w.get("status") !== "planned") throw new Error(`fenêtre "${windowId}" en statut "${String(w.get("status"))}", pas "planned"`);
  const iso = startedAt.toISOString();
  const day = iso.slice(0, 10);
  const stamp = `Démarrée le ${day} à ${iso.slice(11, 16)} UTC (démarrage du worker).`;
  const lines = yamlText.split("\n");
  const unsupported = () => new Error(`fenêtre "${windowId}" dans un format non prévu : modifier measurement.yaml à la main`);
  const idRe = new RegExp(`^(\\s*)- (\\{\\s*)?id:\\s*["']?${windowId.replace(/[-]/g, "\\-")}["']?\\s*[,}]?`);
  const at = lines.findIndex((l) => idRe.test(l));
  if (at < 0) throw unsupported();
  const first = lines[at]!;

  if (first.includes("{")) {
    // Fenêtre en ligne : { id: j0, ..., status: planned }
    if (!/\}\s*$/.test(first) || !/status:\s*planned/.test(first) || /note:|start:/.test(first)) throw unsupported();
    lines[at] = first
      .replace(/status:\s*planned/, `status: running, start: "${day}"`)
      .replace(/\s*\}\s*$/, `, note: "${stamp}" }`);
  } else {
    // Fenêtre en bloc : les clés suivent, plus indentées que le tiret.
    const dash = idRe.exec(first)![1]!.length;
    let end = at + 1;
    while (end < lines.length && (lines[end]!.trim() === "" || lines[end]!.search(/\S/) > dash)) end++;
    const keyIndent = " ".repeat(dash + 2);
    const statusAt = lines.findIndex((l, i) => i > at && i < end && l === `${keyIndent}status: planned`);
    if (statusAt < 0 || lines.slice(at, end).some((l) => l.startsWith(`${keyIndent}start:`))) throw unsupported();
    lines.splice(statusAt, 1, `${keyIndent}status: running`, `${keyIndent}start: "${day}"`);
    end++;
    const noteAt = lines.findIndex((l, i) => i > at && i < end && l.startsWith(`${keyIndent}note:`));
    if (noteAt < 0) {
      lines.splice(statusAt + 2, 0, `${keyIndent}note: "${stamp}"`);
    } else {
      const m = /^(\s*note:\s*")(.*)"\s*$/.exec(lines[noteAt]!);
      if (!m || m[2]!.includes('"')) throw unsupported();
      lines[noteAt] = `${m[1]}${m[2]}${m[2] ? " " : ""}${stamp}"`;
    }
  }

  const out = lines.join("\n");
  const check = findWindow(out, windowId);
  if (check.get("status") !== "running" || String(check.get("start")) !== day || !String(check.get("note")).includes(stamp)) {
    throw unsupported();
  }
  return out;
}

function findBundle(subjectId: string): SubjectBundle {
  const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
  if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
  return loadSubject(dir);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, subjectId, arg] = process.argv.slice(2);
  try {
    if (cmd === "body" && subjectId && arg) {
      process.stdout.write(`${JSON.stringify(toElmoCreateBrand(findBundle(subjectId), arg))}\n`);
    } else if (cmd === "start-window" && subjectId && arg) {
      const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
      if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
      const file = `${dir}/measurement.yaml`;
      writeFileSync(file, markWindowRunning(readFileSync(file, "utf8"), arg, new Date()));
      process.stdout.write(`${file} : fenêtre ${arg} passée en running\n`);
    } else if (cmd === "check-targets" && subjectId && arg !== undefined) {
      const errors = checkTargetsMatch(findBundle(subjectId), arg);
      for (const e of errors) process.stderr.write(`${e}\n`);
      process.exit(errors.length ? 1 : 0);
    } else {
      process.stderr.write(
        "usage: tsx src/elmo-load.ts body <subjectId> <organizationId> | check-targets <subjectId> <SCRAPE_TARGETS> | start-window <subjectId> <windowId>\n",
      );
      process.exit(2);
    }
  } catch (err) {
    process.stderr.write(`elmo-load : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
