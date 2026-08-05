import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ConsoleData } from "@oia/ingestion/console";

/**
 * Reads the real Milestone-0 run output. No production Supabase: the console is a
 * validation harness that renders outputs/milestone-0/console.json directly.
 */
const CANDIDATES = [
  resolve(process.cwd(), "..", "..", "outputs", "milestone-0", "console.json"),
  resolve(process.cwd(), "outputs", "milestone-0", "console.json"),
];

export function loadConsoleData(): ConsoleData | null {
  for (const p of CANDIDATES) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, "utf8")) as ConsoleData;
    }
  }
  return null;
}
