import { loadConsoleData } from "../../lib/loadData";
import { Console } from "../Console";

/**
 * Investors — distinct kind with its OWN future pipeline (relational data,
 * matching + outreach + CRM), never forced through the tender pipeline
 * (mandate §5). The shell is shared; the dedicated workflow arrives with its
 * connector. Records classified VC_INVESTOR (e.g. investment programmes)
 * already appear here.
 */
export default function InvestorsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <Console data={data} fixedKind="VC_INVESTOR" active="investors" title="Investors" />;
}
