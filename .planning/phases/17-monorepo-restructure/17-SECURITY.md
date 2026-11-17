---
phase: "17"
slug: "monorepo-restructure"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-11-05"
---

# Phase 17 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry → local and CI `node_modules` | Third-party code and install scripts enter the machine | Package tarballs, lifecycle scripts |
| GitHub pull-request event → CI runner | Code from a PR branch runs in Actions with the workflow's token and secrets | `GITHUB_TOKEN`, `CODECOV_TOKEN` |
| Developer checkout → git history | Local env files must never enter a commit; blame must survive the move | `DASH_API_KEY` (secret), file history |
| HTTP client → server (rate limiter) | `TRUST_PROXY_HOPS` decides the client IP and so the rate-limit bucket | Client IP / `X-Forwarded-For` |
| External setup script → worktree | `~/.superset/dash-tracker-setup.sh` writes a real `DASH_API_KEY` into a fresh worktree | `DASH_API_KEY` (secret) |
| Docs → readers and agents | Agent instructions are executed literally by future agents | Commands, paths |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-17-01 | Tampering | Dependency resolution (`bunfig.toml`, `bun add`) | high | mitigate | Root `bunfig.toml`: `exact = true`, `minimumReleaseAge = 604800`, `linker = "hoisted"` | closed |
| T-17-02 | Tampering | CI install (`.github/workflows/ci.yml`) | high | mitigate | All 4 jobs use `bun-version-file: package.json`, `--frozen-lockfile` and a `git status --porcelain` check; CI run 40558783754 printed `packageManager Bun: 1.3.14, installed Bun: 1.3.14` in every job | closed |
| T-17-03 | Elevation of Privilege | CI pull-request trigger | medium | mitigate | `ci.yml` triggers on plain `pull_request` only; no `pull_request_target` | closed |
| T-17-04 | Tampering | Dependency lifecycle scripts | medium | mitigate | No `trustedDependencies` in either `package.json` | closed |
| T-17-05 | Denial of Service | Codecov upload on fork PRs | low | accept | See Accepted Risks Log (AR-17-01) | closed |
| T-17-06 | Information Disclosure | `apps/server/.env` (DASH_API_KEY) after the relocation | high | mitigate | `git check-ignore` matches `apps/server/.env` and `apps/server/data`; no env file is tracked; the move was done by hand | closed |
| T-17-07 | Repudiation | Git history and blame of moved files | medium | mitigate | `0be937b` is 123 × R100 with 0 insertions/deletions; PR #17 merged as merge commit `caffee2`, `0be937b` reachable from main, `--follow` reaches `b904b99` (UAT 5) | closed |
| T-17-08 | Tampering | `bun.lock` regeneration | high | mitigate | `17-lockfile-drift.cjs` gate; `bun.lock` is the only tracked lockfile; frozen installs leave the tree clean in CI | closed |
| T-17-09 | Spoofing | Rate-limit tests vs client-IP derivation | medium | mitigate | `apps/server/src/test/setup.ts:6` pins `TRUST_PROXY_HOPS = "0"` | closed |
| T-17-10 | Elevation of Privilege | Install lifecycle scripts | medium | mitigate | No trusted list declared; `bun pm untrusted` lists only `@biomejs/biome` (not better-sqlite3 or esbuild); better-sqlite3 loads | closed |
| T-17-11 | Information Disclosure | Fresh-worktree simulation (real `apps/server/.env` in a temp dir) | high | mitigate | No simulation worktree remains (`git worktree list` has no temp entries); the env file was never printed | closed |
| T-17-12 | Information Disclosure | CLAUDE.md, AGENTS.md, README.md | low | mitigate | `DASH_API_KEY=[^ ]` grep over the docs prints nothing | closed |
| T-17-13 | Tampering | Superset setup install | medium | mitigate | `.superset/config.json` setup runs `bun install --frozen-lockfile` | closed |
| T-17-14 | Denial of Service | Superset run command leaving processes behind | low | mitigate | `exec bun run dev-server` from `apps/server`; UAT 2 hand run: SIGTERM and SIGINT leave no process and free the port. SIGHUP is not covered (see note) | closed |
| T-17-SC | Tampering | npm installs (`@vitest/coverage-v8@3.2.6` and its closure) | high | mitigate | Plan-time legitimacy check and human approval, drift checker limited to coverage-v8's closure, `minimumReleaseAge` on every transitive resolution | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

**T-17-14 note:** in the UAT 2 hand run, SIGHUP to the run's process group left `bun run`, nodemon and ts-node running on port 3000. The planned mitigation covers SIGTERM and SIGINT only, so the threat is closed as planned. Whether it matters depends on Superset's stop signal, which UAT 2 (skipped) did not exercise.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-17-01 | T-17-05 | Fork PRs lack `CODECOV_TOKEN`, so the upload step fails them. Solo project; PRs come from same-repo branches. | Plan 17-01 (plan-time disposition) | 2026-10-23 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-11-05 | 15 | 15 | 0 | Claude (/gsd-secure-phase 17, ASVS L1 grep-depth) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-11-05
