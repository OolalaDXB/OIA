import { createFileRoute, Outlet, retainSearchParams } from "@tanstack/react-router";
export const Route = createFileRoute("/visibility")({
  validateSearch: (search: Record<string, unknown>): { site?: string; reglage?: string } => ({
    ...(typeof search["site"] === "string" && search["site"] ? { site: search["site"] } : {}),
    ...(typeof search["reglage"] === "string" && search["reglage"] ? { reglage: search["reglage"] } : {}),
  }),
  search: { middlewares: [retainSearchParams(["site"])] },
  component: Outlet,
});
