import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Walk up from cwd to find the workspace root (contains pnpm-workspace.yaml). */
export function repoRoot(start: string = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

/** Resolve a path: absolute as-is, otherwise relative to the repo root. */
export function fromRoot(p: string): string {
  return resolve(p) === p ? p : resolve(repoRoot(), p);
}
