import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/signals")({ beforeLoad: () => { throw redirect({ to: "/money-lookup", statusCode: 301 }); } });
