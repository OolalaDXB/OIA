import { loadConsoleData } from "../../lib/loadData";
import { NotesView } from "./NotesView";

/** Notes (Phase 3). */
export default function NotesPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <NotesView data={data} />;
}
