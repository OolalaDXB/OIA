import { loadConsoleData } from "../../../lib/loadData";
import { Console } from "../Console";

/** Kept so existing links still work: kinds are a filter inside Opportunities now. */
export default function Page() {
  const data = loadConsoleData();
  if (!data) return null;
  return <Console data={data} fixedKind="EQUITY" active="opportunities" title={{ fr: "Investisseurs", en: "Investors" }} />;
}
