import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { realpathSync } from "node:fs";
import { horsPerimetre, interdits, type Mission } from "./missions.js";

/**
 * Vérification d'une mission (mandat v10, D2 « Vérification », D5).
 *
 * Ne croit pas le rapport de l'auteur : relit le diff dans le worktree,
 * refuse tout fichier hors périmètre ou sensible, calcule l'empreinte du diff
 * présenté, et réexécute les commandes autorisées — mot pour mot, rien
 * d'autre — dans un bac à sable macOS (sandbox-exec) :
 * - écriture limitée au worktree et aux dossiers temporaires ;
 * - lecture refusée de ~/.oia (clés), du volume Shyrka-corpus, de ~/.ssh,
 *   du Trousseau ;
 * - réseau sortant et entrant refusés ;
 * - environnement expurgé de toute variable ressemblant à un secret.
 */

export interface RapportVerification {
  fichiers: string[];
  horsPerimetre: string[];
  interdits: string[];
  empreinteDiff: string;
  lignesDiff: number;
  commandes: { commande: string; code: number; duree_ms: number; sortie: string }[];
  refusees: string[];
  verdict: "conforme" | "refuse" | "echec_tests";
}

export function profilBacASable(worktree: string): string {
  const h = homedir();
  const q = (p: string) => JSON.stringify(p);
  return [
    "(version 1)",
    "(allow default)",
    "(deny network-outbound (remote ip))",
    "(deny network-inbound)",
    "(deny file-write*)",
    `(allow file-write* (subpath ${q(worktree)}) (subpath "/private/var/folders") (subpath "/private/tmp") (literal "/dev/null") (literal "/dev/tty"))`,
    `(deny file-read* (subpath ${q(`${h}/.oia`)}) (subpath "/Volumes/Shyrka-corpus") (subpath ${q(`${h}/.ssh`)}) (subpath ${q(`${h}/Library/Keychains`)}) (subpath ${q(`${h}/.config/gh`)}))`,
  ].join("");
}

const SECRET = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|AUTH|COOKIE|SESSION)/i;
export function envExpurge(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) if (!SECRET.test(k)) out[k] = v;
  return { ...out, CI: "1", NO_COLOR: "1" };
}

export function diffDepuis(worktree: string, base: string): { fichiers: string[]; diff: string } {
  const git = (...a: string[]) => execFileSync("git", ["-C", worktree, ...a], { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  const nonSuivis = git("ls-files", "--others", "--exclude-standard").split("\n").filter(Boolean);
  const fichiers = [...new Set([...git("diff", "--name-only", base).split("\n").filter(Boolean), ...nonSuivis])].sort();
  return { fichiers, diff: git("diff", "--binary", base) + nonSuivis.map((f) => `\n?? ${f}`).join("") };
}

export function verifier(m: Mission, worktree: string, opts: { executer?: boolean; delaiMs?: number } = {}): RapportVerification {
  const wt = realpathSync(worktree);
  const { fichiers, diff } = diffDepuis(wt, m.shaBase);
  const hors = horsPerimetre(fichiers, m.perimetre);
  const sensibles = interdits(fichiers);
  const empreinteDiff = createHash("sha256").update(diff).digest("hex");
  const rapport: RapportVerification = { fichiers, horsPerimetre: hors, interdits: sensibles, empreinteDiff, lignesDiff: diff.split("\n").length, commandes: [], refusees: [], verdict: "conforme" };
  if (hors.length || sensibles.length || fichiers.length === 0) {
    rapport.verdict = "refuse";
    return rapport;
  }
  if (opts.executer === false) return rapport;
  const profil = profilBacASable(wt);
  for (const c of m.perimetre.commandes) {
    const t0 = Date.now();
    const r = spawnSync("sandbox-exec", ["-p", profil, ...c], { cwd: wt, env: envExpurge(), encoding: "utf8", timeout: opts.delaiMs ?? 10 * 60_000, maxBuffer: 20 * 1024 * 1024 });
    const sortie = `${r.stdout ?? ""}${r.stderr ?? ""}`;
    rapport.commandes.push({ commande: c.join(" "), code: r.status ?? -1, duree_ms: Date.now() - t0, sortie: sortie.split("\n").filter((l) => /Tests|Test Files|✓|×|FAIL|error TS|passed|failed/.test(l)).slice(-15).join("\n") });
    if (r.status !== 0) rapport.verdict = "echec_tests";
  }
  return rapport;
}
