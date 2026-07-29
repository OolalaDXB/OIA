# 1. Repository Inventory

**Date of inspection:** 2026-07-29
**Branch:** `claude/oia-funding-v0-architecture-sze0zq`

## Method

Inspected the working tree and git metadata directly:

```
git status        # "No commits yet"
find . -not -path './.git/*'   # only .git exists
git ls-remote origin           # no refs on the remote
git log                        # no commits
```

## Findings

The repository is **empty / greenfield**:

| Item | State |
|------|-------|
| Commits | None (`No commits yet`) |
| Tracked files | None |
| Untracked files | None (before this planning work) |
| Remote refs | None on `origin` |
| Working branch | `claude/oia-funding-v0-architecture-sze0zq` (local, unpushed) |
| Build tooling | None present |
| CI / workflows | None present |
| Dependency manifests | None (`package.json`, `pnpm-workspace.yaml`, etc. all absent) |
| Existing code / modules | None |
| Docs / ADRs | None (this is the first) |

## Consequences

- There is **no legacy to preserve, migrate, or reverse-engineer.** The
  "inventory" and "reuse" deliverables are therefore short by necessity.
- We have a free hand on structure, tooling, and conventions — constrained only
  by the stated product boundaries and the preferred stack.
- The first commit(s) on this branch are these planning documents. The first
  *code* commit happens only after approval.

## What this repository is *not* (yet)

No Supabase project is linked, no Next.js app is scaffolded, no worker image
exists, and no environment variables or secrets are configured in-repo. All of
that is Milestone 1 scope, described in `06-milestone-1-plan.md`.
