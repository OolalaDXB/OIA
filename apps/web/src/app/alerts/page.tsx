import { loadConsoleData } from "../../lib/loadData";
import { DigestView } from "../digest/DigestView";

/** Kept so existing links still work: alerts are part of Today now. */
export default function AlertsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <DigestView data={data} />;
}
