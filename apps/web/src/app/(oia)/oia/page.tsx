import { Accueil } from "@/pages/accueil";
import { loadConsoleData } from "../../../lib/loadData";

export const metadata = { title: "Accueil, OIA", description: "OIA : décisions, modules, dépense du mois et activité récente." };

export default function Page() {
  return <Accueil data={loadConsoleData()} />;
}
