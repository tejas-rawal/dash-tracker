---
phase: 01-consolidate-lint-format-tooling
reviewed: 2026-08-26T00:00:00Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - package.json
  - biome.json
  - bun.lockb
  - package-lock.json
  - .vscode/settings.json
  - .vscode/extensions.json
findings:
  critical: 0
  warning: 1
  info: 1
  total: 2
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-08-26T00:00:00Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Reviewed the Biome-only lint/format tooling swap: `package.json`, `biome.json`, both lockfiles (`bun.lockb`, `package-lock.json`), and the two VS Code tooling files. Verified against the phase plan's stated intent and independently re-derived evidence rather than trusting the plan/summary claims at face value:

- Confirmed no residual `prettier` references anywhere in `package.json`, `package-lock.json`, or `bun.lockb` (checked via `grep`/`node -e` assertions, not just re-reading the summary's claims).
- Confirmed `package.json` `devDependencies`/`dependencies` are fully in sync with `package-lock.json`'s root package entry (no drift).
- Confirmed no orphaned transitive dependencies of the removed `prettier-plugin-packagejson` (e.g. `sort-package-json`, `synckit`, `@pkgr/*`) remain in `package-lock.json`.
- Confirmed `bun.lockb` is valid and in sync with `package.json` (`bun install --dry-run` reports no changes needed).
- Confirmed `biome.json`'s `files.ignore` no longer excludes `package.json`, and Biome now actually processes `package.json` in a full-repo scan (verified via `--verbose`) while still correctly leaving `package-lock.json`/`bun.lockb` untouched (lockfiles are excluded by Biome's own defaults, not by this phase's config).
- Confirmed `biome.json`'s formatter block (120 width, 4-space indent, double-quote) is byte-identical to the pre-swap values — this was a tooling swap, not a style change, as intended.
- Confirmed `.vscode/settings.json` and `.vscode/extensions.json` no longer reference `esbenp.prettier-vscode` anywhere, and retain the required VS Code keys.
- Ran `bun run lint` / `bun run format` directly: both exit 0 despite 14 pre-existing filename-convention warnings on files outside this phase's scope (`src/**/*.test.ts`), because Biome only fails the process on errors, not warnings — this confirms the plan's deferred-to-Phase-2 claim holds up under direct verification, not just narrative trust.

No critical/security issues found — this is a config-only tooling swap with no runtime attack surface. Found one pre-existing deprecated-flag issue that survived the "leave lint/lint:fix untouched" directive, and one design-level duplication worth flagging even though it was explicit plan intent.

## Warnings

### WR-01: `lint:fix` uses a deprecated Biome CLI flag that will break on the next major Biome version

**File:** `package.json:24`
**Issue:** `"lint:fix": "biome check . --apply-unsafe"` uses the `--apply-unsafe` flag. Running this against the pinned Biome 1.9.4 binary (`node_modules/.bin/biome check . --apply-unsafe`) produces:
```
! The argument --apply-unsafe is deprecated, it will be removed in the next major release. Use --write --unsafe instead.
```
This phase's plan explicitly directed leaving `lint`/`lint:fix` untouched ("they are already the target pattern the new format scripts mirror"), so the new `format:write` script was correctly written using the *non-deprecated* form (`biome check . --write`) — but that means `format:write` and `lint:fix` now use two different flag conventions for conceptually the same "apply changes" operation, and the older one is slated for removal. Since this phase's entire purpose is consolidating the lint/format toolchain onto a single unambiguous convention, this is exactly the kind of drift the phase should have caught and fixed rather than propagated forward.
**Fix:**
```diff
-    "lint:fix": "biome check . --apply-unsafe",
+    "lint:fix": "biome check . --write --unsafe",
```

## Info

### IN-01: `lint` and `format` scripts are byte-identical, which undercuts the "single unambiguous command" goal

**File:** `package.json:23,26`
**Issue:** `"lint": "biome check ."` and `"format": "biome check ."` are now literally the same string. This matches the phase plan's explicit acceptance criteria (mirror the existing `lint`/`lint:fix` pattern), so it is not a defect introduced by the implementation — but per this milestone's own stated Core Value ("a single, unambiguous command for linting and formatting — no redundant tools, no drift"), having two differently-named scripts that do the exact same thing is itself a minor source of future drift: a contributor could change one invocation (e.g. to add `--error-on-warnings`) without realizing the other needs the same treatment, silently reintroducing the drift this phase set out to eliminate.
**Fix:** Consider collapsing to one canonical script name (e.g. keep `lint`/`lint:fix` as canonical and make `format`/`format:write` thin aliases via `"format": "npm run lint"`), or document in `package.json`/README why both names exist. Not blocking — purely a maintainability note for a future pass.

---

_Reviewed: 2026-08-26T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
