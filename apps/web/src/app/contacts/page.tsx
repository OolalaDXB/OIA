import { loadConsoleData } from "../../lib/loadData";
import { WorkspaceView } from "../workspace/WorkspaceView";

/** Kept so existing links still work: people live in the workspace now. */
export default function ContactsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <WorkspaceView data={data} tab="contacts" />;
}
