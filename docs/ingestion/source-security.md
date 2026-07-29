# Source ingestion — fetch security

Implements spec §6 for `@oia/ingestion`. The URL-shape validation is pure and
unit-tested (`safe-fetch.unit.test.ts`); the network path is guarded by DNS
resolution + private-address blocking.

## Controls implemented

| Control | Where |
|---|---|
| HTTP/HTTPS only | `validateUrlShape` (rejects `file:`, `ftp:`, `gopher:`, …) |
| No credentials in URL | `validateUrlShape` |
| SSRF / private-address & loopback blocking | `isPrivateOrReservedIp` + DNS resolve check (10/8, 127/8, 169.254/16 incl. cloud metadata, 172.16/12, 192.168/16, 100.64/10, ::1, fc/fd, fe80) |
| DNS resolution check before connect | `safeFetch` (rejects hosts resolving to private IPs) |
| Redirect limit + per-hop re-validation | `safeFetch` (`maxRedirects`, each `Location` re-validated → blocks redirect-based SSRF) |
| Timeout limit | `safeFetch` (`AbortController`) |
| Response-size limit | `safeFetch` (`content-length` + body cap) |
| Content-type allowlist | `FETCH_CONTENT_TYPE_ALLOWLIST` (html, xhtml, pdf, plain) |
| No execution of downloaded files | bytes are hashed/parsed as data only; never executed |
| No cross-domain credential forwarding | no auth headers are sent or forwarded |
| Safe filename handling | local files addressed by manifest `localFilename`, joined under the manifest dir |
| Domain allow/denylist | `FETCH_DOMAIN_ALLOWLIST` / `FETCH_DOMAIN_DENYLIST` (config) |
| Rate limiting | `INGESTION_LIMITS.rateLimitPerHostPerMinute` (limit defined; enforcement is a per-run concern) |
| Auditable user-agent | `FETCH_USER_AGENT` (env) |
| Complete fetch audit events | every attempt yields a `LiveFetchAttempt` record (status, egressDenied, proxyCode, duration, error) |

**We never bypass authentication, proxy, egress or organizational restrictions.**
A `403` CONNECT is recorded as `BLOCKED` / `egressDenied: true` and the run
continues honestly.

## Headless rendering — NOT added (stop-for-review, spec §6)

Milestone 0 does **not** add a headless browser. Rationale:

- **Package size / Docker impact:** a headless engine (Playwright/Puppeteer +
  Chromium) adds hundreds of MB to the image and a heavy system-dependency
  surface — a material change to the current lightweight worker deployment.
- **Deployment impact:** would require a different base image and more memory/CPU.
- **Security implications:** executing untrusted page scripts is a large new
  attack surface, at odds with "no execution of downloaded content."
- **Alternatives considered (chosen):** for client-rendered SPAs we require an
  **official saved page or official PDF** supplied as a local artifact. SPAs are
  detected and logged explicitly (`CLIENT_RENDERED_SPA` + a warning); we never
  silently render.

If live headless rendering is ever required, it must come back for review as a
deliberate deployment-architecture decision.

## PDF & HTML parsing dependencies

- **`pdfjs-dist`** (Mozilla pdf.js, legacy build) — pure-JS, **no native
  bindings**; used with the worker disabled for per-page text extraction (page
  locators). Larger install, but no system deps and no code execution.
- **`cheerio`** — pure-JS HTML parsing for visible-text extraction, SPA
  detection, and CSS/heading locators.
