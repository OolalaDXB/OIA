import { loadConsoleData } from "../../lib/loadData";
import { Console } from "../Console";

/** Tenders / RFP — same shell, TENDER_RFP-scoped (TED notices live here). */
export default function TendersPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <Console data={data} fixedKind="TENDER_RFP" active="tenders" title="Tenders / RFP" />;
}
