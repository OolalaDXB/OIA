/**
 * Porte des commandes génériques (mandat v13, bloc A) : `pnpm vis <action>
 * <sujet> <fenêtre>` refuse une fenêtre absente de measurement.yaml, ou dans un
 * statut incompatible avec l'action (par exemple `close` sur une fenêtre
 * `planned`). Aucun sujet ni fenêtre codé en dur.
 *
 * Marque aussi la fin d'une fenêtre (`running` → `done`, champ `end`) à la
 * clôture, par une modification textuelle limitée aux lignes de la fenêtre,
 * comme markWindowRunning (src/elmo-load.ts).
 *
 * CLI :
 *   tsx src/window-gate.ts gate <subjectId> <windowId> <action>
 *   tsx src/window-gate.ts end-window <subjectId> <windowId> <YYYY-MM-DD>
 *   tsx src/window-gate.ts info <subjectId> <windowId>       (JSON : fenêtre, référence)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseDocument } from "yaml";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";

type Status = SubjectBundle["measurement"]["windows"][number]["status"];

/** Statuts acceptés par action. */
export const ACTIONS: Record<string, Status[]> = {
  launch: ["planned"],
  status: ["planned", "running", "done"],
  view: ["running", "done"],
  close: ["running"],
  report: ["done"],
  verify: ["done"],
  compare: ["done"],
  page: ["done"],
};

export function gate(b: SubjectBundle, windowId: string, action: string): string[] {
  const allowed = ACTIONS[action];
  if (!allowed) return [`action inconnue « ${action} » (actions : ${Object.keys(ACTIONS).join(", ")})`];
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w) return [`fenêtre « ${windowId} » absente de measurement.yaml de ${b.subject.id} (fenêtres : ${b.measurement.windows.map((x) => x.id).join(", ")})`];
  const problems: string[] = [];
  if (!allowed.includes(w.status)) {
    problems.push(`${action} refusé : fenêtre ${windowId} en statut « ${w.status} » (attendu : ${allowed.join(" ou ")})`);
  }
  if (action === "compare") {
    if (!w.comparesWith) problems.push(`compare refusé : la fenêtre ${windowId} n'a pas de référence (comparesWith)`);
    else {
      const ref = b.measurement.windows.find((x) => x.id === w.comparesWith);
      if (!ref) problems.push(`compare refusé : référence « ${w.comparesWith} » absente de measurement.yaml`);
      else if (ref.status !== "done") problems.push(`compare refusé : référence ${ref.id} en statut « ${ref.status} » (attendu : done)`);
    }
  }
  if (action === "launch" && w.comparesWith) {
    const ref = b.measurement.windows.find((x) => x.id === w.comparesWith);
    if (!ref) problems.push(`launch refusé : référence « ${w.comparesWith} » absente de measurement.yaml`);
    else if (ref.status !== "done") problems.push(`launch refusé : référence ${ref.id} en statut « ${ref.status} » (attendu : done)`);
  }
  return problems;
}

/**
 * Passe une fenêtre de `running` à `done`, avec la date de fin (`end`). Refuse
 * tout autre statut et tout format non prévu plutôt que de modifier au hasard.
 */
export function markWindowDone(yamlText: string, windowId: string, endDay: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDay)) throw new Error(`date de fin invalide : ${endDay}`);
  const unsupported = () => new Error(`fenêtre "${windowId}" dans un format non prévu : modifier measurement.yaml à la main`);
  const status = (text: string) => {
    const doc = parseDocument(text);
    const ws = doc.get("windows") as { items: { get(k: string): unknown }[] } | undefined;
    const w = ws?.items.find((x) => x.get("id") === windowId);
    if (!w) throw new Error(`fenêtre "${windowId}" absente de measurement.yaml`);
    return { status: w.get("status"), end: w.get("end") };
  };
  const before = status(yamlText);
  if (before.status !== "running") throw new Error(`fenêtre "${windowId}" en statut "${String(before.status)}", pas "running"`);
  if (before.end !== undefined) throw unsupported();
  const lines = yamlText.split("\n");
  const idRe = new RegExp(`^(\\s*)- (\\{\\s*)?id:\\s*["']?${windowId.replace(/[-]/g, "\\-")}["']?\\s*[,}]?`);
  const at = lines.findIndex((l) => idRe.test(l));
  if (at < 0) throw unsupported();
  const first = lines[at]!;
  if (first.includes("{")) {
    if (!/\}\s*$/.test(first) || !/status:\s*running/.test(first)) throw unsupported();
    lines[at] = first.replace(/status:\s*running/, `status: done, end: "${endDay}"`);
  } else {
    const dash = idRe.exec(first)![1]!.length;
    let end = at + 1;
    while (end < lines.length && (lines[end]!.trim() === "" || lines[end]!.search(/\S/) > dash)) end++;
    const keyIndent = " ".repeat(dash + 2);
    const statusAt = lines.findIndex((l, i) => i > at && i < end && l === `${keyIndent}status: running`);
    if (statusAt < 0) throw unsupported();
    const startAt = lines.findIndex((l, i) => i > at && i < end && l.startsWith(`${keyIndent}start:`));
    lines.splice(statusAt, 1, `${keyIndent}status: done`);
    lines.splice((startAt > 0 ? startAt : statusAt) + 1, 0, `${keyIndent}end: "${endDay}"`);
  }
  const out = lines.join("\n");
  const after = status(out);
  if (after.status !== "done" || String(after.end) !== endDay) throw unsupported();
  return out;
}

function subjectDir(subjectId: string): string {
  const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
  if (!dir) throw new Error(`aucun sujet « ${subjectId} » dans ${defaultSubjectsDir()}`);
  return dir;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, subjectId, windowId, arg] = process.argv.slice(2);
  try {
    if (!cmd || !subjectId || !windowId) throw new Error("usage: tsx src/window-gate.ts gate|end-window|info <subjectId> <windowId> [action|date]");
    const dir = subjectDir(subjectId);
    if (cmd === "gate" && arg) {
      const problems = gate(loadSubject(dir), windowId, arg);
      for (const p of problems) process.stderr.write(`refus : ${p}\n`);
      process.exit(problems.length ? 1 : 0);
    } else if (cmd === "end-window" && arg) {
      const file = `${dir}/measurement.yaml`;
      writeFileSync(file, markWindowDone(readFileSync(file, "utf8"), windowId, arg));
      process.stdout.write(`${file} : fenêtre ${windowId} passée en done (fin ${arg})\n`);
    } else if (cmd === "info") {
      const b = loadSubject(dir);
      const w = b.measurement.windows.find((x) => x.id === windowId);
      if (!w) throw new Error(`fenêtre « ${windowId} » absente de measurement.yaml`);
      process.stdout.write(`${JSON.stringify({ window: w, reference: b.measurement.windows.find((x) => x.id === w.comparesWith) ?? null })}\n`);
    } else throw new Error(`commande inconnue : ${cmd}`);
  } catch (err) {
    process.stderr.write(`window-gate : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
