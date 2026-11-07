import { loadConsoleData } from "../../../lib/loadData";
import { WorkspaceView } from "./WorkspaceView";

/** Workspace — tasks, notes and people in one place. */
export default function WorkspacePage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <WorkspaceView data={data} />;
}
