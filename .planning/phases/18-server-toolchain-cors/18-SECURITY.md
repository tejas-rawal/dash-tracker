---
phase: "18"
slug: "server-toolchain-cors"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-17"
---

# Phase 18 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry → local and CI `node_modules` | New packages and lifecycle scripts (tsx/esbuild, TypeScript, Biome 2, cors, @types) | Package tarballs, install scripts |
| GitHub pull-request event → CI runner | The workflow now installs Node and boots the built server | `GITHUB_TOKEN`, `CODECOV_TOKEN` |
| Browser origin → API (CORS) | Which web origins may read responses | All API responses, `Retry-After`/`RateLimit` headers |
| Operator env → server startup | `CORS_ALLOWED_ORIGINS` parsing | Allowed-origin list |
| DASH routes payload → clients | `color`/`textColor` passed through | Untrusted upstream strings |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-------------|----------|-------------|------------|--------|
| T-18-01 | Tampering | Lifecycle scripts (`trustedDependencies`) | high | mitigate | Root `trustedDependencies: ["better-sqlite3","esbuild"]`; `bun pm untrusted` → "Found 0 untrusted dependencies with scripts." locally and in all 4 CI jobs (run 44181827294) | closed |
| T-18-02 | Tampering | CI runtime drift | medium | mitigate | 4× `actions/setup-node@v7` with `node-version-file: .node-version` before install; verify step compares `node --version` with the file; CI resolved 24.22.2 in every job | closed |
| T-18-03 | Denial of Service | better-sqlite3 ABI after the Node bump | medium | mitigate | Clean reinstall loads on ABI 137 (local and in a fresh Paradev workspace); CI `Boot smoke test` served health/live from `dist/` and exited 0 | closed |
| T-18-04 | Tampering | `actions/setup-node@v7` moving major tag | low | accept | See AR-18-01 | closed |
| T-18-05 | Information Disclosure | CI boot smoke environment | low | mitigate | Dummy `DASH_API_KEY: smoke`, DASH at `http://127.0.0.1:9`; no secret referenced | closed |
| T-18-06 | Tampering | tsx 4.23.15 / esbuild install | medium | mitigate | Exact pin `tsx: 4.23.15`; legitimacy seam OK; `bun pm untrusted` 0 | closed |
| T-18-07 | Denial of Service | Signal forwarding bun → tsx → node | medium | mitigate | UAT 2–3: SIGINT to group, SIGTERM to bun, root Ctrl-C and Paradev terminal dispose all shut down gracefully with no leftovers and a free port | closed |
| T-18-08 | Tampering | Emit change (TS 6, es2024) | medium | mitigate | `dist/app.js` is CommonJS; strict flags unchanged; 922 tests and the dist boot smoke run on the new output | closed |
| T-18-09 | Repudiation | Reformat hiding a behavior change | low | mitigate | Reformat `86e09f1` reproduced byte-for-byte by `biome check --write .`; listed in `.git-blame-ignore-revs`; suite and smoke green after it | closed |
| T-18-10 | Tampering | Lint coverage dropped by `biome migrate` | medium | mitigate | 1.9.4 style rules restored by name; lint = 36 warnings, same rules and locations as the 1.9.4 baseline | closed |
| T-18-11 | Tampering | Obsolete `@biomejs/biome` trust entry | low | mitigate | Removed from `trustedDependencies`; `bun pm untrusted` still 0 | closed |
| T-18-12 | Information Disclosure | Origin echo or wildcard in `cors.ts` | high | mitigate | Exact-allowlist callback; no `*` in `api/middleware/cors.ts`; empty default allows no origin; 18-06 matrix | closed |
| T-18-13 | Elevation of Privilege | Credentialed CORS | medium | mitigate | No `credentials` option (only a comment explaining why); 18-06 asserts `access-control-allow-credentials` absent | closed |
| T-18-14 | Tampering | `CORS_ALLOWED_ORIGINS` parsing | medium | mitigate | Per-entry `new URL` + http(s) + `origin === entry` refine in `config/environment.ts`; bad entries stop startup naming the entry (see WR-02 note) | closed |
| T-18-15 | Denial of Service | Preflights bypassing the rate limit | low | accept | See AR-18-02 | closed |
| T-18-16 | Information Disclosure | Shared caches serving a no-Origin response to a browser | low | accept | See AR-18-03 | closed |
| T-18-17 | Tampering | `color`/`textColor` injection | medium | mitigate | `parseHexColor` keeps only `/^[0-9a-fA-F]{6}$/`; anything else omitted | closed |
| T-18-18 | Denial of Service | Malformed color failing `load()` | medium | mitigate | Helper never throws; tests prove `load()` resolves for every malformed value | closed |
| T-18-19 | Denial of Service | 429/503/404/SSE without CORS headers | medium | mitigate | 18-06 matrix: ACAO + exposed `Retry-After` on bucket 429, cap 429, 503, 404 and SSE 200 | closed |
| T-18-20 | Elevation of Privilege | Preflight spending/bypassing tokens | low | mitigate | 18-06: allowed preflight between two GETs lowers `RateLimit` remaining by exactly one; disallowed preflight unchanged | closed |
| T-18-21 | Information Disclosure | CORS headers leaking to unlisted origins | high | mitigate | Matrix asserts no `access-control-` header for disallowed/absent origins, ACAO never `*`, no credentials header | closed |
| T-18-SC | Tampering | npm installs (@types/node, undici-types, @biomejs/biome SUS; tsx, typescript, @tsconfig/node24, esbuild, cors, @types/cors OK) | high | mitigate | Legitimacy seam at planning; blocking-human approval (`approved`, 2026-11-12) before any SUS install; exact pins; `minimumReleaseAge = 604800`; no `minimumReleaseAgeExcludes`; frozen installs clean | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*

**Notes:**
- **T-18-16 / code review WR-01:** responses to a no-Origin or disallowed-origin request carry no `Vary: Origin`. That is the accepted risk AR-18-03 (and CORS-04 forbids adding headers to no-Origin responses). The review recommends `res.vary("Origin")` on every response; this is a policy choice to revisit if a shared cache is ever placed in front of the API.
- **T-18-14 / code review WR-02:** startup validation is correct; one test assertion (`rejects.toThrow(entry)` for `*`) cannot fail. Test-quality only, tracked in `18-REVIEW-DISPOSITION.md`.
- **Hostname scrub:** the 18-04 TDD evidence files committed the developer's hostname. Before the first push the unpushed history was rewritten so every commit carries `hostname="redacted"`; nothing pushed ever contained it.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-18-01 | T-18-04 | `actions/setup-node@v7` follows the repo's existing major-tag convention (`checkout@v4`, `setup-bun@v2`); first-party GitHub action. | Plan 18-01 (plan-time disposition) | 2026-11-10 |
| AR-18-02 | T-18-15 | Allowed preflights are answered in-process with no DASH call; disallowed ones get Express's automatic OPTIONS response, which never ran the GET-only limiter — unchanged from before CORS. | Plan 18-04 (plan-time disposition) | 2026-11-10 |
| AR-18-03 | T-18-16 | No shared cache sits in front of the API (DEPLOY-CHECKLIST); allowed-origin responses carry `Vary: Origin`; CORS-04 forbids adding headers to no-Origin responses. | Plan 18-04 (plan-time disposition) | 2026-11-10 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-17 | 22 | 22 | 0 | Claude (/gsd-secure-phase 18, ASVS L1 grep-depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-17
