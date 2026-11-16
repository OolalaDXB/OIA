/**
 * Import final d'Elmo dans la base OIA (mandat v14, bloc B), depuis l'export JSON du
 * bloc A (scripts/elmo-final-export.sh, dossier json/) : TOUTES les réponses d'Elmo
 * entrent dans vis.evidence, en ajout seul, en une transaction.
 *
 *   * collector_name = 'elmo-0.7.7' ; identifiant stable uuidStable("elmo:<run>"), le même
 *     que vis-sync : une preuve déjà synchronisée n'est jamais doublée ni réécrite, et une
 *     empreinte différente fait tout échouer ;
 *   * raw_text = texte extrait par Elmo, tel quel (empreinte identique à la table des
 *     preuves locale) ; réponse sans texte : texte vide, `non_mesuree: true` (0005), et son
 *     jugement par Elmo rangé sous `jev`, jamais au premier niveau ;
 *   * sortie brute complète, requêtes de recherche, usage, coût selon la grille et
 *     estimation d'Elmo dans `structured` ; citations dans l'ordre d'Elmo, avec leur titre ;
 *   * jugements de Jev : « extrait (Jev 1.13) », jamais un fait ;
 *   * réponse hors panel (question sans étiquette oia: ou exclue par measurement.yaml) :
 *     fenêtre de base `<sujet>-<fenêtre>-hors-panel` ; hors de toute fenêtre :
 *     `<sujet>-hors-fenetre`. Les vues v1, qui ne filtrent pas, ne les comptent donc pas
 *     dans la mesure.
 *
 * CLI :
 *   tsx src/elmo-import-final.ts inventory <dossier d'export>   → inventory.{json,md} dans le dossier
 *   tsx src/elmo-import-final.ts sql <dossier d'export> > import.sql
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCostUsd } from "./cost-grid.js";
import { sha256Hex } from "./evidence-store.js";
import { promptFromTags } from "./j0-evidence.js";
import { defaultSubjectsDir, listSubjectDirs, loadSubject } from "./load.js";
import type { SubjectBundle } from "./schema.js";
import { uuidStable } from "./vis-sync.js";

export const COLLECTOR = "elmo-0.7.7";
export const JUGE = "extrait (Jev 1.13)";
const DOLLAR = "$vis_import$";

/** Lignes des tables exportées (forme de json_agg). */
export interface ElmoExport {
  brands: { id: string; name: string }[];
  prompts: { id: string; brand_id: string; value: string; enabled: boolean; tags: string[] | null; created_at: string }[];
  prompt_runs: { id: string; prompt_id: string; model: string; version: string; web_search_enabled: boolean; raw_output: unknown; web_queries: string[] | null; created_at: string; brand_id: string; provider: string }[];
  run_extractions: { run_id: string; text_content: string | null; stamp: string | null }[];
  run_mentions: { run_id: string; brand_mentioned: boolean | null; competitors_mentioned: string[] | null; stamp: string | null; assessments: unknown }[];
  citations: { prompt_run_id: string; url: string; domain: string | null; title: string | null; citation_index: number | null }[];
  usage_events: { brand_id: string; prompt_id: string | null; event_type: string; model: string; estimated_cost_usd: string | number | null; created_at: string }[];
}

export function readElmoExport(dir: string): ElmoExport {
  const t = (n: string) => JSON.parse(readFileSync(join(dir, "json", `${n}.json`), "utf8"));
  return {
    brands: t("brands"), prompts: t("prompts"), prompt_runs: t("prompt_runs"), run_extractions: t("run_extractions"),
    run_mentions: t("run_mentions"), citations: t("citations"), usage_events: t("usage_events"),
  };
}

export interface ImportRow {
  id: string;
  localEvidenceId: string;
  client_id: string;
  site_id: string;
  subject_id: string;
  window_id: string;
  prompt_id: string;
  prompt_version: number;
  prompt_language: string;
  engine: string;
  engine_version: string | null;
  collector_name: string;
  collector_run_id: string;
  received_at: string;
  raw_text: string;
  sha: string;
  structured: Record<string, unknown>;
  citations: { url: string; title?: string | null; domain?: string | null; index?: number | null }[];
  cost_usd: number;
  /** Classement pour l'inventaire. */
  scope: "panel" | "hors-panel" | "hors-fenetre";
  windowLocalId: string | null;
}

/** Secondes, en UTC, comme scripts/j0-export.sh (to_char … "Z"). */
const isoSeconds = (s: string) => new Date(Date.parse(s)).toISOString().replace(/\.\d{3}Z$/, "Z");

/** Recherches lancées, comptées comme scripts/j0-export.sh (web_search_call, tool.execution web_search). */
export function searchItems(raw: unknown): number {
  const o = raw as { output?: unknown; outputs?: unknown } | null;
  const items = Array.isArray(o?.output) ? o!.output : Array.isArray(o?.outputs) ? o!.outputs : [];
  return (items as { type?: string; name?: string }[]).filter((e) => e?.type === "web_search_call" || (e?.type === "tool.execution" && e?.name === "web_search")).length;
}

function windowOf(b: SubjectBundle, at: string): { id: string; excluded: string[] } | null {
  const t = Date.parse(at);
  for (const w of b.measurement.windows) {
    if (!w.start) continue;
    const start = Date.parse(`${w.start}T${w.runTimeUtc ?? "00:00"}:00Z`);
    if (t >= start && t < start + w.days * 86_400_000) return { id: w.id, excluded: w.excludedPromptIds ?? [] };
  }
  return null;
}

export function buildImport(bundles: SubjectBundle[], exp: ElmoExport): ImportRow[] {
  const bySubject = new Map(bundles.map((b) => [b.subject.id, b]));
  const prompts = new Map(exp.prompts.map((p) => [p.id, p]));
  const text = new Map(exp.run_extractions.map((x) => [x.run_id, x]));
  const mention = new Map(exp.run_mentions.map((m) => [m.run_id, m]));
  const cites = new Map<string, ElmoExport["citations"]>();
  for (const c of exp.citations) cites.set(c.prompt_run_id, [...(cites.get(c.prompt_run_id) ?? []), c]);
  const usage = exp.usage_events.filter((u) => u.event_type === "prompt_run");

  return exp.prompt_runs.map((r) => {
    const b = bySubject.get(r.brand_id);
    if (!b) throw new Error(`run ${r.id} : marque « ${r.brand_id} » sans sujet OIA (subjects/<id>/subject.yaml)`);
    const p = prompts.get(r.prompt_id);
    if (!p) throw new Error(`run ${r.id} : question ${r.prompt_id} absente de l'export`);
    const tags = p.tags ?? [];
    const oia = promptFromTags(tags);
    const win = windowOf(b, r.created_at);
    const offPanel = !oia || Boolean(win?.excluded.includes(p.id));
    const scope: ImportRow["scope"] = !win ? "hors-fenetre" : offPanel ? "hors-panel" : "panel";
    const s = b.subject;
    const windowId = !win ? `${s.id}-hors-fenetre` : offPanel ? `${s.id}-${win.id}-hors-panel` : `${s.id}-${win.id}`;
    const lang = oia?.language && /^[a-z]{2}$/.test(oia.language) ? oia.language : tags.map((t) => /^lang:([a-z]{2})$/.exec(t)?.[1]).find(Boolean) ?? s.languages[0]!;
    const x = text.get(r.id);
    const raw = x?.text_content ?? "";
    const m = mention.get(r.id);
    const nonMesuree = raw.length === 0;
    const usageRaw = (r.raw_output as { usage?: unknown } | null)?.usage ?? null;
    const cost = runCostUsd({ provider: r.provider, version: r.version, webSearch: r.web_search_enabled, usage: usageRaw, searchItems: searchItems(r.raw_output) });
    if (!cost) throw new Error(`run ${r.id} : ${r.provider}:${r.version} absent de la grille de prix`);
    // Estimation d'Elmo : l'événement de la même question et du même modèle le plus proche dans le temps (5 min au plus).
    const near = usage
      .filter((u) => u.brand_id === r.brand_id && u.prompt_id === r.prompt_id && u.model === r.model)
      .map((u) => ({ u, d: Math.abs(Date.parse(u.created_at) - Date.parse(r.created_at)) }))
      .filter((x2) => x2.d <= 300_000)
      .sort((a, z) => a.d - z.d)[0];
    const jev = m ? { statut: JUGE, brandMentioned: m.brand_mentioned, competitorsMentioned: m.competitors_mentioned ?? [], assessments: m.assessments ?? null, stamp: m.stamp } : null;
    const seen = new Set<string>();
    const citations = (cites.get(r.id) ?? [])
      .sort((a, z) => (a.citation_index ?? 0) - (z.citation_index ?? 0))
      .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
      .map((c) => ({ url: c.url, title: c.title, domain: c.domain, index: c.citation_index }));
    const structured: Record<string, unknown> = {
      fromElmo: true,
      collector: COLLECTOR,
      localEvidenceId: `elmo:${r.id}`,
      provider: r.provider,
      webSearch: r.web_search_enabled,
      // Jugement de Jev au premier niveau seulement pour une réponse mesurée ; toujours un extrait.
      brandMentioned: nonMesuree ? null : m?.brand_mentioned ?? null,
      competitorsMentioned: nonMesuree ? [] : m?.competitors_mentioned ?? [],
      jugement: JUGE,
      jev,
      usage: usageRaw,
      costFromUsage: cost.fromUsage,
      coutEstimeElmoUsd: near ? Number(near.u.estimated_cost_usd) : null,
      webQueries: r.web_queries ?? [],
      rawOutput: r.raw_output,
      extractionStamp: x?.stamp ?? null,
      elmoPromptId: p.id,
      elmoPromptTags: tags,
      elmoCreatedAt: r.created_at,
      ...(nonMesuree ? { non_mesuree: true } : {}),
      ...(scope !== "panel" ? { hors_panel: scope === "hors-panel", hors_fenetre: scope === "hors-fenetre", questionElmo: p.value } : {}),
      ...(oia ? {} : { langueSupposee: !tags.some((t) => /^lang:[a-z]{2}$/.test(t)) }),
    };
    return {
      id: uuidStable(`elmo:${r.id}`),
      localEvidenceId: `elmo:${r.id}`,
      // Client en base = identifiant du sujet, comme vis-sync (la base de production le porte ainsi).
      client_id: s.id,
      site_id: s.id,
      subject_id: s.id,
      window_id: windowId,
      prompt_id: oia ? oia.id : p.id,
      prompt_version: oia ? oia.version : 1,
      prompt_language: lang,
      engine: r.model,
      engine_version: r.version ?? null,
      collector_name: COLLECTOR,
      collector_run_id: r.id,
      received_at: isoSeconds(r.created_at),
      raw_text: raw,
      sha: sha256Hex(raw),
      structured,
      citations,
      cost_usd: Math.round(cost.usd * 1e6) / 1e6,
      scope,
      windowLocalId: win?.id ?? null,
    };
  });
}

export interface Inventory {
  runs: number;
  bySubject: Record<string, { runs: number; panel: number; horsPanel: number; horsFenetre: number; nonMesurees: number; byWindow: Record<string, number>; byEngine: Record<string, number> }>;
}

export function inventory(rows: ImportRow[]): Inventory {
  const out: Inventory = { runs: rows.length, bySubject: {} };
  for (const r of rows) {
    const s = (out.bySubject[r.subject_id] ??= { runs: 0, panel: 0, horsPanel: 0, horsFenetre: 0, nonMesurees: 0, byWindow: {}, byEngine: {} });
    s.runs++;
    if (r.scope === "panel") s.panel++;
    else if (r.scope === "hors-panel") s.horsPanel++;
    else s.horsFenetre++;
    if (r.structured.non_mesuree) s.nonMesurees++;
    s.byWindow[r.window_id] = (s.byWindow[r.window_id] ?? 0) + 1;
    s.byEngine[r.engine] = (s.byEngine[r.engine] ?? 0) + 1;
  }
  return out;
}

/** SQL d'import, une transaction, ajout seul, rejouable ; échoue sans rien changer sur toute empreinte différente. */
export function importSql(bundles: SubjectBundle[], rows: ImportRow[], exportedFrom: string): string {
  const json = (v: unknown) => {
    const t = JSON.stringify(v);
    if (t.includes(DOLLAR)) throw new Error("Données inattendues : le délimiteur SQL apparaît dans l'export.");
    return `${DOLLAR}${t}${DOLLAR}::jsonb`;
  };
  const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const day = (iso: string) => iso.slice(0, 10);
  const L: string[] = [`-- Import final d'Elmo (${COLLECTOR}) · ${rows.length} réponses · export ${exportedFrom}`, "begin;"];
  for (const b of bundles) {
    const s = b.subject;
    const mine = rows.filter((r) => r.subject_id === s.id);
    if (!mine.length) continue;
    const client = mine[0]!.client_id;
    L.push(
      `insert into vis.client (id, display_name, ownership, status, default_repo_action_mode) values (${lit(client)}, ${lit(s.displayName)}, ${lit(s.ownership)}, 'active', 'lecture') on conflict (id) do nothing;`,
      `insert into vis.site (id, client_id, primary_url, additional_urls, status) select ${lit(s.id)}, ${lit(client)}, ${lit(s.urls.primary)}, ${json(s.urls.additional.map((a) => ({ url: a.url, status: a.status })))}, 'active' on conflict (id) do nothing;`,
      `insert into vis.subject (id, client_id, status) values (${lit(s.id)}, ${lit(client)}, 'active') on conflict (id) do nothing;`,
      `insert into vis.subject_site (subject_id, site_id, client_id) values (${lit(s.id)}, ${lit(s.id)}, ${lit(client)}) on conflict do nothing;`,
    );
    for (const wid of [...new Set(mine.map((r) => r.window_id))].sort()) {
      const sample = mine.find((r) => r.window_id === wid)!;
      const w = sample.windowLocalId ? b.measurement.windows.find((x) => x.id === sample.windowLocalId) : null;
      const days = mine.filter((r) => r.window_id === wid).map((r) => day(r.received_at)).sort();
      const start = w?.start ?? days[0]!;
      const end = w?.end ?? days.at(-1)!;
      const note = sample.scope === "panel" ? null
        : sample.scope === "hors-panel" ? `Réponses d'Elmo aux questions hors panel pendant la fenêtre ${w!.id} (import final, mandat v14) : conservées, jamais mesurées.`
        : "Réponses d'Elmo reçues hors de toute fenêtre de mesure (import final, mandat v14) : conservées, jamais mesurées.";
      L.push(`insert into vis.window (id, subject_id, client_id, kind, panel_version, status, starts_on, ends_on, note) values (${lit(wid)}, ${lit(s.id)}, ${lit(client)}, ${lit(w?.kind ?? "baseline")}, ${w?.panelVersion ?? b.panel.panelVersion}, ${lit(w?.status === "running" ? "running" : "done")}, '${start}', '${end}', ${note ? lit(note) : "null"}) on conflict (id) do update set status = excluded.status where vis.window.status <> 'done' and excluded.status = 'done';`);
    }
  }
  const payload = rows.map(({ scope: _s, windowLocalId: _w, localEvidenceId: _l, ...r }) => r);
  L.push(
    "create temp table _vis_import on commit drop as",
    `select * from jsonb_to_recordset(${json(payload)}) as t(`,
    "  id uuid, client_id text, site_id text, subject_id text, window_id text, prompt_id text, prompt_version int, prompt_language text,",
    "  engine text, engine_version text, collector_name text, collector_run_id text, received_at timestamptz, raw_text text, sha text,",
    "  structured jsonb, citations jsonb, cost_usd numeric);",
    "insert into vis.evidence (id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine,",
    "  engine_version, collector_name, collector_run_id, received_at, raw_text, structured, citations, cost_usd)",
    "select id, client_id, site_id, subject_id, window_id, prompt_id, prompt_version, prompt_language, engine,",
    "  engine_version, collector_name, collector_run_id, received_at, raw_text, structured, citations, cost_usd",
    "from _vis_import on conflict (id) do nothing;",
    "do $$",
    "declare n int;",
    "begin",
    "  select count(*) into n from vis.evidence e join _vis_import x on x.id = e.id",
    "    where encode(e.raw_sha256, 'hex') <> x.sha or encode(e.raw_sha256, 'hex') <> encode(digest(x.raw_text, 'sha256'), 'hex');",
    "  if n > 0 then raise exception 'import Elmo : % preuve(s) en base ne correspondent pas au texte d''Elmo ; rien n''est appliqué', n; end if;",
    "  select count(*) into n from vis.evidence e join _vis_import x on x.id = e.id where e.window_id <> x.window_id;",
    "  if n > 0 then raise exception 'import Elmo : % preuve(s) en base dans une autre fenêtre ; rien n''est appliqué', n; end if;",
    "  select count(*) into n from _vis_import x where not exists (select 1 from vis.evidence e where e.id = x.id);",
    "  if n > 0 then raise exception 'import Elmo : % réponse(s) absente(s) après import ; rien n''est appliqué', n; end if;",
    "end $$;",
    `select 'réponses d''Elmo en base : ' || count(*) from vis.evidence e join _vis_import x on x.id = e.id;`,
    "commit;",
    "",
  );
  return L.join("\n");
}

export function renderInventory(inv: Inventory, counts: string): string {
  const L = [`# Inventaire de l'export final d'Elmo`, "", `Réponses (prompt_runs) : **${inv.runs}**.`, ""];
  for (const [s, v] of Object.entries(inv.bySubject)) {
    L.push(`## ${s}`, "", `${v.runs} réponses : ${v.panel} du panel, ${v.horsPanel} hors panel, ${v.horsFenetre} hors fenêtre ; ${v.nonMesurees} sans texte (non mesurées).`, "");
    L.push("| Fenêtre en base | Réponses |", "|---|---|", ...Object.entries(v.byWindow).map(([w, n]) => `| ${w} | ${n} |`), "");
    L.push("| Moteur | Réponses |", "|---|---|", ...Object.entries(v.byEngine).sort().map(([e, n]) => `| ${e} | ${n} |`), "");
  }
  L.push("## Lignes par table (comptes exacts, counts.tsv)", "", "| Table | Lignes |", "|---|---|");
  for (const l of counts.trim().split("\n")) { const [t, n] = l.split("\t"); L.push(`| ${t} | ${n} |`); }
  return `${L.join("\n")}\n`;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [cmd, dir] = process.argv.slice(2);
  try {
    if (!dir || (cmd !== "inventory" && cmd !== "sql")) throw new Error("usage: tsx src/elmo-import-final.ts inventory|sql <dossier d'export>");
    const bundles = listSubjectDirs(defaultSubjectsDir()).map((d) => loadSubject(d));
    const rows = buildImport(bundles, readElmoExport(dir));
    if (cmd === "inventory") {
      const inv = inventory(rows);
      writeFileSync(join(dir, "inventory.json"), `${JSON.stringify(inv, null, 2)}\n`);
      writeFileSync(join(dir, "inventory.md"), renderInventory(inv, readFileSync(join(dir, "counts.tsv"), "utf8")));
      process.stdout.write(`${join(dir, "inventory.md")}\n`);
    } else {
      process.stdout.write(importSql(bundles, rows, dir.split(/[\\/]/).filter(Boolean).pop()!));
    }
  } catch (err) {
    process.stderr.write(`elmo-import-final : ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }
}
