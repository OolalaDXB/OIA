import { createFileRoute } from "@tanstack/react-router";
import { MoneyShell, Aujourdhui } from "@/components/oia/money";
import { moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/money-lookup/")({ head: () => moduleHead("Money Lookup", "Ce qui ferme bientôt, ce qui est en retard, ce qui attend un tri et les alertes de veille."), component: () => <MoneyShell actif="aujourdhui"><Aujourdhui /></MoneyShell> });
