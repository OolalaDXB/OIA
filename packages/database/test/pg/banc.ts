import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Postgres jetable pour les tests de migrations (mandat v8, règle 2) : un
 * cluster créé dans un dossier temporaire, joignable seulement par socket
 * local, détruit à la fin. Aucune connexion à Supabase.
 */
function binaires(): string | null {
  const bases = ["/usr/lib/postgresql"];
  for (const b of bases) {
    if (!existsSync(b)) continue;
    const versions = readdirSync(b).filter((v) => /^\d+$/.test(v)).sort((x, y) => Number(y) - Number(x));
    for (const v of versions) if (existsSync(join(b, v, "bin", "initdb"))) return join(b, v, "bin");
  }
  const r = spawnSync("sh", ["-c", "dirname $(command -v initdb)"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() ? r.stdout.trim() : null;
}

export const BIN = binaires();
export const postgresDisponible = BIN !== null;

export interface Banc {
  sql(requete: string, opts?: { role?: string; utilisateur?: string }): string;
  fichier(chemin: string): void;
  arreter(): void;
}

export function demarrer(): Banc {
  if (!BIN) throw new Error("Postgres introuvable : installer postgresql (initdb).");
  const racine = process.getuid?.() === 0;
  const dossier = mkdtempSync(join(tmpdir(), "oia-pg-"));
  chmodSync(dossier, 0o777);
  const data = join(dossier, "data");
  const port = String(20000 + Math.floor(Math.random() * 20000));
  const enUtilisateur = (cmd: string, args: string[]) => (racine ? ["runuser", ["-u", "postgres", "--", cmd, ...args]] : [cmd, args]) as [string, string[]];
  const exec = (cmd: string, args: string[], input?: string) => {
    const [c, a] = enUtilisateur(cmd, args);
    return execFileSync(c, a, { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
  };
  exec(join(BIN, "initdb"), ["-D", data, "-U", "postgres", "--auth=trust", "-E", "UTF8", "--no-locale"]);
  exec(join(BIN, "pg_ctl"), ["-D", data, "-o", `-p ${port} -k ${dossier} -c listen_addresses='' -c timezone=UTC`, "-w", "start", "-l", join(dossier, "log")]);
  const psql = (args: string[], input?: string) => exec(join(BIN, "psql"), ["-h", dossier, "-p", port, "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-X", "-q", "-t", "-A", ...args], input);
  return {
    sql(requete, opts = {}) {
      const prefixe = [
        opts.role ? `set role ${opts.role};` : "",
        opts.utilisateur ? `set request.jwt.claim.sub = '${opts.utilisateur}';` : "",
      ].join("");
      return psql([], `${prefixe}\n${requete}`).trim();
    },
    fichier(chemin) {
      // Par l'entrée standard : l'utilisateur postgres n'a pas à lire le dépôt.
      psql([], readFileSync(chemin, "utf8"));
    },
    arreter() {
      try {
        exec(join(BIN, "pg_ctl"), ["-D", data, "-m", "immediate", "stop"]);
      } finally {
        rmSync(dossier, { recursive: true, force: true });
      }
    },
  };
}

/** Exécute une requête et rend l'erreur Postgres (ou null si elle passe). */
export function erreur(b: Banc, requete: string, opts?: { role?: string; utilisateur?: string }): string | null {
  try {
    b.sql(requete, opts);
    return null;
  } catch (e) {
    return String((e as { stderr?: string }).stderr ?? e);
  }
}

export function ecrireTemp(contenu: string): string {
  const d = mkdtempSync(join(tmpdir(), "oia-sql-"));
  chmodSync(d, 0o755);
  const p = join(d, "f.sql");
  writeFileSync(p, contenu);
  chmodSync(p, 0o644);
  return p;
}
