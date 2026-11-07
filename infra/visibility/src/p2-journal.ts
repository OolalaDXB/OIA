/**
 * Correctifs P2 préparés (subjects/<sujet>/p2/decisions.md, src/p2-prepare.ts)
 * → journal de décision de la base OIA (mandat v9, bloc C) : une
 * recommandation `TECH_FIX` par correctif, SANS décision, donc « en attente »
 * dans vis_recommandations_v1. La validation reste humaine (vis_valider_recommandation).
 *
 * Impact, effort et confiance ne figurent pas dans decisions.md : ils sont posés
 * à « medium » / « S » / « medium » et signalés comme non évalués dans le
 * payload, jamais présentés comme mesurés. Le risque vient du tableau.
 * Rejouable : une recommandation déjà présente n'est jamais réécrite.
 *
 * CLI : tsx src/p2-journal.ts <subjectId> [clientId] > journal.sql
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { defaultSubjectsDir } from "./load.js";

export interface CorrectifP2 {
  numero: number;
  titre: string;
  controles: string[];
  risque: "low" | "medium" | "high";
  bloquePar: string | null;
  pourGoogle: string | null;
  pourAssistants: string | null;
  branche: string | null;
  commit: string | null;
  detail: string | null;
}

export function lireDecisions(md: string): CorrectifP2[] {
  const out: CorrectifP2[] = [];
  for (const ligne of md.split("\n")) {
    const m = /^\| (\d+) \| (.+?) \| ([A-Z0-9, ]+) \| (low|medium|high) \| (.+?) \| \[.\] \|$/.exec(ligne);
    if (!m) continue;
    const numero = Number(m[1]);
    const section = md.split(/^## /m).find((s) => s.startsWith(`${numero} · `)) ?? "";
    const champ = (nom: string) => new RegExp(`\\*\\*${nom}\\*\\* : (.+)`).exec(section)?.[1]?.trim() ?? null;
    const fusion = /branche `([^`]+)` \(commit `([0-9a-f]+)`.*?détail dans `([^`]+)`/.exec(section);
    out.push({
      numero,
      titre: m[2]!.trim(),
      controles: m[3]!.split(",").map((c) => c.trim()).filter(Boolean),
      risque: m[4] as CorrectifP2["risque"],
      bloquePar: m[5]!.trim() === "—" ? null : m[5]!.trim(),
      pourGoogle: champ("Pour Google"),
      pourAssistants: champ("Pour les assistants"),
      branche: fusion?.[1] ?? null,
      commit: fusion?.[2] ?? null,
      detail: fusion?.[3] ?? null,
    });
  }
  return out;
}

const DOLLAR = "$p2_journal$";
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

export function sqlJournal(subjectId: string, clientId: string, correctifs: CorrectifP2[]): string {
  const lignes = correctifs.map((c) => {
    const id = `rec-${subjectId}-p2-${c.numero}-${slug(c.titre)}`.replace(/-+$/, "");
    const payload = {
      source: `subjects/${subjectId}/p2/decisions.md`,
      numero: c.numero,
      controles: c.controles,
      bloque_par: c.bloquePar,
      pour_google: c.pourGoogle,
      pour_assistants: c.pourAssistants,
      demande_de_fusion_simulee: c.branche ? { branche: c.branche, commit: c.commit, detail: c.detail ? `subjects/${subjectId}/p2/${c.detail}` : null } : null,
      estimations_non_evaluees: ["impact_level", "effort_level", "confidence"],
      gel: "publication seulement après validation du rapport J0",
      evidence: [],
    };
    const json = JSON.stringify(payload);
    if (json.includes(DOLLAR)) throw new Error("délimiteur SQL inattendu dans decisions.md");
    const enonce = [c.pourGoogle && `Pour Google : ${c.pourGoogle}`, c.pourAssistants && `Pour les assistants : ${c.pourAssistants}`, c.bloquePar && `Bloqué par : ${c.bloquePar}`]
      .filter(Boolean).join(" ");
    return `insert into vis.recommendation (id, client_id, site_id, subject_id, type, title, statement, impact_level, effort_level, risk, confidence, fix_kind, fix_generator, created_by, payload)
values (${lit(id)}, ${lit(clientId)}, ${lit(subjectId)}, ${lit(subjectId)}, 'TECH_FIX', ${lit(c.titre)}, ${lit(enonce || c.titre)}, 'medium', 'S', ${lit(c.risque)}, 'medium',
  'p2', 'src/p2-prepare.ts', 'oia-visibility/p2-prepare', ${DOLLAR}${json}${DOLLAR}::jsonb)
on conflict (id) do nothing;`;
  });
  return `-- Journal de décision · correctifs P2 de ${subjectId} · ${correctifs.length} recommandation(s), en attente de validation
begin;
${lignes.join("\n")}
commit;
`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, clientId] = process.argv.slice(2);
  try {
    if (!subjectId) throw new Error("usage: tsx src/p2-journal.ts <subjectId> [clientId]");
    const md = readFileSync(join(defaultSubjectsDir(), subjectId, "p2", "decisions.md"), "utf8");
    const c = lireDecisions(md);
    if (!c.length) throw new Error("aucun correctif lu dans decisions.md");
    process.stdout.write(sqlJournal(subjectId, clientId ?? subjectId, c));
  } catch (err) {
    process.stderr.write(`p2-journal : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
