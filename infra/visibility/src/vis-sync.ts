/**
 * Synchronisation d'une fenêtre vers la base OIA (mandat v9, bloc C ; toute
 * fenêtre de tout sujet depuis le mandat v13, bloc F) : à partir de
 * l'exportation en LECTURE SEULE d'Elmo (scripts/j0-export.sh) et du sujet OIA,
 * un script SQL à appliquer sur le schéma `vis` :
 *
 *   * la fenêtre doit être déclarée dans measurement.yaml (type, panel, durée,
 *     début), sinon refus ; ses questions exclues (excludedPromptIds) sont
 *     écartées ; seules les réponses de ses jours comptent, l'exportation
 *     d'Elmo contenant toutes les réponses de la marque ;
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
 * Comparaison de deux fenêtres (src/window-compare.ts) : sqlComparaison, en
 * ajout seul dans vis_ui.comparaison (migration 0010, proposée).
 *
 * CLI : tsx src/vis-sync.ts <subjectId> <windowId> <export.json> [redirects-cache.json] > sync.sql
 *       tsx src/vis-sync.ts --jours <subjectId> <windowId>   (durée déclarée, refus si fenêtre inconnue)
 *       tsx src/vis-sync.ts --comparaison <comparaison.json> > comparaison.sql
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { toEvidence, type WindowExport } from "./j0-evidence.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import { applyRedirects, readCache, type RedirectCache } from "./redirects.js";
import type { Measurement, SubjectBundle } from "./schema.js";

const DOLLAR = "$vis_sync$";
const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** UUID stable (forme v4) dérivé d'un texte, comme packages/money-lookup. */
export function uuidStable(texte: string): string {
  const h = sha256(`oia:${texte}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${((parseInt(h.slice(16, 17), 16) & 0x3) | 0x8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const jour = (iso: string) => iso.slice(0, 10);
const plusJours = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

type Fenetre = Measurement["windows"][number];

/** Fenêtre déclarée dans measurement.yaml : aucune synchronisation d'une fenêtre inconnue. */
export function fenetreDeclaree(b: SubjectBundle, windowId: string): Fenetre {
  const w = b.measurement.windows.find((x) => x.id === windowId);
  if (!w) throw new Error(`fenêtre "${windowId}" absente de measurement.yaml du sujet ${b.subject.id} : synchronisation refusée`);
  return w;
}

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
  const w = fenetreDeclaree(b, opts.windowId);
  if (exp.subjectId !== s.id) throw new Error(`exportation du sujet "${exp.subjectId}", attendu "${s.id}"`);
  if (exp.days !== w.days) throw new Error(`exportation sur ${exp.days} jour(s), fenêtre ${w.id} déclarée sur ${w.days}`);
  if (w.start && jour(exp.startedAt) !== w.start) throw new Error(`exportation commencée le ${jour(exp.startedAt)}, fenêtre ${w.id} déclarée au ${w.start}`);
  const client = opts.clientId ?? s.id;
  const fenetre = `${s.id}-${opts.windowId}`;
  const debut = jour(exp.startedAt);
  const fin = plusJours(debut, exp.days - 1);
  const cache = opts.redirects ?? {};

  // Identifiant de measurement.yaml (questions exclues), pas celui de la base.
  const toutes = toEvidence(b, exp, opts.windowId);
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
values (${lit(fenetre)}, ${lit(s.id)}, ${lit(client)}, ${lit(w.kind)}, ${w.panelVersion}, ${lit(opts.status ?? "running")}, '${debut}', '${fin}')
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
  select count(*) into n from vis.evidence e join _vis_x x on x.id = e.id where e.window_id <> x.window_id;
  if n > 0 then
    raise exception 'vis-sync : % preuve(s) déjà en base appartiennent à une autre fenêtre ; rien n''est appliqué', n;
  end if;
end $$;
select 'preuves en base pour la fenêtre : ' || count(*) from vis.evidence where window_id = ${lit(fenetre)};
commit;
`;
  return { sql, preuves: preuves.length, vides, joursManquants, fenetre };
}

/** Verdicts de src/window-compare.ts (bloc C). */
export const VERDICTS = ["hausse", "baisse", "pas de changement démontrable", "non comparable"] as const;

/** Ce que la base lit de la comparaison ; le reste est rangé tel quel en jsonb. */
export interface ComparaisonLue {
  comparisonFormat: 1;
  subjectId: string;
  windowId: string;
  referenceId: string;
  provenance: { reference: { evidenceCount: number; digest: string }; current: { evidenceCount: number; digest: string } };
  unbranded: { total: { verdict: (typeof VERDICTS)[number] } };
}

export interface ComparaisonSql {
  sql: string;
  id: string;
  /** SHA-256 du fichier JSON tel qu'écrit par le rapport comparé. */
  empreinte: string;
}

/**
 * Comparaison d'une fenêtre à sa référence → vis_ui.comparaison (0010), en
 * ajout seul : identifiant dérivé de l'empreinte du fichier, rejouer ne change
 * rien ; une comparaison refaite (nouvelles preuves) est une nouvelle ligne.
 * Les deux fenêtres doivent être en base, du même sujet et du même client.
 */
export function sqlComparaison(texte: string): ComparaisonSql {
  const c = JSON.parse(texte) as ComparaisonLue;
  const ident = /^[a-z0-9][a-z0-9-]*$/;
  if (c.comparisonFormat !== 1) throw new Error(`format de comparaison ${String(c.comparisonFormat)} inconnu (attendu 1)`);
  for (const [nom, v] of [["subjectId", c.subjectId], ["windowId", c.windowId], ["referenceId", c.referenceId]] as const) {
    if (typeof v !== "string" || !ident.test(v)) throw new Error(`comparaison : ${nom} invalide`);
  }
  if (c.windowId === c.referenceId) throw new Error("comparaison : une fenêtre ne se compare pas à elle-même");
  for (const cote of ["reference", "current"] as const) {
    const p = c.provenance?.[cote];
    if (!p || !Number.isInteger(p.evidenceCount) || p.evidenceCount < 0 || typeof p.digest !== "string" || !p.digest) {
      throw new Error(`comparaison : provenance ${cote} incomplète (evidenceCount, digest)`);
    }
  }
  const verdict = c.unbranded?.total?.verdict;
  if (!VERDICTS.includes(verdict)) throw new Error(`comparaison : verdict du total non marqué inconnu (${String(verdict)})`);
  if (texte.includes(DOLLAR)) throw new Error("Données inattendues : le délimiteur SQL apparaît dans la comparaison.");

  const empreinte = sha256(texte);
  const id = uuidStable(`comparaison:${empreinte}`);
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const fenetre = `${c.subjectId}-${c.windowId}`;
  const reference = `${c.subjectId}-${c.referenceId}`;
  const { reference: pr, current: pc } = c.provenance;
  const sql = `-- Comparaison Visibility · ${fenetre} contre ${reference} · empreinte ${empreinte}
begin;
insert into vis_ui.comparaison (id, client_id, subject_id, window_id, reference_window_id, format, verdict_non_marque,
  preuves_reference, empreinte_reference, preuves_courantes, empreinte_courante, empreinte, donnees)
select '${id}', w.client_id, w.subject_id, w.id, r.id, 1, ${lit(verdict)},
  ${pr.evidenceCount}, ${lit(pr.digest)}, ${pc.evidenceCount}, ${lit(pc.digest)}, '${empreinte}', ${DOLLAR}${texte}${DOLLAR}::jsonb
from vis.window w
join vis.window r on r.id = ${lit(reference)} and r.subject_id = w.subject_id and r.client_id = w.client_id
where w.id = ${lit(fenetre)} and w.subject_id = ${lit(c.subjectId)}
on conflict (id) do nothing;
do $$
begin
  if not exists (select 1 from vis_ui.comparaison where id = '${id}') then
    raise exception 'vis-sync : fenêtres ${fenetre} et ${reference} absentes de la base, ou de sujets différents ; rien n''est appliqué';
  end if;
end $$;
commit;
`;
  return { sql, id, empreinte };
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [subjectId, windowId, exportFile, cacheFile] = process.argv.slice(2);
  const sujet = (id: string) => {
    const dir = listSubjectDirs(defaultSubjectsDir()).find((d) => d.split(/[\\/]/).pop() === id);
    if (!dir) throw new Error(`aucun sujet "${id}"`);
    return loadSubject(dir);
  };
  try {
    if (subjectId === "--jours") {
      // vis-sync.sh : durée de la fenêtre pour l'exportation, refus avant toute lecture d'Elmo.
      const [, id, fen] = process.argv.slice(2);
      if (!id || !fen) throw new Error("usage: tsx src/vis-sync.ts --jours <subjectId> <windowId>");
      process.stdout.write(`${fenetreDeclaree(sujet(id), fen).days}\n`);
      process.exit(0);
    }
    if (subjectId === "--comparaison") {
      if (!windowId) throw new Error("usage: tsx src/vis-sync.ts --comparaison <comparaison.json>");
      const r = sqlComparaison(readFileSync(windowId, "utf8"));
      process.stdout.write(r.sql);
      process.stderr.write(`vis-sync : comparaison ${r.id} (empreinte ${r.empreinte})\n`);
      process.exit(0);
    }
    if (!subjectId || !windowId || !exportFile) throw new Error("usage: tsx src/vis-sync.ts <subjectId> <windowId> <export.json> [redirects-cache.json]");
    const exp = JSON.parse(readFileSync(exportFile, "utf8")) as WindowExport;
    const r = sqlSync(sujet(subjectId), exp, {
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
