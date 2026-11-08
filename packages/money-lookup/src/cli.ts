import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import type { ConsoleData } from "@oia/ingestion/console";
import { PROJECT_REGISTRY, SOURCE_REGISTRY } from "@oia/registry";
import { sqlAnnulation, sqlChargement } from "./chargeur.js";
import { sqlProjets } from "./projets.js";

/**
 * pnpm --filter @oia/money-lookup charger -- --source <console.json> [--sortie <fichier.sql>] [--base <url postgres>]
 * pnpm --filter @oia/money-lookup charger -- --annuler <lot> --base <url postgres>
 * pnpm --filter @oia/money-lookup charger -- --projets [--sortie <fichier.sql>] [--base <url postgres>]
 *   (projets du registre vers oia_projet ; exige la migration 0008)
 *
 * Sans --base, le script SQL est seulement écrit. Une base Supabase est refusée
 * sans OIA_CHARGEMENT_SUPABASE=oui : son exécution est réservée à Mickaël.
 */
const args = process.argv.slice(2).filter((a) => a !== "--");
const val = (n: string) => {
  const i = args.indexOf(n);
  return i >= 0 ? args[i + 1] : undefined;
};

export function baseAutorisee(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return !/supabase\.(co|com)/i.test(url) || env.OIA_CHARGEMENT_SUPABASE === "oui";
}

function executer(url: string, sql: string): string {
  if (!baseAutorisee(url)) throw new Error("Base Supabase refusée : son chargement est réservé à Mickaël (OIA_CHARGEMENT_SUPABASE=oui).");
  return execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A"], { input: sql, encoding: "utf8" });
}

function main(): void {
  const base = val("--base");
  const lot = val("--annuler");
  if (lot) {
    if (!base) throw new Error("--annuler exige --base.");
    console.log(executer(base, sqlAnnulation(lot)));
    return;
  }
  if (args.includes("--projets")) {
    const r = sqlProjets(PROJECT_REGISTRY.projects, { sources: SOURCE_REGISTRY });
    const sortie = val("--sortie");
    if (sortie) writeFileSync(sortie, r.sql);
    if (base) executer(base, r.sql);
    console.error(`${r.lignes} projet(s) du registre${sortie ? ` · script : ${sortie}` : ""}${base ? " · chargé" : ""}`);
    if (!sortie && !base) process.stdout.write(r.sql);
    return;
  }
  const source = val("--source") ?? "apps/web/src/data/console.json";
  const data = JSON.parse(readFileSync(source, "utf8")) as ConsoleData;
  const r = sqlChargement(data, { source });
  const sortie = val("--sortie");
  if (sortie) writeFileSync(sortie, r.sql);
  if (base) executer(base, r.sql);
  console.error(`${r.lignes} opportunités · lot ${r.lot}${sortie ? ` · script : ${sortie}` : ""}${base ? " · chargé" : ""}`);
  if (!sortie && !base) process.stdout.write(r.sql);
}

if (process.argv[1]?.endsWith("cli.ts")) {
  try {
    main();
  } catch (e) {
    console.error(`! ${(e as Error).message}`);
    process.exitCode = 1;
  }
}
