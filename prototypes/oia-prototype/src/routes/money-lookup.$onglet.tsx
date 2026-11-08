import { createFileRoute, notFound } from "@tanstack/react-router";
import { MoneyShell, Liste, Montants, Signals, ongletsMoney, RepriseMoney, ContactsMoney, NotesTachesMoney, ProjetsMoney, DemandesMoney, JournalMoney, useMoney } from "@/components/oia/money";
import { moduleHead } from "@/components/oia/visibility";

const vues: Record<string, () => React.ReactNode> = {
  toutes: () => <Liste />, financements: () => <Liste type="Financement" />, "appels-offres": () => <Liste type="Appel d'offres" />,
  investisseurs: () => <Liste type="Investisseur" />, signals: () => <Signals />, montants: () => <Montants />,
  reprise: () => <RepriseMoney />, crm: () => <ContactsMoney />, "notes-taches": () => <NotesTachesMoney />, projets: () => <PageProjets />, demandes: () => <DemandesMoney />, journal: () => <JournalMoney />,
};
export const Route = createFileRoute("/money-lookup/$onglet")({
  beforeLoad: ({ params }) => { if (!(params.onglet in vues)) throw notFound(); },
  head: ({ params }) => { const t = ongletsMoney.find((o) => o.id === params.onglet)?.label ?? "Money Lookup"; return moduleHead(`${t}, Money Lookup`, `${t} : suivi des opportunités de l'espace OIA.`); },
  component: Onglet,
});
function Onglet() { const { onglet } = Route.useParams(); const V = vues[onglet]; if (!V) return null; return <MoneyShell actif={onglet}><V /></MoneyShell>; }
function PageProjets() { const { ouvrir } = useMoney(); return <ProjetsMoney open={ouvrir} />; }
