import type { ProjectRegistry } from "./schema";
import raw from "./snapshot.json";

/**
 * The registry as a plain value — safe in the browser, no fs, no yaml.
 * Generated from `registry/projects/*.yaml` by `pnpm --filter @oia/registry
 * generate`; a drift test keeps the two honest. Node-side callers that want the
 * live YAML (a worker mid-edit, the validator) use `./load` instead.
 */
export const PROJECT_REGISTRY = raw as unknown as ProjectRegistry;
