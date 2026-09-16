# Access and data — where everything lives, and who can see it

Checked against the live configuration on 2026-09-16.

## The console is not public

| Layer | State |
|---|---|
| Vercel project `oia` (team *Mickael's projects*) | **Vercel Authentication ON**, `all_except_custom_domains` |
| Password protection | off (not needed while SSO is on) |
| Trusted IPs | off |
| Domains | `oia-khaki.vercel.app`, `oia-*.vercel.app` — **no custom domain** |

Every deployment URL the project has is a `*.vercel.app` URL, so Vercel
Authentication covers all of them: reaching the console requires signing in with
a Vercel account that has access to the team. The security debt raised in the
Phase 1 report — *"the console now carries TheStudio profiles and internal
suggestions, put protection back"* — is therefore **closed**.

**One thing to remember:** Vercel Authentication with this setting does not
cover a *custom domain*. The day a domain like `oia.thestudio.mt` is attached
to this project, that domain is public unless protection is reconfigured. Do not
attach one without revisiting this page.

## Two layers of data, two very different durabilities

### 1. The evidence layer — in the repository

Opportunities, facts, provenance, hashes, gate verdicts: produced by the
workers, committed as `apps/web/src/data/console.json` and `outputs/**`, shipped
inside the build. Durable, versioned, reviewable in a diff. Nothing here is
personal data; everything traces to a public official source.

### 2. The human layer — in the watch database once it is switched on

**This changed on 2026-09-16.** Review decisions, project tags, notes, tasks and
contacts now live in Postgres (Supabase project `iywmvyebuikxyvnrcnoy`,
eu-central-1) as soon as the console carries `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. See [`watch-setup.md`](watch-setup.md) for the
four steps that switch it on.

Three properties are enforced by the database rather than by the UI:

- **Nothing answers the public key.** The console ships its key in a public
  bundle, so row-level security refuses every table without an authenticated
  session. Verified by impersonating the roles: `anon` sees 0 rows everywhere,
  `authenticated` sees the ledger.
- **The audit trail is append-only.** `reviews` has an insert policy and a select
  policy, and no update or delete policy. Verified: an authenticated session
  could add a decision and could neither rewrite nor remove one. An
  append-only-ness that lives in client code is not append-only.
- **The console can ask for work, not declare it done.** `requests` admits an
  insert only at `status = 'QUEUED'`, and has no update policy at all — moving a
  request to RUNNING, DONE or FAILED requires the service role, which exists
  only in GitHub secrets. That is what makes "a search is never reported as run
  unless it ran" a property of the schema rather than a promise in the worker.

The full applied schema, transcribed from the live catalog, is in
[`architecture/schema/0002_watch_and_workspace.sql`](architecture/schema/0002_watch_and_workspace.sql).

### What the worker writes, and with which key

The weekly run uses the **service role** key, which bypasses RLS entirely. It is
the only credential that can write the ledger, raise alerts, apply a project
draft or resolve a request — and it belongs in GitHub secrets and nowhere else:
not in the repository, not in Vercel, not in a message to me. The console never
sees it and does not need it.

### The previous state — in your browser, and nowhere else

Review decisions and their audit trail, project tags, notes, tasks, contacts,
saved views. Keys: `oia.audit.v1`, `oia.tags.v1`, `oia.notes.v1`,
`oia.tasks.v1`, `oia.contacts.v1`, `oia.views.v1`.

This is `localStorage`. It means, precisely:

- it never leaves the browser — not to Vercel, not to a server, not to Claude;
- it is **not** shared between your laptop and your phone;
- clearing site data, or a browser "clean-up" tool, **deletes it**;
- a second person opening the console sees none of your decisions.

The console says so on every screen rather than letting you discover it the hard
way, and gives you two buttons: **backup** (one JSON file with every key) and
**restore**.

**Back up before anything you would hate to redo.** On restore, the audit log is
*merged* rather than replaced — restoring an older file never erases decisions
taken since — while tags, notes, tasks and contacts are replaced wholesale.

## Why a server database, in the end

Because a permanent watch cannot be built on a snapshot. Every run replaced the
dataset, so the system had no way to tell a new call from one it had already
seen ten times — and there is no alerting without that distinction. The ledger
is that memory, and once it exists the human layer belongs next to it: the alert
rules need to know what you already triaged in order to decide what is worth
telling you.

The seam that made the move cheap is still there. `packages/workspace/src/store.ts`
defines the localStorage driver behind a three-method interface; the console now
picks the Postgres path when it is configured and falls back to that driver when
it is not, with the same hooks either way.

Schema: `docs/architecture/schema/0002_watch_and_workspace.sql` (applied).
`0001_init.sql` remains a design document for the Milestone-1 qualifier and is
deliberately **not** applied — nothing writes to it, and a dead schema is the
same lie as a dead feature.

## What a reviewer should verify

```bash
# The registry says what the system is told to look for
pnpm --filter @oia/registry validate

# The knowledge base says what may be claimed externally
pnpm --filter @oia/knowledge validate

# Everything else
pnpm typecheck && pnpm test && pnpm --filter @oia/web build
```
