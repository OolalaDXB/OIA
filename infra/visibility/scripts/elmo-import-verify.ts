/**
 * Vérification de l'import final d'Elmo (mandat v14, bloc B) sur un Postgres JETABLE,
 * avec les données réelles de l'export du bloc A, sans rien écrire ailleurs :
 *
 *   1. migrations vis 0001 à 0005, vues 0006, puis le SQL d'import ;
 *   2. réponses en base = runs d'Elmo (prompt_runs de l'export) ;
 *   3. pour chaque fenêtre mesurée, empreinte SHA-256 de chaque réponse = celle de la
 *      table des preuves locale (<data>/<sujet>/evidence/<fenêtre>.jsonl), et même nombre ;
 *   4. rapport de la fenêtre recalculé depuis la base = figures.json enregistré ;
 *   5. import rejoué : rien ne change ; texte modifié : refus, rien ne change.
 *
 *   npx tsx scripts/elmo-import-verify.ts <dossier d'export> [data]
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { parse } from "yaml";
import { demarrer, ecrireTemp, erreur } from "../../../packages/database/test/pg/banc.js";
import type { EvidenceRow } from "../src/elmo-import.js";
import { buildImport, importSql, readElmoExport } from "../src/elmo-import-final.js";
import { readEvidence } from "../src/evidence-store.js";
import { computeFigures, type FactKeywords, type ReportFigures } from "../src/j0-report.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "../src/load.js";
import { readCache } from "../src/redirects.js";

const [dir, dataArg] = process.argv.slice(2);
if (!dir) throw new Error("usage: tsx scripts/elmo-import-verify.ts <dossier d'export> [data]");
const data = dataArg ?? process.env.OIA_VIS_DATA ?? join(process.env.HOME!, "oia-visibility-data");
const here = (rel: string) => fileURLToPath(new URL(rel, import.meta.url));
const ok: string[] = [];
const fail: string[] = [];
const check = (cond: boolean, text: string) => (cond ? ok : fail).push(text);

const bundles = listSubjectDirs(defaultSubjectsDir()).map((d) => loadSubject(d));
const exp = readElmoExport(dir);
const rows = buildImport(bundles, exp);
const sql = importSql(bundles, rows, dir);
const b = demarrer();
try {
  b.fichier(here("../../../packages/database/test/pg/supabase-emulation.sql"));
  for (const m of ["0001_evidence", "0002_decision_journal", "0003_client_action_log", "0004_auth_identity", "0005_evidence_non_mesuree"]) b.fichier(here(`../migrations/${m}.sql`));
  b.fichier(here("../../../packages/database/supabase/migrations/0006_visibility_vues.sql"));
  b.fichier(ecrireTemp(sql));

  const n = Number(b.sql("select count(*) from vis.evidence where collector_name = 'elmo-0.7.7'"));
  check(n === exp.prompt_runs.length, `réponses en base = runs d'Elmo : ${n} / ${exp.prompt_runs.length}`);
  const empreintes = () => b.sql("select string_agg(id::text || encode(raw_sha256, 'hex'), ',' order by id) from vis.evidence");

  for (const bundle of bundles) {
    for (const w of bundle.measurement.windows.filter((x) => x.status === "done")) {
      const local = join(data, bundle.subject.id, "evidence", `${w.id}.jsonl`);
      const figFile = join(bundle.dir, "reports", w.id, "figures.json");
      if (!existsSync(local)) continue;
      const ev = readEvidence(local).filter((e) => e.windowId === w.id);
      // Lecture par lots : le banc lit la sortie de psql dans un tampon borné.
      const db: { run: string; sha: string; row: Record<string, unknown> }[] = [];
      const total = Number(b.sql(`select count(*) from vis.evidence where window_id = '${bundle.subject.id}-${w.id}'`));
      for (let off = 0; off < total; off += 20) {
        db.push(...(JSON.parse(b.sql(`select coalesce(json_agg(json_build_object('run', collector_run_id, 'sha', encode(raw_sha256, 'hex'), 'row', (to_jsonb(e) - 'structured' - 'raw_sha256') || jsonb_build_object('structured', e.structured - 'rawOutput'))), '[]') from (select * from vis.evidence where window_id = '${bundle.subject.id}-${w.id}' order by id limit 20 offset ${off}) e`)) as typeof db));
      }
      const byRun = new Map(db.map((x) => [x.run, x]));
      const same = ev.filter((e) => byRun.get(e.collectorRunId)?.sha === e.rawSha256Hex).length;
      check(db.length === ev.length && same === ev.length, `${bundle.subject.id}/${w.id} : ${same} empreintes identiques sur ${ev.length} preuves locales (${db.length} en base)`);

      // Rapport recalculé depuis la base.
      const closeDir = [join(data, bundle.subject.id, w.id, "close"), join(data, w.id, "close")].find((d) => existsSync(join(d, "failed.json")));
      if (!closeDir || !existsSync(figFile)) { check(false, `${bundle.subject.id}/${w.id} : failed.json ou figures.json introuvable`); continue; }
      const failed = JSON.parse(readFileSync(join(closeDir, "failed.json"), "utf8")) as { startedAt: string; days: number; failed: { model: string; createdAt: string }[] };
      const kwFile = join(bundle.dir, "fact-keywords.yaml");
      const keywords = existsSync(kwFile) ? (parse(readFileSync(kwFile, "utf8")) as FactKeywords) : { facts: [] };
      const fromDb: EvidenceRow[] = db.map(({ row: r }) => {
        const s = r.structured as Record<string, unknown>;
        return {
          id: String(s.localEvidenceId), clientId: String(r.client_id), siteId: (r.site_id as string) ?? null, subjectId: String(r.subject_id), windowId: w.id,
          promptId: String(r.prompt_id), promptVersion: Number(r.prompt_version), promptLanguage: String(r.prompt_language),
          engine: String(r.engine), engineVersion: (r.engine_version as string) ?? undefined, collectorName: String(r.collector_name), collectorRunId: String(r.collector_run_id),
          receivedAt: new Date(String(r.received_at)).toISOString().replace(/\.\d{3}Z$/, "Z"), rawText: String(r.raw_text), rawSha256Hex: "",
          structured: s, citations: (r.citations as { url: string }[]).map((c) => ({ url: c.url })), costUsd: Number(r.cost_usd),
        } as EvidenceRow;
      });
      const recomputed = computeFigures(bundle, w.id, fromDb, failed, failed.failed, keywords, readCache(join(closeDir, "redirects.json")));
      const stored = JSON.parse(readFileSync(figFile, "utf8")) as ReportFigures;
      const diff = (Object.keys(stored) as (keyof ReportFigures)[]).filter((k) => !isDeepStrictEqual(recomputed[k], stored[k]));
      check(diff.length === 0, `${bundle.subject.id}/${w.id} : rapport recalculé depuis la base ${diff.length ? `DIFFÉRENT (${diff.join(", ")})` : "= figures.json"}`);
    }
  }

  const avant = empreintes();
  b.fichier(ecrireTemp(sql));
  check(empreintes() === avant, "import rejoué : aucune preuve ajoutée ni réécrite");
  const tampered = buildImport(bundles, exp);
  const t = tampered.find((r) => r.raw_text.length > 0)!;
  t.raw_text = `${t.raw_text} (modifié)`;
  t.sha = "00";
  check(/ne correspondent pas au texte/.test(erreur(b, importSql(bundles, tampered, dir)) ?? ""), "texte modifié : import refusé");
  check(empreintes() === avant, "après le refus : base inchangée");
  check(/append-only/.test(erreur(b, "delete from vis.evidence where collector_name = 'elmo-0.7.7'") ?? ""), "suppression refusée (append-only)");
  check(/raw_text_ou_non_mesuree/.test(erreur(b, `insert into vis.evidence (client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, collector_name, raw_text) select client_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine, 'test', '' from vis.evidence limit 1`) ?? ""), "texte vide sans non_mesuree : refusé (0005)");
} finally {
  b.arreter();
}
for (const l of ok) process.stdout.write(`ok    ${l}\n`);
for (const l of fail) process.stdout.write(`ÉCHEC ${l}\n`);
process.stdout.write(fail.length ? "\nIMPORT NON VÉRIFIÉ\n" : "\nIMPORT VÉRIFIÉ sur Postgres jetable\n");
process.exit(fail.length ? 1 : 0);
