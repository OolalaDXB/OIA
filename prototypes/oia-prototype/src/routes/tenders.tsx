import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/tenders")({ beforeLoad: () => { throw redirect({ to: "/money-lookup", statusCode: 301 }); } });
