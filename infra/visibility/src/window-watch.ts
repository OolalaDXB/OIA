/**
 * Suivi d'une fenêtre de mesure en cours (bloc A du mandat v7) : jour en
 * cours, runs par moteur, jours manquants ou incomplets, dépense, problèmes à
 * signaler. Fonctions pures ; les données viennent de scripts/j0-window-data.sh
 * (lecture seule d'Elmo) et du journal de cost-guard.sh.
 *
 * Un « jour » de fenêtre est une tranche de 24 h comptée depuis le démarrage
 * du worker : Elmo relance chaque question 24 h après la précédente
 * (DEFAULT_DELAY_HOURS=24), pas à minuit.
 *
 * CLI : tsx src/window-watch.ts status|day <subjectId> <window-data.json> [cost-journal.csv]
 *   status → dix lignes pour Mickaël ; day → fiche Markdown du jour en cours,
 *   et code de sortie 3 s'il y a un problème à signaler.
 */
import { existsSync, readFileSync } from "node:fs";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { spentFromJournal } from "./vis-export.js";

export interface WindowData {
  now: string;
  /** Début de la fenêtre (démarrage du worker), ISO UTC. */
  startedAt: string;
  days: number;
  /** Questions actives chargées dans Elmo pour ce sujet. */
  prompts: number;
  engines: string[];
  runs: { model: string; version: string; createdAt: string }[];
  failed: { model: string; createdAt: string }[];
}

export interface Money {
  spentUsd: number | null;
  alertUsd: number;
  capUsd: number;
}

export interface DaySlot {
  day: number;
  from: string;
  to: string;
  ended: boolean;
  perEngine: { model: string; ok: number; failed: number; versions: string[] }[];
  state: "complet" | "incomplet" | "manquant" | "en cours" | "à venir";
}

export interface WindowState {
  currentDay: number | null;
  slots: DaySlot[];
  problems: string[];
}

const DAY_MS = 86_400_000;

export function windowState(d: WindowData, money: Money): WindowState {
  const start = Date.parse(d.startedAt);
  const now = Date.parse(d.now);
  const slots: DaySlot[] = [];
  for (let i = 0; i < d.days; i++) {
    const from = start + i * DAY_MS;
    const to = from + DAY_MS;
    const inSlot = (t: string) => {
      const x = Date.parse(t);
      return x >= from && x < to;
    };
    const perEngine = d.engines.map((model) => {
      const rs = d.runs.filter((r) => r.model === model && inSlot(r.createdAt));
      return {
        model,
        ok: rs.length,
        failed: d.failed.filter((f) => f.model === model && inSlot(f.createdAt)).length,
        versions: [...new Set(rs.map((r) => r.version))].sort(),
      };
    });
    const total = perEngine.reduce((n, e) => n + e.ok, 0);
    const full = perEngine.every((e) => e.ok >= d.prompts);
    const ended = now >= to;
    const state: DaySlot["state"] =
      now < from ? "à venir" : full ? "complet" : !ended ? "en cours" : total === 0 ? "manquant" : "incomplet";
    slots.push({ day: i + 1, from: new Date(from).toISOString(), to: new Date(to).toISOString(), ended, perEngine, state });
  }
  const current = slots.find((s) => Date.parse(s.from) <= now && now < Date.parse(s.to));
  const problems: string[] = [];
  for (const s of slots) {
    if (s.state === "manquant") problems.push(`jour ${s.day} manquant (aucun run)`);
    if (s.state === "incomplet") {
      const short = s.perEngine.filter((e) => e.ok < d.prompts).map((e) => `${e.model} ${e.ok}/${d.prompts}`);
      problems.push(`jour ${s.day} incomplet : ${short.join(", ")}`);
    }
    for (const e of s.perEngine) if (e.failed > 0 && Date.parse(s.from) <= now) problems.push(`jour ${s.day} : ${e.model} en échec (${e.failed})`);
  }
  // Une version servie qui change pendant la fenêtre fragilise la comparaison.
  for (const model of d.engines) {
    const versions = [...new Set(d.runs.filter((r) => r.model === model).map((r) => r.version))];
    if (versions.length > 1) problems.push(`${model} : version servie changée (${versions.join(" → ")})`);
  }
  if (money.spentUsd !== null && money.alertUsd > 0 && money.spentUsd >= money.alertUsd) {
    problems.push(`dépense du mois ${money.spentUsd.toFixed(2)} $ ≥ seuil d'alerte ${money.alertUsd} $ (plafond ${money.capUsd} $)`);
  }
  return { currentDay: current?.day ?? null, slots, problems };
}

const fmt = (iso: string) => iso.slice(0, 16).replace("T", " ") + " UTC";

/** Dix lignes au plus, pour `pnpm vis:j0-status`. */
export function renderStatus(name: string, windowId: string, d: WindowData, st: WindowState, money: Money): string {
  const cur = st.slots.find((s) => s.day === st.currentDay) ?? [...st.slots].reverse().find((s) => s.ended);
  const missing = st.slots.filter((s) => s.state === "manquant" || s.state === "incomplet").map((s) => `${s.day} (${s.state})`);
  const lines = [
    `${name} · fenêtre ${windowId} · ${st.currentDay ? `jour ${st.currentDay}/${d.days}` : "hors fenêtre"} · démarrée ${fmt(d.startedAt)}`,
    cur ? `Jour ${cur.day} (${cur.state}), runs réussis / ${d.prompts} questions :` : "Aucun jour en cours.",
    cur ? `  ${cur.perEngine.map((e) => `${e.model} ${e.ok}${e.failed ? ` (+${e.failed} échec)` : ""}`).join(" · ")}` : "",
    `Jours manquants ou incomplets : ${missing.length ? missing.join(", ") : "aucun"}`,
    `Dépense retenue du mois : ${money.spentUsd === null ? "inconnue" : `${money.spentUsd.toFixed(2)} $`} (alerte ${money.alertUsd} $, plafond ${money.capUsd} $)`,
    `Problèmes : ${st.problems.length ? st.problems.join(" ; ") : "aucun"}`,
    "Dépense réelle : consoles OpenAI (Usage), Anthropic (espace oia-visibility), Mistral (Usage),",
    "  OpenRouter (Activity), TypeSafe ; à reporter dans OIA_VIS_MANUAL_COST_USD.",
  ];
  return `${lines.filter(Boolean).join("\n")}\n`;
}

/** Fiche du jour en cours (ou du dernier jour terminé). */
export function renderDay(name: string, windowId: string, d: WindowData, st: WindowState, money: Money): { day: number; markdown: string } | null {
  const s = st.slots.find((x) => x.day === st.currentDay) ?? [...st.slots].reverse().find((x) => x.ended);
  if (!s) return null;
  const L = [
    `# ${name} · ${windowId} · jour ${s.day}/${d.days}`,
    "",
    `Tranche : ${fmt(s.from)} → ${fmt(s.to)} · état : **${s.state}** · relevé : ${fmt(d.now)}`,
    "",
    "| Moteur | Réussis | Échoués | Manquants | Version servie |",
    "|---|---|---|---|---|",
    ...s.perEngine.map((e) => `| ${e.model} | ${e.ok} | ${e.failed} | ${Math.max(0, d.prompts - e.ok)} | ${e.versions.join(", ") || "—"} |`),
    "",
    `Dépense retenue du mois : ${money.spentUsd === null ? "inconnue" : `${money.spentUsd.toFixed(2)} $`} face au plafond de ${money.capUsd} $ (alerte ${money.alertUsd} $). Dépense estimée, non facturée.`,
    "",
    `Problèmes : ${st.problems.length ? "" : "aucun."}`,
    ...st.problems.map((p) => `- ${p}`),
    "",
  ];
  return { day: s.day, markdown: L.join("\n") };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [mode, subjectId, dataFile, journalFile] = process.argv.slice(2);
  try {
    if (!mode || !subjectId || !dataFile) throw new Error("usage: tsx src/window-watch.ts status|day <subjectId> <window-data.json> [cost-journal.csv]");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((x) => x.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const b = loadSubject(dir);
    const d = JSON.parse(readFileSync(dataFile, "utf8")) as WindowData;
    const windowId = process.env.OIA_VIS_WINDOW ?? "j0";
    const money: Money = {
      spentUsd: journalFile && existsSync(journalFile) ? spentFromJournal(readFileSync(journalFile, "utf8"), d.now.slice(0, 7)) : null,
      alertUsd: Number(process.env.OIA_VIS_MONTHLY_ALERT_USD ?? 24),
      capUsd: Number(process.env.OIA_VIS_MONTHLY_CAP_USD ?? 30),
    };
    const st = windowState(d, money);
    if (mode === "status") process.stdout.write(renderStatus(b.subject.displayName, windowId, d, st, money));
    else if (mode === "day") {
      const r = renderDay(b.subject.displayName, windowId, d, st, money);
      if (!r) throw new Error("aucun jour commencé");
      process.stdout.write(JSON.stringify({ day: r.day, problems: st.problems, markdown: r.markdown }));
      process.exit(st.problems.length ? 3 : 0);
    } else throw new Error(`mode inconnu : ${mode}`);
  } catch (err) {
    process.stderr.write(`window-watch : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
