/**
 * Recommandations et fenêtres (mandat v13, bloc D), pour `pnpm vis status <sujet>
 * <fenêtre>` : recommandations exécutées depuis la fenêtre de référence (celles que
 * cette fenêtre mesurera), et celles encore en attente (à valider, validées non
 * exécutées, bloquées). Lecture seule de subjects/<sujet>/recommendations.yaml.
 *
 * Date au plus tôt de la fenêtre : trois semaines après la dernière exécution
 * (règle de measurement.yaml) ; la date reste fixée par Mickaël.
 *
 * CLI : tsx src/recommendation-status.ts <subjectId> <windowId>
 */
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { loadRecommendations, type Recommendation } from "./recommendation.js";
import type { SubjectBundle } from "./schema.js";

export const MIN_DAYS_AFTER_EXECUTION = 21;

export interface RecommendationStatus {
  windowId: string;
  referenceId: string | null;
  /** Exécutées après la fin de la référence, ou rattachées à cette fenêtre (measuredBy). */
  executed: { id: string; title: string; executedAt: string; proof: string; measuredBy: string | null }[];
  pending: { id: string; title: string; state: "à valider" | "validée, non exécutée" | "bloquée"; blockedBy: string | null; owner: string | null }[];
  /** Exécutées mais rattachées à une autre fenêtre que celle-ci : à corriger dans recommendations.yaml. */
  misattached: string[];
  earliestStart: string | null;
  startTooEarly: boolean;
}

const plusDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function recommendationStatus(b: SubjectBundle, windowId: string, recs: Recommendation[]): RecommendationStatus {
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w) throw new Error(`fenêtre « ${windowId} » absente de measurement.yaml`);
  const ref = w.comparesWith ? b.measurement.windows.find((x) => x.id === w.comparesWith) ?? null : null;
  const live = recs.filter((r) => r.decision.status !== "rejected" && r.decision.status !== "obsolete");
  const executed = live
    .filter((r) => r.execution && (r.execution.measuredBy === windowId || (!r.execution.measuredBy && ref?.end !== undefined && r.execution.executedAt >= ref.end)))
    .sort((a, z) => a.execution!.executedAt.localeCompare(z.execution!.executedAt) || a.id.localeCompare(z.id))
    .map((r) => ({ id: r.id, title: r.title, executedAt: r.execution!.executedAt, proof: `${r.execution!.proof.kind} ${r.execution!.proof.ref}`, measuredBy: r.execution!.measuredBy ?? null }));
  const misattached = live.filter((r) => r.execution?.measuredBy && r.execution.measuredBy !== windowId && !b.measurement.windows.some((x) => x.id === r.execution!.measuredBy)).map((r) => r.id);
  const pending = live
    .filter((r) => !r.execution)
    .map((r) => ({
      id: r.id,
      title: r.title,
      state: (r.blockedBy ? "bloquée" : r.decision.status === "accepted" ? "validée, non exécutée" : "à valider") as RecommendationStatus["pending"][number]["state"],
      blockedBy: r.blockedBy ?? null,
      owner: r.owner ?? null,
    }));
  const last = executed.map((e) => e.executedAt).sort().pop();
  const earliestStart = last ? plusDays(last, MIN_DAYS_AFTER_EXECUTION) : null;
  return {
    windowId,
    referenceId: ref?.id ?? null,
    executed,
    pending,
    misattached,
    earliestStart,
    startTooEarly: Boolean(earliestStart && w.start && w.start < earliestStart),
  };
}

export function renderRecommendationStatus(s: RecommendationStatus): string {
  const L: string[] = [];
  L.push(`## Recommandations · fenêtre ${s.windowId}${s.referenceId ? ` (référence ${s.referenceId})` : ""}`, "");
  L.push(`Exécutées, mesurées par ${s.windowId} : ${s.executed.length}`);
  for (const e of s.executed) L.push(`- ${e.executedAt} · ${e.title} (${e.id}) · preuve : ${e.proof}`);
  L.push("", `En attente : ${s.pending.length}`);
  for (const p of s.pending) L.push(`- ${p.state}${p.blockedBy ? ` (${p.blockedBy})` : ""} · ${p.title} (${p.id})${p.owner ? ` · ${p.owner === "client" ? "client" : "équipe"}` : ""}`);
  for (const id of s.misattached) L.push(`- ATTENTION : ${id} rattachée à une fenêtre absente de measurement.yaml`);
  L.push("");
  if (s.earliestStart) {
    L.push(`Début au plus tôt (${MIN_DAYS_AFTER_EXECUTION} jours après la dernière exécution) : ${s.earliestStart}. Date fixée par Mickaël.`);
    if (s.startTooEarly) L.push(`ATTENTION : le début déclaré de ${s.windowId} est antérieur à cette date.`);
  } else {
    L.push(`Aucune recommandation exécutée depuis la référence : rien à mesurer encore ; date de ${s.windowId} à fixer par Mickaël, au moins ${MIN_DAYS_AFTER_EXECUTION} jours après la dernière exécution.`);
  }
  return `${L.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, windowId] = process.argv.slice(2);
  try {
    if (!subjectId || !windowId) throw new Error("usage: tsx src/recommendation-status.ts <subjectId> <windowId>");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet « ${subjectId} »`);
    process.stdout.write(renderRecommendationStatus(recommendationStatus(loadSubject(dir), windowId, loadRecommendations(dir))));
  } catch (err) {
    process.stderr.write(`recommendation-status : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
