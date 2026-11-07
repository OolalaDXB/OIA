import { loadConsoleData } from "../../lib/loadData";
import { Console } from "./Console";

/** Merged dashboard — all opportunity kinds, transverse filters (mandate §5). */
export default function Page() {
  const data = loadConsoleData();
  if (!data) {
    return (
      <main style={{ padding: 32, fontFamily: "ui-monospace, monospace" }}>
        <h1>No run output found</h1>
        <p>
          Generate <code>apps/web/src/data/console.json</code> with:
        </p>
        <pre>pnpm --filter @oia/workers exec tsx src/ted-to-console.ts</pre>
      </main>
    );
  }
  return <Console data={data} active="opportunities" title={{ fr: "Opportunités", en: "Opportunities" }} />;
}
