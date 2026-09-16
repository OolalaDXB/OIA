# `registry/` — who OIA works for

One YAML file per project in `projects/`. **This directory is the source of
truth.** Everything downstream — the suggestion engine, the discovery workers,
every console surface — reads it and nothing else.

## Add a project (the whole procedure)

1. Copy an existing file, e.g. `projects/sillon.yaml` → `projects/newthing.yaml`.
   The file name **must** equal the `slug`.
2. Fill it in. The fields that matter:

   | field | what it does |
   |---|---|
   | `slug`, `name`, `kind`, `status` | identity and lifecycle |
   | `oneLiner`, `url` | what the console shows |
   | `sectors`, `keywords`, `geographies`, `exclusions` | **the matching signals** — what makes an opportunity get suggested for this project |
   | `legalEntities` | which entity would apply (entity doctrine) |
   | `discovery` | whether automated discovery runs, and with which CPV codes / query terms / buyer countries |
   | `profileReview` | `DRAFT` (a working hypothesis, must say `derivedFrom`) or `CONFIRMED_BY_OWNER` (must carry `confirmedAt`) |

3. Regenerate the snapshot the browser bundle reads, and check it:

   ```bash
   pnpm --filter @oia/registry validate   # honesty rules
   pnpm --filter @oia/registry generate   # → packages/registry/src/snapshot.json
   pnpm test                              # the drift test fails if you skip generate
   ```

4. Commit both the YAML file and the regenerated snapshot.

No code changes. No new package. A project added here is immediately visible in
the console, in the digest, in the tagging dropdowns, and — if
`discovery.enabled` — in the next discovery run.

## Why the snapshot exists

The console is a **static export**: it runs in a browser, which cannot read a
YAML tree off disk. `packages/registry/src/snapshot.json` is generated from
these files, committed, and verified by a test that fails when the two diverge.
The YAML is the truth; the JSON is a build artefact that happens to be checked in.

## `profileReview` is not paperwork

Matching signals decide what the system puts in front of you. A wrong keyword
does not throw an error — it quietly steers the queue. So every profile states
where it came from, and the console renders an unconfirmed profile as what it
is: **a hypothesis**. Correcting one is editing one file.

Today every profile is `DRAFT`, derived from the studio's own public portfolio
copy and from the earlier Phase 2 profile set. Confirm a profile by setting:

```yaml
profileReview:
  status: CONFIRMED_BY_OWNER
  confirmedAt: "2026-09-16"
  derivedFrom: ["owner review"]
  note: "..."
```

## Retiring a project

Set `active: false` rather than deleting the file. The history of what the
system was told to look for stays readable, and no past audit event points at a
project that no longer exists.
