import { loadConsoleData } from "../../lib/loadData";
import { MetricsView } from "./MetricsView";

/** Metrics — counts over the run output and the human layer. */
export default function MetricsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <MetricsView data={data} />;
}
