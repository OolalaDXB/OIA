# BAWABA — Evidence inventory (canonical, grounded in code 2026-08-14)

Machine source: `../../evidence/evidence.yaml`. Current state — honest:

| Evidence | Maturity | Disclosure |
|---|---|---|
| bawaba-command Go test suites (71 tests: audit tamper, routing proofs, policy, proxy, quotas, SIEM) | TESTED (locally; CI runs 2/9 packages) | internal |
| Public verifiable evidence sample on bawaba.systems (verify.py executed: chain OK, signature OK) | TESTED | **external-safe** |
| Deployable demo stack (Docker, compose, monitoring, demo/bench scripts) | IMPLEMENTED | internal |
| OIA ingestion & gate test suites | TESTED | internal |
| Live TED discovery run (real API) | TESTED | internal |
| RLS Guard across TheStudio products | IMPLEMENTED | internal |
| KM Openpay track record (70+, validated products) | CUSTOMER_USED | external-safe |

**Still missing for BAWABA** (feeds the Evidence Gap Analyst later):
- real gateway forwarding + at least one third-party gateway adapter
  (enforcement is stubbed — the biggest gap);
- REVIEW tri-state + external Decision API endpoint;
- CI running ALL test packages (today 2/9) + Rust/front tests;
- paying design partner, production metrics, independent security assessment;
- OIDC/JWT auth, TLS in deployment, /metrics.

**Fixed since the founder-declared baseline**: Decision engine, audit/evidence
plane, routing proofs and PII tokenizer are implemented with locatable code
and tests — no longer DECLARED-only.
