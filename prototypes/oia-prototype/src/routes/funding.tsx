import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/funding")({ beforeLoad: () => { throw redirect({ to: "/money-lookup", statusCode: 301 }); } });
