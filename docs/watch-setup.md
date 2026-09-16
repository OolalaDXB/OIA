# Turning the permanent watch on — what only you can do

The code, the schema and the rules are in place and verified. Four steps remain,
and all four need credentials or a dashboard, which is exactly why they are
yours and not mine.

**Nothing changes until step 3.** Until the console has the environment
variables, it keeps running on its bundled snapshot exactly as it does today —
no login screen, no regression. You switch it on when you are ready.

---

## 1. Create your account (2 minutes)

[Supabase dashboard](https://supabase.com/dashboard/project/iywmvyebuikxyvnrcnoy)
→ **Authentication** → **Users** → *Add user* → *Create new user*.

Use your email, set a password, tick **Auto Confirm User**.

There is no public sign-up, on purpose: the only accounts that exist are the
ones you create here.

> Do this **before** step 3, or you will be looking at a login screen with no
> account to use.

## 2. Give the weekly run write access (2 minutes)

The scheduled discovery needs to write to the ledger. In the
[Supabase dashboard](https://supabase.com/dashboard/project/iywmvyebuikxyvnrcnoy/settings/api-keys),
copy the **service role** key — the secret one, never the publishable one.

Then in GitHub → **Settings** → *Secrets and variables* → *Actions* → *New
repository secret*, add:

| Secret | Value |
|---|---|
| `SUPABASE_URL` | `https://iywmvyebuikxyvnrcnoy.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service role key |

Until these exist the weekly run still works and still commits the refreshed
dataset — it just logs a warning and updates no ledger, rather than pretending
to have watched anything.

**The service role key bypasses every row-level security policy.** It belongs in
GitHub secrets and nowhere else: not in the repository, not in Vercel, not in a
message to me.

## 3. Point the console at the database (2 minutes)

Vercel → project **oia** → *Settings* → *Environment Variables*, for Production:

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://iywmvyebuikxyvnrcnoy.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `sb_publishable_6qJ5Qo6BUO8G12DV5SIaXQ___GE0m86` |

Then redeploy. These two are public by design — they ship inside the JavaScript
bundle. They are safe there **because** row-level security refuses to answer
them without a session, which was verified rather than assumed:

```
role anon          → ledger 0 rows, alerts 0, reviews 0, tasks 0
role authenticated → ledger 1 row,  events 1
```

## 4. Move what is in your browser (one click)

After signing in, the banner at the top of the console offers **move N local
item(s) to the database**. It pushes the reviews, tags, notes, tasks and
contacts currently held in that browser, keeping their original timestamps, and
skips anything already there.

Do it from the browser you have actually been using, before clearing anything.

---

## What then happens on its own

Every Monday at 06:00 UTC, and on demand from the Actions tab:

1. the searches you asked for from the console are **claimed** — moved from
   queued to running, so a second run cannot cover them twice;
2. one TED query per project the run covers (what you asked for, else what the
   console requested, else every project with discovery enabled);
3. links you pasted are fetched and ingested, and any project you created in the
   console is written into `registry/projects/` and the registry regenerated;
4. the dataset is rebuilt, and only committed if typecheck, tests and the web
   build pass against it;
5. the run is folded into the ledger — new, changed, disappeared, reappeared —
   and each change is recorded as an event;
6. alerts are raised for what crossed a line, and **never twice for the same
   condition**;
7. every published link is checked and the verdict stamped into the registry;
8. the claimed searches are **closed against the run's real outcome** — done if
   it succeeded, failed if it did not. This step runs even when the job fails,
   because a request left at *running* forever is indistinguishable from one
   still in flight, and the console would keep saying "searching".

Steps 1, 3, 6 and 8 need the two GitHub secrets from step 2. Without them the
run still discovers, still verifies and still commits — it logs a warning and
skips the parts that need the database, rather than failing or pretending.

Between runs the deadline rules keep working without any job at all: they read
the ledger, so "closes in 9 days" is true the day you open the console, not the
day the run happened.

## Running it by hand

```bash
export SUPABASE_URL=https://iywmvyebuikxyvnrcnoy.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=…

pnpm --filter @oia/workers discover:ted           # every discoverable project
pnpm --filter @oia/workers exec tsx src/ted-to-console.ts
pnpm --filter @oia/workers publish:watch -- --dry-run   # show the fold, write nothing
pnpm --filter @oia/workers publish:watch

pnpm --filter @oia/workers requests                     # drain pasted links + project drafts
pnpm --filter @oia/workers requests -- --plan           # claim requested searches, print the slugs
pnpm --filter @oia/workers requests -- --settle=success # close them once the run is done
pnpm --filter @oia/workers check:links                  # verify every published URL
```

`check:links` starts with an egress canary. If our own network is blocked it
says the check did not happen, stamps nothing and exits non-zero — it will not
report other people's working sites as broken because of our proxy.

`--dry-run` prints exactly which rows are new, which changed and which would be
marked as having disappeared, without touching the database. Worth using the
first time.

## One rule worth knowing about disappearance

A run only concludes that an opportunity has vanished if it queried **every**
project that ever surfaced it. Running `--project sillon` cannot declare a
record also discovered for BAWABA as gone — BAWABA's query was never asked, and
silence about a question you did not ask is not evidence.

Manually seeded records are never in scope of an automated run at all, so a TED
run can never bury something you entered by hand.

## What this environment could not verify

The sandbox that built this has no network egress to `supabase.co`, so:

- the schema, the row-level security policies and the append-only property of
  the audit trail were verified **in the database** (role impersonation, a real
  payload round-tripped, an update and a delete on `reviews` both refused);
- the login screen and the gate were verified in a real browser;
- **a live signed-in session was not exercised.** The first sign-in is the first
  real test of that path. If anything misbehaves there, it will be visible
  immediately and is a small fix.
