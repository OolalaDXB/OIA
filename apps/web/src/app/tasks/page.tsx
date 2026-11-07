import { loadConsoleData } from "../../lib/loadData";
import { WorkspaceView } from "../workspace/WorkspaceView";

/** Kept so existing links still land somewhere true: tasks live in the workspace now. */
export default function TasksPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <WorkspaceView data={data} tab="tasks" />;
}
