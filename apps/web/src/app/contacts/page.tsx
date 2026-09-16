import { loadConsoleData } from "../../lib/loadData";
import { ContactsView } from "./ContactsView";

/** Contacts (Phase 3). */
export default function ContactsPage() {
  const data = loadConsoleData();
  if (!data) return null;
  return <ContactsView data={data} />;
}
