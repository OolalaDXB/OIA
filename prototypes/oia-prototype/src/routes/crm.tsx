import { createFileRoute } from "@tanstack/react-router";
import { MoneyShell, MoneyProvider, ContactsMoney } from "@/components/oia/money";
import { moduleHead } from "@/components/oia/visibility";
export const Route = createFileRoute("/crm")({ head: () => moduleHead("CRM OIA", "Contacts de l'espace OIA et liens aux projets et opportunités."), component: () => <MoneyProvider><MoneyShell actif="crm"><ContactsMoney /></MoneyShell></MoneyProvider> });
