import { createFileRoute, redirect } from "@tanstack/react-router";
export const Route = createFileRoute("/ventures")({ beforeLoad: () => { throw redirect({ to: "/portefeuille", statusCode: 301 }); } });
