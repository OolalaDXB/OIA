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

- Never modify Supabase schema or hosted settings; Money Lookup reads existing contract v2 views and calls existing RPCs, while Visibility reads its ten contract v1 views, both with the generated public session client; other modules retain their demonstration sources.
- Share Shyrka conversation and journal through a root React provider, hydrating validated versioned browser storage in an effect before enabling writes; this keeps page and panel consistent across reloads without remote services.
- Keep shared navigation in the OIA Shell and personal placeholders in a parameterized leaf route; this makes every module reachable without duplicating page structure.

- Keep Visibility pages under an Outlet layout and reuse VisibilityShell for tabs and breadcrumbs, including legacy site and onboarding URLs; this preserves existing links.
- Render presence-only Shyrka as a root session-controlled modal with local simulated microphone and pause state; this restores the previous page or panel without requesting hardware access.
- Render Shyrka with a browser-initialized Three.js particle shader and the original bundled synthetic depth map; continuous particle morphing preserves sphere-to-face transitions across page, panel and fullscreen without hardware access.

- Keep mobile navigation collapsible and Shyrka columns selectable below the wide desktop breakpoint; this keeps the composer and journal reachable without long scrolling.
- Use Radix tabs for Shyrka views and a SheetTrigger for its panel; native focus restoration and arrow-key navigation keep mobile and keyboard interactions consistent.
- Load optional Visibility JSON only for signed-out demonstrations; a signed-in session always uses the real Visibility adapter and never falls back to fictional values.
- Centralize module data access in `src/lib/donnees`; Money Lookup and Visibility typed real adapters own session-scoped paginated reads, while other adapters preserve demo sources.
- Use typed loading, empty, error, access and ready states through `SourcesProvider` and `EtatEcran`; default synchronous demo adapters avoid loading flashes, while source failures and render failures have local retry states.
- Route Visibility and Money Lookup tabs through one `$onglet` leaf each with a view map, and keep filters, Money labels and Shyrka context in root or layout providers; this keeps many tabs consistent without duplicating shells.
- Centralize measurement display rules (in progress, non measurable, intervals, significance) in `components/oia/mesure.tsx`; every view inherits the same rules.
- Use shared semantic chart tokens and shared chart/bar components for consistent series colors and accessible hover details.
- Read Visibility engine costs from the real contract views when signed in, otherwise from the demo source; the read-only settings screen must never call suppliers or change selection.
- Validate AI Money matches against the literal demo catalog before returning them; unknown or duplicate opportunity IDs must never reach the UI.
- Store Money analytics only in versioned browser local storage through the existing interaction handlers, with no injected collector or remote transport and never free-form input or personal data.
- Keep real Money and Visibility screens behind their shared access states with per-query loading/error handling and no demo fallback; public shells expose inline sign-in and contain no protected loader.
- Cache Money access for the signed-in session, never unmount screens for a background role fetch, and exclude visit tracking from mutation invalidation; this prevents observer remounts from restarting successful reads.
- Reuse the integration's single Supabase instance through `src/lib/supabase.ts` and keep one root auth listener; sign-out cancels and clears private queries before navigating to the public auth route.
- Keep password recovery on public routes using the existing Supabase client and root recovery event; recovery updates send only the new password and never change hosted authentication settings.
- Pass the original backup JSON unchanged to the import RPC; local preview only counts the six verified workspace keys and cancellation always requires a fresh preview before explicit confirmation.
- Parse cancellation risks from the existing modified-elements array and unverifiable count; reset confirmation when the target changes or the RPC requests a fresh preview.
