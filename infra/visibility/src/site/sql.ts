/**
 * Lignes client, site et sujet d'un nouveau site dans la base OIA (schéma `vis`), en AJOUT
 * SEUL : `on conflict do nothing`, même forme que src/vis-sync.ts. Le script est écrit dans
 * `proposition/base.sql` ; il n'est appliqué qu'avec `--base`, geste de Mickaël.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Subject } from "../schema.js";

const DOLLAR = "$vis_site$";
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const json = (v: unknown) => {
  const t = JSON.stringify(v);
  if (t.includes(DOLLAR)) throw new Error("Données inattendues : le délimiteur SQL apparaît dans le sujet.");
  return `${DOLLAR}${t}${DOLLAR}::jsonb`;
};

export interface BaseRowsInput {
  subject: Subject;
  clientId: string;
  clientName: string;
}

export function sqlBaseRows(i: BaseRowsInput): string {
  const s = i.subject;
  const site = { primary_url: s.urls.primary, additional_urls: s.urls.additional.map((a) => ({ url: a.url, status: a.status })) };
  return `-- Ajout d'un site · client ${i.clientId} · sujet ${s.id} (draft) · ajout seul, rien n'est écrasé
begin;
insert into vis.client (id, display_name, ownership, status, default_repo_action_mode)
values (${lit(i.clientId)}, ${lit(i.clientName)}, ${lit(s.ownership)}, 'active', 'lecture')
on conflict (id) do nothing;
insert into vis.site (id, client_id, primary_url, additional_urls, status)
select ${lit(s.id)}, ${lit(i.clientId)}, x ->> 'primary_url', x -> 'additional_urls', 'active' from (select ${json(site)} as x) t
on conflict (id) do nothing;
insert into vis.subject (id, client_id, status) values (${lit(s.id)}, ${lit(i.clientId)}, 'draft')
on conflict (id) do nothing;
insert into vis.subject_site (subject_id, site_id, client_id) values (${lit(s.id)}, ${lit(s.id)}, ${lit(i.clientId)})
on conflict do nothing;
do $$
declare n int;
begin
  select count(*) into n from vis.subject where id = ${lit(s.id)} and client_id <> ${lit(i.clientId)};
  if n > 0 then
    raise exception 'site add : le sujet % existe déjà chez un autre client ; rien n''est appliqué', ${lit(s.id)};
  end if;
end $$;
commit;
`;
}

/**
 * Application du script (`--base` seulement) : même connexion que scripts/vis-sync.sh
 * (mot de passe lu dans ~/.oia/supabase.env, jamais affiché) ; `OIA_VIS_SYNC_SQL=<commande>`
 * remplace psql, comme pour vis-sync.
 */
export function applyBaseSql(sql: string, env: Record<string, string | undefined> = process.env): Promise<void> {
  const input = `set client_min_messages = warning;\n${sql}`;
  let cmd: string;
  let args: string[];
  let childEnv: Record<string, string | undefined> = { ...env };
  if (env.OIA_VIS_SYNC_SQL) {
    cmd = "sh";
    args = ["-c", env.OIA_VIS_SYNC_SQL];
  } else {
    const file = join(homedir(), ".oia", "supabase.env");
    const line = existsSync(file) ? readFileSync(file, "utf8").split("\n").find((l) => l.startsWith("OIA_DB_PASSWORD=")) : undefined;
    const password = line?.slice("OIA_DB_PASSWORD=".length).replace(/^['"]|['"]$/g, "");
    if (!password) return Promise.reject(new Error("mot de passe de la base OIA absent (~/.oia/supabase.env)"));
    cmd = "psql";
    args = ["-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-h", env.OIA_DB_HOST ?? "aws-0-eu-central-1.pooler.supabase.com", "-p", "5432", "-U", "postgres.iywmvyebuikxyvnrcnoy", "-d", "postgres"];
    childEnv = { ...childEnv, PGPASSWORD: password, PGSSLMODE: "require" };
  }
  return new Promise((resolvePromise, reject) => {
    const child = spawn(cmd, args, { env: childEnv as NodeJS.ProcessEnv, stdio: ["pipe", "inherit", "inherit"] });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolvePromise() : reject(new Error(`application du script SQL en échec (code ${code})`))));
    child.stdin.end(input);
  });
}
