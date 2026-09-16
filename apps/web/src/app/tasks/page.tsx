import { loadConsoleData } from "../../lib/loadData";
import { TasksView } from "./TasksView";

/** Tasks (Phase 3). */
export default function TasksPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <TasksView data={data} />;
}
