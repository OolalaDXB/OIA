import { createFileRoute, Outlet } from "@tanstack/react-router";
import { MoneyProvider } from "@/components/oia/money";
export const Route = createFileRoute("/money-lookup")({ component: () => <MoneyProvider><Outlet /></MoneyProvider> });
