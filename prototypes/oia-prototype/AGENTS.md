<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

- Keep the prototype free of Cloud and Supabase changes, with demonstration data in `src/data/`; only the user-requested AI Gateway comparison runs in a server function, without persistence or web search.
- Share Shyrka conversation and journal through a root React provider, hydrating validated versioned browser storage in an effect before enabling writes; this keeps page and panel consistent across reloads without remote services.
- Keep shared navigation in the OIA Shell and personal placeholders in a parameterized leaf route; this makes every module reachable without duplicating page structure.

- Keep Visibility pages under an Outlet layout and reuse VisibilityShell for tabs and breadcrumbs, including legacy site and onboarding URLs; this preserves existing links.
- Render presence-only Shyrka as a root session-controlled modal with local simulated microphone and pause state; this restores the previous page or panel without requesting hardware access.
- Render Shyrka with a browser-initialized Three.js particle shader and a bundled synthetic depth-map asset; shared mode and pause props drive the same visual in page, panel and fullscreen without server or hardware access.

- Keep mobile navigation collapsible and Shyrka columns selectable below the wide desktop breakpoint; this keeps the composer and journal reachable without long scrolling.
- Use Radix tabs for Shyrka views and a SheetTrigger for its panel; native focus restoration and arrow-key navigation keep mobile and keyboard interactions consistent.
- Load optional real Visibility data from public/data/visibility.json via a root provider validated against the demo structure; invalid or missing files fall back to fictional demo data and only real data hides the "Exemple fictif" label.
- Centralize all demo reads and future real-source slots in `src/lib/donnees/{accueil,money,visibility,shyrka}.ts`; screens consume root-provider hooks, and real OIA adapters remain null until their contracts arrive, preserving the current UI and optional Visibility file fallback.
- Use typed loading, empty, error and ready states through `SourcesProvider` and `EtatEcran`; default synchronous demo adapters avoid loading flashes, while source failures and render failures have local retry states.
- Route Visibility and Money Lookup tabs through one `$onglet` leaf each with a view map, and keep filters, Money labels and Shyrka context in root or layout providers; this keeps many tabs consistent without duplicating shells.
- Centralize measurement display rules (in progress, non measurable, intervals, significance) in `components/oia/mesure.tsx`; every view inherits the same rules.
- Use shared semantic chart tokens and shared chart/bar components for consistent series colors and accessible hover details.
- Validate AI Money matches against the literal demo catalog before returning them; unknown or duplicate opportunity IDs must never reach the UI.
- Store Money analytics only in versioned browser local storage through the existing interaction handlers, with no injected collector or remote transport and never free-form input or personal data.
