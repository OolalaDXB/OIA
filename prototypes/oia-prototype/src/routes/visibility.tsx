import { createFileRoute, Outlet, retainSearchParams } from "@tanstack/react-router";
export const Route = createFileRoute("/visibility")({
  validateSearch: (search: Record<string, unknown>): { site?: string } => ({ ...(typeof search["site"] === "string" && search["site"] ? { site: search["site"] } : {}) }),
  search: { middlewares: [retainSearchParams(["site"])] },
  component: Outlet,
});
