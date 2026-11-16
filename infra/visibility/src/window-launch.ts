/**
 * Contrôles GO / NO-GO du lancement d'une fenêtre de suivi dans l'Elmo existant
 * (mandat v13, bloc B), à partir d'un instantané lu en LECTURE SEULE
 * (scripts/window-launch.sh) : aucune écriture, aucun appel à un fournisseur.
 *
 *   1. marque présente ; EXACTEMENT les questions actives du panel de la fenêtre
 *      activées (étiquette oia:<id>@v<version>) ; toute autre question désactivée
 *      (jamais supprimée) ;
 *   2. panel, cibles et heure identiques à la référence, sinon comparisonNote
 *      (règles de checkBundle) ;
 *   3. SCRAPE_TARGETS d'Elmo = cibles de la fenêtre ; modèle sous alias signalé
 *      (version servie relevée, comparaison « fragile » si elle change) ;
 *   4. concurrents chargés dans Elmo = liste déclarée (subject.yaml) ;
 *   5. heure : worker arrêté ; travaux en retard qui partiront au démarrage ;
 *   6. gel freeze-<fenêtre> (créé au lancement) ;
 *   7. budget : plafond et alerte de cost-guard.sh posés, dépense du mois + coût
 *      estimé de la fenêtre sous le plafond ;
 *   8. suivi quotidien installable.
 *
 * Aussi : `addWindowFreeze` (gel de la fenêtre, sur le modèle du gel de la
 * référence) pour le lancement.
 *
 * CLI :
 *   tsx src/window-launch.ts check <subjectId> <windowId> <elmo-state.json>
 *   tsx src/window-launch.ts add-freeze <subjectId> <windowId> <YYYY-MM-DD>
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDocument } from "yaml";
import { checkBundle, defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";

/** Instantané d'Elmo et de la configuration, sans aucune valeur secrète. */
export interface ElmoState {
  now: string;
  brandExists: boolean;
  prompts: { id: string; tags: string[]; enabled: boolean }[];
  competitors: string[];
  workerRunning: boolean;
  /** Travaux process-prompt en attente, avec leur échéance. */
  pendingJobs: { promptId: string; startAfter: string }[];
  /** Valeur de SCRAPE_TARGETS (pas un secret : moteurs et modèles). */
  scrapeTargets: string;
  capUsd: number | null;
  alertUsd: number | null;
  /** Dépense retenue du mois UTC en cours (cost-journal.csv), null si inconnue. */
  monthSpendUsd: number | null;
  monthUtc: string;
  /** Tâche quotidienne d'une autre fenêtre déjà installée (launchd), le cas échéant. */
  otherWatch: string | null;
}

export interface Check {
  n: number;
  level: "ok" | "warn" | "nogo";
  text: string;
}

export const ALIAS_RE = /(-latest|-preview|-exp(erimental)?|-beta)$/;
const tagOf = (tags: string[]) => tags.find((t) => /^oia:[a-z0-9-]+@v\d+$/.test(t)) ?? null;
const norm = (s: string) => s.trim().toLowerCase();

export function launchChecks(b: SubjectBundle, windowId: string, st: ElmoState, opts: { referenceEstimatedUsd?: number | null; referenceVersions?: Record<string, string[]> } = {}): Check[] {
  const out: Check[] = [];
  const add = (n: number, level: Check["level"], text: string) => out.push({ n, level, text });
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w) return [{ n: 0, level: "nogo", text: `fenêtre « ${windowId} » absente de measurement.yaml` }];

  // 1. Marque et questions.
  if (!st.brandExists) add(1, "nogo", `marque ${b.subject.id} absente d'Elmo (une fenêtre de suivi réutilise la marque de la référence)`);
  if (b.panel.panelVersion !== w.panelVersion) add(1, "nogo", `panel du sujet en version ${b.panel.panelVersion}, fenêtre en version ${w.panelVersion}`);
  const expected = new Set(b.panel.prompts.filter((p) => p.status === "active").map((p) => `oia:${p.id}@v${p.version}`));
  const enabled = st.prompts.filter((p) => p.enabled);
  const enabledTags = new Set(enabled.map((p) => tagOf(p.tags)).filter((t): t is string => t !== null));
  const missing = [...expected].filter((t) => !enabledTags.has(t)).sort();
  const extra = enabled.filter((p) => { const t = tagOf(p.tags); return !t || !expected.has(t); });
  const dup = [...enabledTags].filter((t) => enabled.filter((p) => tagOf(p.tags) === t).length > 1);
  if (missing.length) add(1, "nogo", `questions du panel non activées dans Elmo : ${missing.join(", ")}`);
  if (extra.length) add(1, "nogo", `questions activées hors panel, à désactiver dans Elmo (jamais supprimer) : ${extra.map((p) => `${p.id}${tagOf(p.tags) ? ` (${tagOf(p.tags)})` : ""}`).join(", ")}`);
  if (dup.length) add(1, "nogo", `étiquette portée par plusieurs questions activées : ${dup.join(", ")}`);
  if (!missing.length && !extra.length && !dup.length && st.brandExists) {
    add(1, "ok", `exactement les ${expected.size} questions actives du panel v${w.panelVersion} activées ; ${st.prompts.length - enabled.length} autre(s) désactivée(s), conservée(s)`);
  }

  // 2. Cohérence avec la référence (panel, cibles, heure).
  const bundleProblems = checkBundle(b).filter((p) => p.startsWith(`window ${windowId}`));
  for (const p of bundleProblems) add(2, "nogo", p);
  if (!bundleProblems.length) {
    add(2, "ok", w.comparesWith ? `panel, cibles et heure identiques à ${w.comparesWith}${w.comparisonNote ? " (ou différence expliquée par comparisonNote)" : ""}` : "fenêtre sans référence");
  }

  // 3. Cibles et modèles.
  const targets = [...(w.targets ?? [])].sort();
  const elmo = st.scrapeTargets.split(",").map((s) => s.trim()).filter(Boolean).sort();
  if (!targets.length) add(3, "nogo", "aucune cible déclarée pour la fenêtre (targets)");
  else if (targets.join(",") !== elmo.join(",")) add(3, "nogo", `SCRAPE_TARGETS d'Elmo différent des cibles de la fenêtre (Elmo : ${elmo.join(", ") || "vide"})`);
  else add(3, "ok", `SCRAPE_TARGETS = cibles de la fenêtre (${targets.length} moteurs)`);
  for (const t of targets) {
    const [engine, , model] = t.split(":");
    if (model && ALIAS_RE.test(model)) {
      const served = opts.referenceVersions?.[engine!]?.join(", ");
      add(3, "warn", `${engine} : modèle sous alias (${model}), la version servie peut changer ; elle sera relevée${served ? ` (servie en ${w.comparesWith} : ${served})` : ""}, et une différence rendra la comparaison « fragile » pour ce moteur`);
    }
  }

  // 4. Concurrents.
  const declared = b.subject.competitors.filter((c) => c.status !== "rejected").map((c) => c.name);
  const inElmo = new Set(st.competitors.map(norm));
  const decl = new Set(declared.map(norm));
  const notLoaded = declared.filter((n) => !inElmo.has(norm(n)));
  const notDeclared = st.competitors.filter((n) => !decl.has(norm(n)));
  if (notLoaded.length || notDeclared.length) {
    add(4, "nogo", `concurrents d'Elmo ≠ liste déclarée (subject.yaml)${notLoaded.length ? ` ; absents d'Elmo : ${notLoaded.join(", ")}` : ""}${notDeclared.length ? ` ; dans Elmo sans être déclarés : ${notDeclared.join(", ")}` : ""}`);
  } else {
    add(4, "ok", `${declared.length} concurrents chargés = liste déclarée ; la comparaison recompte les deux fenêtres avec cette liste`);
  }

  // 5. Heure et travaux en retard.
  if (st.workerRunning) add(5, "nogo", "le worker d'Elmo tourne déjà");
  else {
    const overdue = st.pendingJobs.filter((j) => j.startAfter <= st.now);
    const enabledIds = new Set(enabled.map((p) => p.id));
    const runnable = overdue.filter((j) => enabledIds.has(j.promptId)).length;
    const withoutJob = enabled.filter((p) => !st.pendingJobs.some((j) => j.promptId === p.id)).length;
    add(5, "ok", `worker arrêté ; au démarrage, ${runnable} travail(aux) en retard partiront aussitôt, ${withoutJob} question(s) sans travail seront reprogrammées par la maintenance (toutes les 5 min) et partiront aussi, ${overdue.length - runnable} travail(aux) de questions désactivées seront sautés sans appel ; d'où le démarrage du worker à ${w.runTimeUtc ?? "runTimeUtc"} UTC (lancement refusé à plus de 5 min de cette heure)`);
    if (!w.runTimeUtc) add(5, "nogo", "runTimeUtc absent de la fenêtre");
  }

  // 6. Gel.
  const freezeId = `freeze-${windowId}`;
  if (b.measurement.freezes.some((f) => f.id === freezeId)) add(6, "ok", `${freezeId} déjà déclaré`);
  else if (!b.measurement.freezes.some((f) => f.untilEndOfWindow === w.comparesWith)) add(6, "nogo", `aucun gel de référence (untilEndOfWindow: ${w.comparesWith ?? "?"}) sur lequel modeler ${freezeId}`);
  else add(6, "ok", `${freezeId} sera créé au lancement, sur le modèle du gel de ${w.comparesWith}`);

  // 7. Budget.
  if (st.capUsd === null || st.alertUsd === null) add(7, "nogo", "plafond ou alerte de cost-guard.sh non posés (OIA_VIS_MONTHLY_CAP_USD, OIA_VIS_MONTHLY_ALERT_USD)");
  else {
    const est = opts.referenceEstimatedUsd ?? null;
    const startMonth = w.start ? w.start.slice(0, 7) : st.monthUtc;
    const spent = startMonth === st.monthUtc ? st.monthSpendUsd : 0;
    if (spent === null) add(7, "nogo", `dépense du mois ${st.monthUtc} illisible (cost-journal.csv)`);
    else if (est === null) add(7, "warn", `coût estimé de la fenêtre inconnu (pas de figures.json de la référence) ; dépense du mois : ${spent.toFixed(2)} $, plafond ${st.capUsd} $`);
    else if (spent + est > st.capUsd) {
      add(7, "nogo", `budget : ${spent.toFixed(2)} $ déjà retenus en ${startMonth} + ${est.toFixed(2)} $ estimés pour la fenêtre > plafond de ${st.capUsd} $ : lancer le mois suivant ou relever le plafond (décision de Mickaël)`);
    } else add(7, "ok", `budget : ${spent.toFixed(2)} $ retenus en ${startMonth} + ${est.toFixed(2)} $ estimés ≤ plafond de ${st.capUsd} $ (alerte ${st.alertUsd} $)`);
    add(7, "warn", "limites par fournisseur (crédits prépayés, clé OpenRouter plafonnée) : à confirmer par Mickaël dans chaque console, non lisibles par ce contrôle");
  }

  // 8. Suivi quotidien.
  if (st.otherWatch) add(8, "nogo", `tâche quotidienne d'une autre fenêtre encore installée : ${st.otherWatch}`);
  else add(8, "ok", "suivi quotidien (fiches jour-N, synchronisation, notification en cas de problème) installé au lancement");
  return out;
}

export function renderChecks(checks: Check[]): { text: string; go: boolean } {
  const go = !checks.some((c) => c.level === "nogo");
  const lines = checks.map((c) => `${c.level === "ok" ? "ok   " : c.level === "warn" ? "warn " : "NOGO "} ${c.n}. ${c.text}`);
  lines.push("", go ? "GO (à blanc : rien n'a été écrit)" : "NO-GO");
  return { text: `${lines.join("\n")}\n`, go };
}

/** Gel de la fenêtre sur le modèle du gel de sa référence, ajouté en fin de liste `freezes:`. */
export function addWindowFreeze(yamlText: string, b: SubjectBundle, windowId: string, decidedAt: string): string {
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w?.comparesWith) throw new Error(`fenêtre ${windowId} sans référence`);
  const model = b.measurement.freezes.find((f) => f.untilEndOfWindow === w.comparesWith);
  if (!model) throw new Error(`aucun gel de référence pour ${w.comparesWith}`);
  const id = `freeze-${windowId}`;
  if (b.measurement.freezes.some((f) => f.id === id)) throw new Error(`${id} existe déjà`);
  const doc = parseDocument(yamlText);
  const freezes = doc.get("freezes") as { add(v: unknown): void } | undefined;
  if (!freezes) throw new Error("liste freezes absente de measurement.yaml");
  // Fin du fichier réécrite par la bibliothèque YAML : seule la liste des gels change.
  const before = yamlText.slice(0, yamlText.search(/^freezes:/m));
  if (!before) throw new Error("freezes doit être la dernière clé de measurement.yaml");
  freezes.add(doc.createNode({
    id,
    scope: model.scope,
    rule: model.rule.replaceAll(w.comparesWith, windowId).replaceAll(w.comparesWith.toUpperCase(), windowId.toUpperCase()),
    untilEndOfWindow: windowId,
    covers: model.covers,
    allowed: model.allowed,
    decidedBy: model.decidedBy,
    decidedAt,
  }));
  const tail = String(doc).slice(String(doc).search(/^freezes:/m));
  const out = before + tail;
  const check = parseDocument(out).toJS() as { freezes: { id: string }[] };
  if (!check.freezes.some((f) => f.id === id)) throw new Error(`${id} non ajouté`);
  return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, subjectId, windowId, arg] = process.argv.slice(2);
  try {
    if (!cmd || !subjectId || !windowId || !arg) throw new Error("usage: tsx src/window-launch.ts check <subjectId> <windowId> <elmo-state.json> | add-freeze <subjectId> <windowId> <YYYY-MM-DD>");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet « ${subjectId} »`);
    const b = loadSubject(dir);
    if (cmd === "check") {
      const st = JSON.parse(readFileSync(arg, "utf8")) as ElmoState;
      const ref = b.measurement.windows.find((x) => x.id === b.measurement.windows.find((y) => y.id === windowId)?.comparesWith);
      const figFile = ref ? join(dir, "reports", ref.id, "figures.json") : "";
      const fig = figFile && existsSync(figFile) ? (JSON.parse(readFileSync(figFile, "utf8")) as { spend?: { estimatedUsd: number }; perEngine?: { engine: string; versions: string[] }[] }) : null;
      const r = renderChecks(launchChecks(b, windowId, st, {
        referenceEstimatedUsd: fig?.spend?.estimatedUsd ?? null,
        referenceVersions: Object.fromEntries((fig?.perEngine ?? []).map((e) => [e.engine, e.versions])),
      }));
      process.stdout.write(r.text);
      process.exit(r.go ? 0 : 1);
    } else if (cmd === "add-freeze") {
      const file = join(dir, "measurement.yaml");
      writeFileSync(file, addWindowFreeze(readFileSync(file, "utf8"), b, windowId, arg));
      process.stdout.write(`${file} : gel freeze-${windowId} ajouté\n`);
    } else throw new Error(`commande inconnue : ${cmd}`);
  } catch (err) {
    process.stderr.write(`window-launch : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
