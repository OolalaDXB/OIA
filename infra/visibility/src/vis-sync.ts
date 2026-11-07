/**
 * Synchronisation d'une fenêtre vers la base OIA (mandat v9, bloc C) : à
 * partir de l'exportation en LECTURE SEULE d'Elmo (scripts/j0-export.sh) et du
 * sujet OIA, un script SQL à appliquer sur le schéma `vis` :
 *
 *   * client, site, sujet, fenêtre et questions du panel : créés s'ils
 *     manquent, jamais écrasés (sauf l'état de la fenêtre, qui avance) ;
 *   * une preuve par réponse de la fenêtre (src/j0-evidence.ts), identifiant
 *     stable dérivé du run d'Elmo, en AJOUT SEUL : une preuve déjà en base
 *     n'est jamais réécrite, et si son empreinte ne correspond plus au texte
 *     exporté, le script échoue sans rien changer ;
 *   * citations : liens de redirection de Gemini remplacés par le site réel
 *     (cache de src/redirects.ts) ;
 *   * jours manquants : chaque jour écoulé de la fenêtre sans aucune réponse.
 *
 * Une seule transaction. Aucun appel à un fournisseur d'IA, aucune écriture
 * dans Elmo.
 *
 * CLI : tsx src/vis-sync.ts <subjectId> <windowId> <export.json> [redirects-cache.json] > sync.sql
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { toEvidence, type WindowExport } from "./j0-evidence.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { applyRedirects, readCache, type RedirectCache } from "./redirects.js";
import type { SubjectBundle } from "./schema.js";

const DOLLAR = "$vis_sync$";
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** UUID stable (forme v4) dérivé d'un texte, comme packages/money-lookup. */
export function uuidStable(texte: string): string {
  const h = sha256(`oia:${texte}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const jour = (iso: string) => iso.slice(0, 10);
const plusJours = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export interface SyncOptions {
  windowId: string;
  /** Client Visibility du sujet ; par défaut l'identifiant du sujet. */
  clientId?: string;
  redirects?: RedirectCache;
  /** État de la fenêtre ; « running » tant que vis:j0-close n'est pas passé. */
  status?: "running" | "done";
}

export interface SyncResult {
  sql: string;
  preuves: number;
  vides: number;
  joursManquants: string[];
  fenetre: string;
}

export function sqlSync(b: SubjectBundle, exp: WindowExport, opts: SyncOptions): SyncResult {
  const s = b.subject;
  const client = opts.clientId ?? s.id;
  const fenetre = `${s.id}-${opts.windowId}`;
  const debut = jour(exp.startedAt);
  const fin = plusJours(debut, exp.days - 1);
  const cache = opts.redirects ?? {};

  const toutes = toEvidence(b, exp, fenetre);
  const vides = toutes.filter((e) => e.rawText.length === 0).length; // jamais inventées : écartées et comptées
  const preuves = toutes
    .filter((e) => e.rawText.length > 0)
    .map((e) => ({
      id: uuidStable(e.id),
      client_id: client,
      site_id: s.id,
      subject_id: s.id,
      window_id: fenetre,
      prompt_id: e.promptId,
      prompt_version: e.promptVersion,
      prompt_language: e.promptLanguage,
      engine: e.engine,
      engine_version: e.engineVersion ?? null,
      collector_name: e.collectorName,
      collector_run_id: e.collectorRunId ?? null,
      received_at: e.receivedAt,
      raw_text: e.rawText,
      sha: e.rawSha256Hex,
      structured: e.structured,
      citations: [...new Set(e.citations.map((c) => applyRedirects(c.url, cache)))].map((url) => ({ url })),
      cost_usd: e.costUsd,
    }));

  // Jours écoulés (strictement avant le jour de l'exportation) sans aucune réponse.
  const jours = new Set(preuves.map((p) => jour(p.received_at)));
  const joursManquants: string[] = [];
  for (let i = 0; i < exp.days; i++) {
    const d = plusJours(debut, i);
    if (d < jour(exp.exportedAt) && !jours.has(d)) joursManquants.push(d);
  }

  const questions = b.panel.prompts.map((p) => ({
    question_id: p.id,
    version: p.version,
    langue: p.language,
    texte: p.text,
    marquee: p.family === "branded",
    etiquettes: [p.family, p.status, ...(p.markets ?? [])],
  }));

  const site = {
    primary_url: s.urls.primary,
    additional_urls: s.urls.additional.map((a) => ({ url: a.url, status: a.status })),
  };

  const json = (v: unknown) => {
    const t = JSON.stringify(v);
    if (t.includes(DOLLAR)) throw new Error("Données inattendues : le délimiteur SQL apparaît dans l'exportation.");
    return `${DOLLAR}${t}${DOLLAR}::jsonb`;
  };
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;

  const sql = `-- Synchronisation Visibility · ${s.id} · fenêtre ${fenetre} · ${preuves.length} preuves · exportée ${exp.exportedAt}
begin;
insert into vis.client (id, display_name, ownership, status, default_repo_action_mode)
values (${lit(client)}, ${lit(s.displayName)}, ${lit(s.ownership)}, 'active', 'lecture')
on conflict (id) do nothing;
insert into vis.site (id, client_id, primary_url, additional_urls, status)
select ${lit(s.id)}, ${lit(client)}, x ->> 'primary_url', x -> 'additional_urls', 'active' from (select ${json(site)} as x) t
on conflict (id) do nothing;
insert into vis.subject (id, client_id, status) values (${lit(s.id)}, ${lit(client)}, 'active')
on conflict (id) do nothing;
insert into vis.subject_site (subject_id, site_id, client_id) values (${lit(s.id)}, ${lit(s.id)}, ${lit(client)})
on conflict do nothing;
insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on)
values (${lit(fenetre)}, ${lit(s.id)}, ${lit(client)}, 'baseline', ${b.panel.panelVersion}, ${lit(opts.status ?? "running")}, '${debut}', '${fin}')
on conflict (id) do update set status = excluded.status
where vis.window.status is distinct from excluded.status and vis.window.status <> 'done';
insert into vis_ui.question (client_id, subject_id, question_id, version, langue, texte, marquee, etiquettes)
select ${lit(client)}, ${lit(s.id)}, q.question_id, q.version, q.langue, q.texte, q.marquee, q.etiquettes
from jsonb_to_recordset(${json(questions)}) as q(question_id text, version int, langue text, texte text, marquee boolean, etiquettes text[])
on conflict (subject_id, question_id, version) do nothing;
${joursManquants.map((d) => `insert into vis.window_missing_day (window_id, missing_on, reason) values (${lit(fenetre)}, '${d}', 'aucune réponse reçue ce jour') on conflict do nothing;`).join("\n")}
create temp table _vis_x on commit drop as
select * from jsonb_to_recordset(${json(preuves)}) as t(
  id uuid, client_id text, site_id text, subject_id text, window_id text, prompt_id text, prompt_version int, prompt_language text,
  engine text, engine_version text, collector_name text, collector_run_id text, received_at timestamptz, raw_text text, sha text,
  structured jsonb, citations jsonb, cost_usd numeric);
insert into vis.evidence (id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine,
  engine_version, collector_name, collector_run_id, received_at, raw_text, structured, citations, cost_usd)
select id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine,
  engine_version, collector_name, collector_run_id, received_at, raw_text, structured, citations, cost_usd
from _vis_x
on conflict (id) do nothing;
do $$
declare n int;
begin
  select count(*) into n from vis.evidence e join _vis_x x on x.id = e.id where encode(e.raw_sha256, 'hex') <> x.sha;
  if n > 0 then
    raise exception 'vis-sync : % preuve(s) déjà en base ne correspondent plus au texte exporté ; rien n''est appliqué', n;
  end if;
end $$;
select 'preuves en base pour la fenêtre : ' || count(*) from vis.evidence where window_id = ${lit(fenetre)};
commit;
`;
  return { sql, preuves: preuves.length, vides, joursManquants, fenetre };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, windowId, exportFile, cacheFile] = process.argv.slice(2);
  try {
    if (!subjectId || !windowId || !exportFile) throw new Error("usage: tsx src/vis-sync.ts <subjectId> <windowId> <export.json> [redirects-cache.json]");
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === subjectId);
    if (!dir) throw new Error(`aucun sujet "${subjectId}"`);
    const exp = JSON.parse(readFileSync(exportFile, "utf8")) as WindowExport;
    const r = sqlSync(loadSubject(dir), exp, {
      windowId,
      redirects: cacheFile && existsSync(cacheFile) ? readCache(cacheFile) : {},
      status: process.env.OIA_VIS_WINDOW_STATUS === "done" ? "done" : "running",
    });
    process.stdout.write(r.sql);
    process.stderr.write(`vis-sync : ${r.preuves} preuve(s), ${r.vides} réponse(s) vide(s) écartée(s), jours manquants : ${r.joursManquants.join(", ") || "aucun"}\n`);
  } catch (err) {
    process.stderr.write(`vis-sync : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
