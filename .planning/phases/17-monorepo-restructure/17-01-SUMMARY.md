---
phase: 17-monorepo-restructure
plan: 01
subsystem: infra
tags: [bun, bunfig, lockfile, github-actions, ci, supply-chain, vitest]

# Dependency graph
requires:
  - phase: 16
    provides: "Biome-only toolchain and the 853-test server suite this plan keeps green"
provides:
  - "packageManager pinned to bun@1.3.14 (proto shim locally, setup-bun in CI)"
  - "Root bunfig.toml: hoisted linker, exact specifiers, 7-day minimumReleaseAge, no exclusions"
  - "bun.lock as the only lockfile (package-lock.json removed from git, bun.lockb deleted and still ignored)"
  - "CI on push to main and plain pull_request, every job on the pinned Bun with a pin + clean-tree check after install"
  - "Human approval of @vitest/coverage-v8@3.2.6 for plan 17-02 Task 2 (TOOL-11)"
affects: [17-02, 17-03, phase-18-tooling, phase-19-ci]

# Actuals (#2632) — chars/4 over the realized diff (dominated by the 6731-line package-lock.json deletion)
actuals:
  tokens: 42846
  tasks: 3
  commits: 2
plan_head_before: 1defa93a550473bd0068457a4bfcf4f9e8385e5a
plan_head_after: 0b4799fa3f8f83878aadd434358e09c2dc0b0c4a

# Tech tracking
tech-stack:
  added: ["Bun 1.3.14 (package manager / script runner)", "bunfig.toml install gates"]
  patterns:
    - "Install policy lives in bunfig.toml, not in habit: hoisted linker, exact = true, minimumReleaseAge = 604800"
    - "CI reads the Bun version from package.json (bun-version-file) and fails on version drift or any post-install tree change"
    - "New package versions pass a blocking-human legitimacy checkpoint before any plan installs them"

key-files:
  created:
    - bunfig.toml
  modified:
    - package.json
    - .gitignore
    - .github/workflows/ci.yml
  deleted:
    - package-lock.json

key-decisions:
  - "Pin linker = \"hoisted\" explicitly in bunfig.toml: a regenerated bun.lock gets configVersion 1, which would silently switch the workspace to isolated installs"
  - "Declare no trustedDependencies yet: a partial list replaces Bun's default trust list and would block the esbuild and Biome postinstalls (explicit list is TOOL-07, Phase 18)"
  - "CI uses only the plain pull_request event (read-only token, no secrets for forks), never pull_request_target"
  - "@vitest/coverage-v8@3.2.6 approved by the user despite a SUS (too-new) seam verdict, because the verdict comes from the package's newer 4.x/5.x publishes, not from 3.2.6 (published 2026-06-01)"

patterns-established:
  - "Pin-first ordering: the Bun pin and single lockfile land before any file moves (D-02)"
  - "Verify Bun pin and clean install step right after every CI install"

requirements-completed: [TOOL-05, MONO-05, TOOL-11]

coverage:
  - id: D1
    description: "Repo resolves Bun 1.3.14 from its own packageManager pin"
    requirement: TOOL-05
    verification:
      - kind: other
        ref: "bun --version | grep -qx '1.3.14' && grep -q '\"packageManager\": \"bun@1.3.14\"' package.json"
        status: pass
    human_judgment: false
  - id: D2
    description: "bunfig.toml gates installs: hoisted linker, exact specifiers, 7-day release age, no exclusions"
    requirement: MONO-05
    verification:
      - kind: other
        ref: "grep linker/exact/minimumReleaseAge bunfig.toml; grep -c minimumReleaseAgeExcludes bunfig.toml == 0"
        status: pass
      - kind: other
        ref: "scratch-dir probe: bun add is-number writes an exact specifier; bun add @tanstack/react-query@5.104.5 refused by release age"
        status: pass
    human_judgment: false
  - id: D3
    description: "Frozen install under Bun 1.3.14 leaves bun.lock byte-identical, writes no bun.lockb, keeps the hoisted layout, builds better-sqlite3"
    requirement: MONO-05
    verification:
      - kind: other
        ref: "bun install --frozen-lockfile && git diff --quiet -- bun.lock && test ! -e bun.lockb && test ! -d node_modules/.bun && test -f node_modules/better-sqlite3/build/Release/better_sqlite3.node"
        status: pass
    human_judgment: false
  - id: D4
    description: "bun.lock is the only lockfile tracked or on disk"
    requirement: MONO-05
    verification:
      - kind: other
        ref: "git ls-files | grep -E '(package-lock.json|bun.lockb|yarn.lock|pnpm-lock.yaml)$' prints nothing; git check-ignore -q bun.lockb"
        status: pass
    human_judgment: false
  - id: D5
    description: "All 4 CI jobs install on the pinned Bun and fail on version drift or a dirty tree; CI runs on pull_request"
    requirement: TOOL-05
    verification:
      - kind: other
        ref: "ruby YAML structural check on .github/workflows/ci.yml -> 'ci ok: 4 jobs'"
        status: pass
    human_judgment: false
  - id: D6
    description: "Full server suite still green under the Bun 1.3.14 script runner"
    verification:
      - kind: unit
        ref: "bun run test -> Test Files 53 passed (53), Tests 853 passed (853), Type Errors no errors"
        status: pass
    human_judgment: false
  - id: D7
    description: "@vitest/coverage-v8@3.2.6 legitimacy approved before plan 17-02 installs it"
    requirement: TOOL-11
    verification:
      - kind: manual_procedural
        ref: "Task 3 blocking-human checkpoint; user answer recorded verbatim below"
        status: pass
    human_judgment: true
    rationale: "Package legitimacy is a trust decision only a human can make; the approval is recorded, and the install itself happens in plan 17-02"

# Metrics
duration: 3h 2m
completed: 2026-10-23
status: complete
---

# Phase 17 Plan 01: Bun 1.3.14 Pin, Install Gates and Single Lockfile Summary

**The repo now runs on Bun 1.3.14, pinned in `packageManager`. Installs are gated by a root `bunfig.toml` (hoisted linker, exact specifiers, 7-day minimum release age), `bun.lock` is the only lockfile, and CI runs on pull requests too, with every job installing on the pinned Bun and failing on version drift or a dirty tree. The user approved `@vitest/coverage-v8@3.2.6` for plan 17-02.**

## Performance

- **Duration:** 3h 2m wall clock. Most of it was the wait at the Task 3 human checkpoint; Tasks 1 and 2 ran in minutes.
- **Started:** 2026-10-23T14:11:03Z
- **Completed:** 2026-10-23T17:13:10Z
- **Tasks:** 3 (2 automated, 1 blocking-human checkpoint)
- **Files modified:** 5 (1 created, 3 modified, 1 deleted)

## Accomplishments

- `packageManager` is `bun@1.3.14`, and plain `bun --version` at the repo root prints `1.3.14` through the proto shim, even though proto also has 1.0.31 installed.
- The root `bunfig.toml` has one `[install]` table: `linker = "hoisted"`, `exact = true`, `minimumReleaseAge = 604800`. It has no exclusion list, and the repo declares no `trustedDependencies`.
- Frozen install under 1.3.14 left `bun.lock` byte-identical. It wrote no `bun.lockb`, created no `node_modules/.bun`, and built the `better-sqlite3` native binary.
- `package-lock.json` is no longer in git. `bun.lockb` is deleted from disk and still git-ignored, with an updated comment.
- `.github/workflows/ci.yml`:
  - adds the plain `pull_request` trigger;
  - gives `bun-version-file: package.json` to setup-bun in all 4 jobs;
  - adds a `Verify Bun pin and clean install` step right after each `bun install --frozen-lockfile`.
- All 853 tests in 53 files pass under the 1.3.14 script runner, with no type errors.

## Verification Results

| Check | Result |
|-------|--------|
| `bun --version` (repo root) | `1.3.14` |
| `bun install --frozen-lockfile` | exit 0. `bun.lock` byte-identical, no `bun.lockb`, no `node_modules/.bun`, `better_sqlite3.node` present |
| `bun run test` | `Test Files 53 passed (53)`, `Tests 853 passed (853)`, `Type Errors no errors` |
| Exact-specifier probe (scratch dir, `bun add is-number`) | Exact specifier written, starting with a digit (no `^` or `~`) |
| Age-gate probe (scratch dir) | `bun add @tanstack/react-query@5.104.5` (published under 7 days ago) refused: `Version "@tanstack/react-query@5.104.5" was published within minimum release age of 604800 seconds` |
| Release-age exclusions / trustedDependencies | `grep -c minimumReleaseAgeExcludes bunfig.toml` = 0, `grep -c trustedDependencies package.json` = 0 |
| Single lockfile | No `package-lock.json`, `bun.lockb`, `yarn.lock` or `pnpm-lock.yaml` tracked. `bun.lockb` is still ignored |
| CI structural check (ruby YAML) | `ci ok: 4 jobs` |
| `bun run lint` | exit 0 |

All of these checks were run again on the final tree before this SUMMARY was written.

## Package legitimacy

The planning-time seam was re-run at the checkpoint (`gsd-tools query package-legitimacy check --ecosystem npm @vitest/coverage-v8 ast-v8-to-istanbul @bcoe/v8-coverage js-tokens @jridgewell/trace-mapping`). The fresh verdicts shown to the user:

| Package | Verdict | Notes |
|---------|---------|-------|
| `@vitest/coverage-v8` | **SUS** (`too-new`) | The `too-new` rating comes from the package's newest publishes: 5.0.5 and 4.1.12 (2026-10-15) and 5.1.0-beta.1 (2026-10-19). The pinned **3.2.6** was published 2026-06-01T09:39:10Z from the github.com/vitest-dev/vitest repo. It has no `install`/`postinstall` scripts. Its peers are `vitest: 3.2.6` and `@vitest/browser: 3.2.6`. |
| `ast-v8-to-istanbul` | OK | |
| `@bcoe/v8-coverage` | OK | |
| `js-tokens` | OK | |
| `@jridgewell/trace-mapping` | OK | |

No package was rated SLOP.

**User's answer (verbatim):** `approved`

Effect: plan 17-02 Task 2 may change `@vitest/coverage-v8` from 2.1.5 to 3.2.6 (TOOL-11). The root `minimumReleaseAge` gate still applies to every transitive resolution in that install.

## Task Commits

1. **Task 1: End-to-end install path on Bun 1.3.14 (tracer)** - `8bcdf3b` (build)
2. **Task 2: One lockfile everywhere, CI on the pinned Bun with a clean-tree check** - `0b4799f` (build)
3. **Task 3: Package-legitimacy gate for `@vitest/coverage-v8@3.2.6`** - no code commit (blocking-human checkpoint; the approval is recorded in this SUMMARY)

**Plan metadata:** the docs commit for this SUMMARY and the STATE/ROADMAP/REQUIREMENTS updates.

## Files Created/Modified

- `bunfig.toml` (new): install gates (hoisted linker with a comment saying why, `exact = true`, `minimumReleaseAge = 604800 # 7 days, in seconds`).
- `package.json`: only the `packageManager` line changed, now `bun@1.3.14`.
- `package-lock.json` (deleted): the stale npm lockfile.
- `.gitignore`: kept the `bun.lockb` pattern and changed only the comment above it.
- `.github/workflows/ci.yml`: added the `pull_request` trigger, `bun-version-file: package.json` in 4 jobs, and the `Verify Bun pin and clean install` step in 4 jobs.

## Decisions Made

- **Hoisted linker set explicitly.** A regenerated `bun.lock` gets `configVersion: 1`, which would silently switch the workspace to isolated installs.
- **No `trustedDependencies` in this phase.** Declaring a partial list replaces Bun's default trust list and would block the esbuild and Biome postinstalls. The explicit list is TOOL-07 in Phase 18.
- **CI uses only the plain `pull_request` event.** Fork runs get a read-only token and no secrets. `pull_request_target` is never used.
- **`@vitest/coverage-v8@3.2.6` approved.** The SUS verdict reflects the package's newer 4.x/5.x releases, not the 3.2.6 version this plan pins.

## Deviations from Plan

### Observations (no code change)

**1. [Rule 1 - Observation] Bun's release-age refusal wording depends on how the version is requested**
- **Found during:** Task 1, step 6 (age-gate probe)
- **Issue:** The plan expected `No version matching ... (blocked by minimum-release-age: 604800 seconds)`. For an exact version request, Bun 1.3.14 instead prints `Version "@tanstack/react-query@5.104.5" was published within minimum release age of 604800 seconds`. A range request (`@tanstack/react-query@>=5.104.4`) prints the plan's expected `No version matching ... (blocked by minimum-release-age: 604800 seconds)` text.
- **Fix:** None needed. The gate refused the too-young version in both forms. Only the message text differs.
- **Files modified:** none
- **Verification:** Both probe forms exited non-zero, and no dependency was written in the scratch dir.
- **Committed in:** n/a

---

**Total deviations:** 1 observation, 0 code fixes
**Impact on plan:** None. The supply-chain gate behaves as specified. Later plans or checks that grep for the refusal text should match `minimum release age` / `minimum-release-age` rather than one exact phrase.

## Issues Encountered

None.

## User Setup Required

None. No external service configuration is required.

## Next Phase Readiness

- Ready for plan 17-02, the workspace move. The root fan-out scripts can rely on Bun 1.3's `--filter`, and the TOOL-11 install of `@vitest/coverage-v8@3.2.6` is approved.
- The caret-to-exact specifier rewrite (D-09) and the Codecov `files` path change are planned for 17-02, after the move.
- Fork PRs will fail the Codecov upload, because they get no `CODECOV_TOKEN`. This was accepted in T-17-05.

---
*Phase: 17-monorepo-restructure*
*Completed: 2026-10-23*

## Self-Check: PASSED

- Files exist: bunfig.toml, package.json, .gitignore, .github/workflows/ci.yml. package-lock.json is confirmed deleted.
- Commits are ancestors of HEAD: 8bcdf3b, 0b4799f. The measured count from 1defa93..HEAD is 2.
- Plan-level verification was re-run on the final tree, and all checks passed.
