# OIA — Oolala Intelligence Agency

OIA finds, verifies and qualifies **real and currently actionable**
opportunities for **every project the studio runs**, and gives one operator a
workspace to triage them, decide, and track what is owed.

Eleven kinds, because they do not behave alike: tenders and pre-solicitations
(RFI, sources sought, PIN), grants, **tax incentives** (CIR, CII, JEI), equity,
loans and guarantees, prizes, consortium calls, **marketplace projects**,
**acquisitions** — and regulatory items that are only ever watched.

It works for all of them from one place: 16 projects today (BAWABA, SILLON,
Maisons.co, myOolala, BEAU, BEAU Treasury, RLS Guard, Coach Gari, Les Vieilles
Pierres, District 267, PandaMood, padel.design, Ludography, two foundations —
and **TheStudio MT itself**, as a bidder on public IT tenders). Adding the next
one is **one YAML file**.

## Non-negotiable product rule

The system must produce a shortlist of **real and currently actionable**
opportunities. For every one it separates:

- confirmed official fact · extracted information · inference · recommendation ·
  unresolved uncertainty

and maintains four independent scores: **Relevance**, **Eligibility**,
**Win potential**, **Information confidence**.

No opportunity may be recommended as `PURSUE` without **six universal
conditions**: an accessible primary source, a verified source, an eligibility
assessment, more than an aggregator listing, an exact proposed next action, and
sufficient source confidence. **No kind can be exempted from any of them.**

Three further conditions — verified deadline, not expired, call still open —
apply **only to kinds that have a deadline**. A tax incentive is a status, not a
call: demanding a deadline of it blocks it forever, which is a modelling bug,
not rigour. That split is the difference between a gate that adapts and a gate
that is a dial: the dial that would loosen "verified source" does not exist.

**A human approval never overrides a failed condition** — the console records
the approval and the gate still refuses, and the audit trail proves it.

## Adding a project — the entire procedure

```bash
cp registry/projects/sillon.yaml registry/projects/newthing.yaml
$EDITOR registry/projects/newthing.yaml      # signals, discovery, profileReview
pnpm --filter @oia/registry validate
pnpm --filter @oia/registry generate          # regenerate the browser snapshot
```

No code change. The project is immediately in the console, the tagging
dropdowns, the digest, the metrics — and in the next discovery run if
`discovery.enabled`. See [`registry/README.md`](registry/README.md).

## The surfaces

**Five destinations**, not thirteen. The rail was a list of every feature ever
built; it is now a list of the things you actually do.

| Route | What it is |
|---|---|
| `/digest` | **Today** — what closes, what is overdue, what the watch raised, what is untriaged. Deterministic; empty when nothing needs you |
| `/` | **Opportunities** — the full queue, provenance-typed facts, gate report, four scores |
| `/projects` | **Projects** — signals, entity route, discovery config, whether the profile is owner-confirmed; and the three ways to start a search |
| `/money` | **Money** — how much is in play per project, what is ready, and what is blocking the rest |
| `/workspace` | **Workspace** — tasks, notes and contacts in one place |

Every older route (`/grants` `/tenders` `/investors` `/alerts` `/tasks` `/notes`
`/contacts` `/metrics`) still resolves to the right view, so no shared link
breaks.

The vocabulary is translated once, in `lib/vocabulary.ts`:
`MANUAL_REVIEW_REQUIRED` reads "not verified yet", `noVerifiedDeadline` reads
"no confirmed deadline". Shortlists export to CSV and Markdown; the digest
exports to Markdown; the whole human layer backs up to one JSON file.

### Starting a search on anything

Three ways, all from the console, all landing in the same pipeline:

1. **Create a project** — the draft is validated by the *same* Zod schema the
   YAML files are held to, then written to `registry/projects/<slug>.yaml` by
   the worker. The YAML stays the source of truth.
2. **Run a search** on any project. The request is *claimed* by the workflow,
   run, then closed against what actually happened — never marked done for a
   search that did not run.
3. **Paste a link** — the universal intake, and the answer to sources with no
   API. The page is fetched with the same SSRF-guarded fetcher, hashed, checked
   against its own domain, read for scope and eligibility, and lands at **"not
   verified yet"**. Pasting a link is not verifying a source.

## The agent that reads what has no API

Seventeen of the eighteen registry sources have no machine access. They were
`DECLARED` — an honest word for "a human is supposed to look at this" — and no
human ever did. Brittany's regional aid, aides-territoires, BPI, France 2030,
CIR/CII/JEI, Hub71, ADIO: declared, never read.

`pnpm --filter @oia/workers scout:aid` renders each of those pages in a real
browser (most return an empty shell to a plain fetch) and hands the visible text
and the page's own links to **Mistral**, which returns structured candidates.
Mistral rather than anything else because OIA serves a studio whose positioning
is European sovereignty, and because it is the provider already exercised live
here. One secret: `MISTRAL_API_KEY`.

**What stops it being a rumour mill is a function, not a prompt.** "Only report
calls that are really on the page" is a wish. `anchorViolations()` is a check:
every call must cite a URL that actually appears on the page it was read from,
and any quote must actually occur in the page text. Anything else is dropped
with a stated reason.

That guard was verified against a really rendered page: two genuine calls kept
with their relative links resolved, and *Bourse French Tech Emergence* — a real
French programme, correctly named, correctly attributed to Bpifrance, simply not
on that page — dropped. That is the dangerous case, because it reads as
credible.

**What it does not change is what counts as true.** Everything the model returns
is a claim. Facts carry `extractionMethod: "llm"`, the provider, the model id
and confidence 0.5, so nothing a model produced can be mistaken for something a
rule read. Records land at MANUAL_REVIEW_REQUIRED exactly like a TED notice; the
deterministic gate still refuses PURSUE and a human still verifies.

`BLOCKED` sources stay excluded. Owning a browser that could scrape Upwork or
Acquire does not make it permitted, and the account at risk would be yours.

The call budget is hard: the provider throws when it is exhausted rather than
continuing with a warning.

## Money, and links that actually resolve

`/money` answers "how much is in play" under three rules that are printed on the
screen rather than buried in the code: **coverage travels with every total**
(a sum over 3 of 15 records is not a pipeline), **inbound and outbound never
mix** (an acquisition spends), and **what the gate blocks is counted apart from
what is ready**. Figures are *read* from documents, never estimated; ragged
grouping lowers confidence instead of inventing certainty; currencies are never
converted.

`pnpm --filter @oia/workers check:links` verifies every published URL — project
links, sources, opportunities — and writes the verdict back into the registry
(`urlVerified`, `lastUrlCheck`). The console shows *verified on …* or *never
checked*, never a link that merely looks fine.

It starts with a **canary**: if our own egress is blocked, the run says the
check did not happen, stamps nothing and exits non-zero. The first version
reported 45 working URLs as refused — it was blaming other people's sites for
our network, and a checker that lies about that is worse than none.

## Architecture

| Package | What it does |
|---|---|
| `packages/config` | Zod-validated env + scoring constants |
| `packages/database` | Domain Zod schemas, row types, Supabase client, migration `0001_init.sql` |
| `packages/registry` | **The project and source registries** — YAML source of truth, schema, honesty rules, generated browser snapshot |
| `packages/audit` | Fail-closed policy hooks + append-only audit sink |
| `packages/providers` | Provider-neutral `LLMProvider` — **Mistral by default** (native JSON mode, temperature 0, hard call budget), Anthropic and a fake |
| `packages/connectors` | `SourceConnector` interface, polite hash-pinning fetcher, TED + EU Funding & Tenders (SEDIA) + manual |
| `packages/ingestion` | Artifact ingestion, provenance-typed facts, deadlines, verification, the deterministic gate, **the eleven kinds and their gate profiles**, tender-fact extraction, **link checking**, dedup, freshness/expiry |
| `packages/scoring` | Four scores + the hard PURSUE gate (pure, table-tested) |
| `packages/intelligence` | Qualifier: fact corroboration → eligibility → scores → gate → recommendation. **The aid scout** and its anchor guard |
| `packages/knowledge` | Canonical knowledge base + disclosure gate (what may be claimed externally) |
| `packages/watch` | **The permanent watch** — the ledger that remembers between runs, change detection, and the alert rules |
| `packages/workspace` | Workspace records, suggestions, digest, metrics, **finance**, exports, storage adapter |
| `apps/workers` | Dockerized pipelines; registry-driven multi-project discovery, ledger publishing, link checking, and the request queue |
| `apps/web` | The console — static export, no backend |

```bash
pnpm install
pnpm typecheck && pnpm test          # 285 tests
pnpm --filter @oia/registry validate
pnpm --filter @oia/knowledge validate
pnpm --filter @oia/web build
```

## Running discovery

Discovery needs network egress (the agent sandbox is blocked by policy, and
reports it as `BLOCKED` rather than pretending otherwise). Run it locally or in
the Docker worker:

```bash
docker compose up --build
pnpm --filter @oia/workers discover:ted -- --list             # show the plan, fetch nothing
pnpm --filter @oia/workers discover:ted                       # every discoverable project
pnpm --filter @oia/workers discover:ted -- --project sillon,bawaba
pnpm --filter @oia/workers exec tsx src/ted-to-console.ts     # refresh the console dataset
```

Each project gets its own expert query from its registry profile — specific CPV
codes, buyer countries, a recency floor, the project's own search terms, and a
notice-type filter. A notice found by several projects is kept once and carries
the list of projects whose query surfaced it — discovery provenance, never a
match verdict.

**Two things stop the queue being noise.** Notices are classified before
processing: on the last real recorded response, 81 of 100 were *qualification
systems* — standing supplier registers with no deadline and nothing to bid on —
and are now set aside with the reason recorded. And the notice page, already
fetched and hashed, is read rather than discarded: scope, eligibility criteria,
award criteria, estimated value, procedure, place and lots become
provenance-typed facts, so matching reasons about the call instead of
pattern-matching a 54-character title.

**It also runs itself.** `.github/workflows/discovery.yml` performs the same
sequence every Monday (and on demand, with per-project overrides) where egress
exists: it claims the searches the console asked for, discovers, drains the
request queue, regenerates the registry, verifies the result — typecheck, tests,
web build — checks every published link, and only then commits the refreshed
dataset, which redeploys the console. Requests are closed at the end against the
run's real outcome, with `always()`, because a request stuck at RUNNING looks
exactly like one still in flight.

A shortlist that silently goes stale is not "currently actionable"; that is the
point of the schedule. Disable it in the repository's Actions tab if you would
rather refresh by hand.

## Where it looks

`registry/sources/` holds 18 sources as YAML the code reads, not a list in a
document. Each carries a status the validator enforces:

| Status | Meaning | Today |
|---|---|---|
| `LIVE` | a connector runs and returns | TED |
| `FIXTURE_ONLY` | connector written, never confirmed against the real service | EU Funding & Tenders |
| `DECLARED` | source identified, **no connector** — paste-a-link is the path | 12, incl. **Région Bretagne**, aides-territoires, BPI, France 2030/ADEME, CIR-CII-JEI, **Hub71**, **ADIO**, UAE federal procurement, UK Find a Tender, UNGM, World Bank/AfDB/EBRD |
| `BLOCKED` | automated access is forbidden or behind an account | Upwork, Malt/Comet, Acquire, Flippa |

A `LIVE` entry without a connector fails validation, and a `DECLARED` entry that
claims one fails too. That rule is what stops the list becoming a sales pitch.

**On Upwork, Malt, Comet and Acquire specifically:** they are `BLOCKED` on
purpose. Their terms forbid scraping, and using your credentials to harvest them
would put **your** account at risk, not mine. The supported path is the link
intake — see a mission or a listing worth having, paste the URL, it enters the
pipeline like everything else. If any of them opens an official API, the entry
changes status and a connector plugs in; the slot is already there.

## The permanent watch

Discovery that runs weekly is not a watch if each run forgets the last one. The
ledger (`packages/watch`) keeps one row per opportunity **identity** across all
runs, so the system can say what is new, what changed, what vanished and since
when a call has been open — and raise alerts on it, idempotently.

Switching it on takes four steps that need your credentials:
[`docs/watch-setup.md`](docs/watch-setup.md). Until then the console runs on its
bundled snapshot exactly as before.

## Access and data

The console is behind Vercel Authentication, and the database behind a sign-in:
it ships its key in a public bundle, so row-level security refuses to answer
without a session. The audit trail is append-only in the database itself, not by
convention. Read [`docs/access-and-data.md`](docs/access-and-data.md) before
attaching a custom domain.

## Where to start reading

- [`docs/roadmap.md`](docs/roadmap.md) — **what the system actually searches on
  today (measured), what it cannot yet represent, and what comes next**
- [`docs/architecture/README.md`](docs/architecture/README.md) — the ten
  architecture deliverables and the rationale behind the code
- [`registry/README.md`](registry/README.md) — who OIA works for, and how to add
  a project
- [`knowledge/README.md`](knowledge/README.md) — what the studio may claim, and
  on what evidence
- [`docs/interface/phase-3-4-compte-rendu.md`](docs/interface/phase-3-4-compte-rendu.md)
  — the latest delivery report (FR)
