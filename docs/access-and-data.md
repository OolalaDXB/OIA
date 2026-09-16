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
cover a *custom domain*. The day a domain like `oia.thestudiomt.com` is attached
to this project, that domain is public unless protection is reconfigured. Do not
attach one without revisiting this page.

## Two layers of data, two very different durabilities

### 1. The evidence layer — in the repository

Opportunities, facts, provenance, hashes, gate verdicts: produced by the
workers, committed as `apps/web/src/data/console.json` and `outputs/**`, shipped
inside the build. Durable, versioned, reviewable in a diff. Nothing here is
personal data; everything traces to a public official source.

### 2. The human layer — in your browser, and nowhere else

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

## Why not a server database?

Because a server store needs authentication to be worth anything, and
authentication needs a backend the static console does not have. Building a
half-authenticated store would have been worse than none: it would have implied
a durability the product could not deliver.

What exists instead is the seam. `packages/workspace/src/store.ts` defines a
three-method `WorkspaceStore` interface (`read`, `write`, `keys`) plus a
`durability` flag that the UI reads. The localStorage driver implements it
today; a Supabase driver implements the same three methods the day a login
exists, and **not one hook or component changes** — only the durability banner
stops saying "this browser only".

The database schema for that day already exists: `docs/architecture/schema/0001_init.sql`.
No Supabase project is linked to OIA yet (the account's two projects belong to
myOolala and Sillon).

## What a reviewer should verify

```bash
# The registry says what the system is told to look for
pnpm --filter @oia/registry validate

# The knowledge base says what may be claimed externally
pnpm --filter @oia/knowledge validate

# Everything else
pnpm typecheck && pnpm test && pnpm --filter @oia/web build
```
