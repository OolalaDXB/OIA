import { loadConsoleData } from "../../lib/loadData";
import { DigestView } from "./DigestView";

/** Today — the Phase 4 digest over the real run output. */
export default function DigestPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <DigestView data={data} />;
}
