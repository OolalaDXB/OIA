import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/seo-command")({ beforeLoad: () => { throw redirect({ to: "/visibility/$onglet", params: { onglet: "seo-command" }, statusCode: 301 }); } });
