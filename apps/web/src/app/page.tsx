import { loadConsoleData } from "../lib/loadData";
import { Console } from "./Console";

export default function Page() {
  const data = loadConsoleData();
  if (!data) {
    return (
      <main style={{ padding: 32, fontFamily: "ui-monospace, monospace" }}>
        <h1>No Milestone-0 run output found</h1>
        <p>
          Expected <code>outputs/milestone-0/console.json</code>. Generate it with:
        </p>
        <pre>pnpm --filter @oia/workers run m0:run</pre>
      </main>
    );
  }
  return <Console data={data} />;
}
