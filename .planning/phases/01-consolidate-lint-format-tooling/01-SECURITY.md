---
phase: 01
slug: consolidate-lint-format-tooling
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: 2026-08-26
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Developer/CI toolchain → repo config | `bun install` / `npm install` regenerate dependency-resolution lockfiles from the edited `package.json`; no runtime code path, API surface, or user-facing behavior is touched by this phase | Local dependency graph metadata only — no runtime data, no network-facing surface |

This phase removes dependencies and rewires local dev-tooling config/scripts only. No new packages are installed — `prettier`, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` are exclusively REMOVED — so the package-legitimacy gate does not apply.

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Tampering | `bun.lockb` / `package-lock.json` regeneration | low | accept | Regeneration only removes 3 known devDependency entries via `bun install`/`npm install` against the already-edited `package.json` — no new dependency added. Verified independently: `grep -a -ci prettier bun.lockb` and `grep -ci prettier package-lock.json` both return 0; `bun install --dry-run` reports lockfile in sync. | closed |
| T-01-02 | Tampering | `biome.json` formatter-block parity | medium | mitigate | Edit scoped to `files.ignore` only. Verified independently: `formatter.lineWidth=120`, `indentStyle="space"`, `indentWidth=4`, `javascript.formatter.quoteStyle="double"` are byte-identical to pre-swap values; `files.ignore` no longer contains `**/package.json`. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above workflow.security_block_on (high) count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

No other STRIDE categories (Spoofing, Repudiation, Information Disclosure, Elevation of Privilege) apply — this phase has no authentication, request logging, data-exposure, or privilege surface; it edits static config/lockfiles in a private git repository with no runtime attack surface change.

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| R-01-01 | T-01-01 | Lockfile regeneration only removes known entries against an already-edited, human/agent-reviewed `package.json`; no new supply-chain surface introduced. Authored at plan time (`01-01-PLAN.md` threat_model). | plan author | 2026-08-25 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-26 | 2 | 2 | 0 | /gsd-secure-phase (orchestrator, L1 grep-depth — register authored at plan time, asvs_level 1, threats_open 0 short-circuit) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-26
