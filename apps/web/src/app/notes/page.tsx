import { loadConsoleData } from "../../lib/loadData";
import { WorkspaceView } from "../workspace/WorkspaceView";

/** Kept so existing links still work: notes live in the workspace now. */
export default function NotesPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <WorkspaceView data={data} tab="notes" />;
}
