import { loadConsoleData } from "../../../lib/loadData";
import { MoneyView } from "./MoneyView";

/** Money — what is in play per project, and what blocks it. */
export default function MoneyPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <MoneyView data={data} />;
}
