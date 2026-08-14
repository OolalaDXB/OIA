# BAWABA — Architecture (canonical, grounded in code 2026-08-14)

TARGET architecture [fact-bawaba-target-architecture]; REAL status per element
below, from the bawaba-command@9913a36 inventory. Registry:
`../../capabilities/capabilities.yaml`.

| Element | Registry id | REAL status |
|---|---|---|
| Decision/policy engine | decision-api | **Implemented + tested locally** — default-deny YAML tool lists; binary ALLOW/DENY (no REVIEW), in-process only, pre-OPA |
| Event/evidence plane, audit/provenance | evidence-audit-plane | **Implemented + tested locally** — SHA-256 chain, Ed25519, Postgres append-only trigger, server-side verify, CLI verifier, public sample verifies |
| Jurisdiction routing | jurisdiction-routing-proofs | **Implemented + tested locally** — Ed25519-signed verifiable proofs, fail-closed |
| PII tokenization (MENA) | pii-tokenization-mena | **Implemented** — Rust/cgo, 7 patterns + Luhn, TTL vault; barely tested |
| Gateway forwarding / enforcement adapters | mcp-gateway-enforcement | **NOT implemented** — pipeline shell real, execution stubbed (`proxy.go:463`); zero third-party adapters |
| Overlay / sidecar deployment | (part of enforcement) | Demo stack only (docker-compose); "in active development" per site |
| Embedded sovereign gateway | (part of enforcement) | **Not started** — roadmap P3 (2027) |
| Enterprise auth (OIDC/JWT) | — | **Stub** (`auth.go:212-245`); API-key/bearer/mTLS paths exist, no TLS listener as deployed |

Stack: Go 1.24 control plane (~5.9k LOC, 3 deps), Rust tokenizer (cgo FFI),
React/Vite console (demo-ware, mock fallbacks), PostgreSQL. 71 Go tests —
only api+siem run in CI [fact-bawaba-tests-ci-gap].

**Reading**: the CONTROL plane (record, prove, verify) is materially ahead of
the ENFORCEMENT plane (forward, adapt, embed). BAWABA can currently prove
decisions far better than it can enforce them. **Rule: a planned capability
is never presented as demonstrated.** Contradictions & risks:
`contradictions.md`.
