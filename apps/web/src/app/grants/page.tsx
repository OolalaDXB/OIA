import { loadConsoleData } from "../../lib/loadData";
import { Console } from "../Console";

/** Grants — same master-detail shell, GRANT-scoped (mandate §5 sub-typing). */
export default function GrantsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <Console data={data} fixedKind="GRANT" active="grants" title="Grants" />;
}
