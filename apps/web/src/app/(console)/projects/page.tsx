import { loadConsoleData } from "../../../lib/loadData";
import { ProjectsView } from "./ProjectsView";

/** Projects (Phase 2) — TheStudio profiles + their tagged/suggested opportunities. */
export default function ProjectsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <ProjectsView data={data} />;
}
