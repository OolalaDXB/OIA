import { loadConsoleData } from "../../../lib/loadData";
import { MoneyView } from "../money/MoneyView";

/** Kept so existing links still work: the metrics live on the money page now. */
export default function MetricsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <MoneyView data={data} />;
}
