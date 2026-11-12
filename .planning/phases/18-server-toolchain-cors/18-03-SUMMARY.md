---
phase: 18-server-toolchain-cors
plan: 03
subsystem: infra
tags: [biome, lint, format, git-blame, toolchain]

requires:
  - phase: 18-server-toolchain-cors
    provides: "18-01: Biome 1.9.4 baseline (36 warnings) and the package-legitimacy approval for @biomejs/biome@2.5.15; 18-02: tsx + TypeScript 6 in place"
provides:
  - "Biome 2.5.15 as the sole lint/format tool, with the same 36 warnings as the 1.9.4 baseline"
  - "biome.json on the Biome 2 schema: files.includes, preset recommended, and each 1.9.4 style.all rule listed by name at its 1.9.4 severity"
  - "lint:fix = biome check --write --unsafe ."
  - "Separate migrate and reformat commits, with the reformat SHA in .git-blame-ignore-revs"
affects: [18-04, 18-05, 18-06, ci, lint]

actuals:
  tokens: 7840
  tasks: 2
  commits: 5
plan_head_before: 494fd0de5fb84340e5a5fbfdc81c4c5fc8441221
plan_head_after: 2b6ccff4caed0ef9b99b010aaa26be541a421921

tech-stack:
  added: ["@biomejs/biome 2.5.15 (replaces 1.9.4)"]
  patterns:
    - "Biome 2 has no `all`: biome.json lists every enabled style rule by name; new Biome 2 style rules stay off until a phase opts in"
    - "A toolchain reformat is its own commit, made only of tool output, and is listed in .git-blame-ignore-revs"

key-files:
  created:
    - .git-blame-ignore-revs
  modified:
    - biome.json
    - package.json
    - bun.lock
    - apps/server/src/api/controllers/PredictionStreamController.ts
    - .claude/CLAUDE.md
    - AGENTS.md
    - "20 files reformatted by biome check --write . (listed below)"

key-decisions:
  - "Biome 2's new noUselessUndefinedInitialization hit is fixed with a null sentinel (`let unsubscribe: (() => void) | null = null`), not by dropping the initializer, because a bare `let` trips a Biome 1.9.4 useConst false positive and would have left lint red at the fix commit"
  - "biome.json restores the 1.9.4 style.all set by name: 19 style rules error, 21 warn, noParameterProperties and noDefaultExport off; complexity noArguments/noCommaOperator/useNumericLiterals/useWhile error; performance.noNamespaceImport warn; suspicious.noVar error, noExplicitAny info"
  - "useShorthandArrayType (folded into useConsistentArrayType) and useSingleCaseStatement (removed) have no Biome 2 entry; no rule was turned off"
  - "@biomejs/biome removed from trustedDependencies (2.5.15 has no lifecycle script); bun pm untrusted still reports 0"
  - "Lint is red only at the migrate commit (17 organizeImports + 3 format errors), which D-10's separate migrate/reformat commits make unavoidable; tests, typecheck and build pass at every commit"
  - "The Phase 18 PR must be merged with a merge commit (D-02), or the SHA in .git-blame-ignore-revs disappears from main"

patterns-established:
  - "Blame-ignore entries name the reformat SHA under a comment line; later commit messages must not quote the reformat subject, because the plan's --grep lookups take the newest match"

requirements-completed: [TOOL-10]

coverage:
  - id: D1
    description: "bun run lint runs Biome 2.5.15 and exits 0 with Found 36 warnings. (30 useFilenamingConvention, 1 useNamingConvention, 2 useThrowOnlyError, 3 suppressions/unused) at the 1.9.4 baseline locations"
    requirement: TOOL-10
    verification:
      - kind: other
        ref: "Task 1 verify 1 -> biome 2 lint at baseline"
        status: pass
    human_judgment: false
  - id: D2
    description: "biome.json names the 1.9.4 style rule set at its 1.9.4 severities with no all key; package.json pins 2.5.15, lint:fix uses --write --unsafe, @biomejs/biome is no longer trusted"
    requirement: TOOL-10
    verification:
      - kind: other
        ref: "Task 1 verify 2 -> style set restored / package.json ok / bun pm untrusted: Found 0 untrusted dependencies with scripts."
        status: pass
    human_judgment: false
  - id: D3
    description: "Fix -> migrate -> reformat are consecutive commits; migrate touches only biome.json, package.json, bun.lock; the reformat is byte-for-byte biome check --write . output"
    requirement: TOOL-10
    verification:
      - kind: other
        ref: "Task 1 verify 3 -> commit order ok"
        status: pass
      - kind: other
        ref: "Task 1 verify 4 -> reformat is tool-only"
        status: pass
    human_judgment: false
  - id: D4
    description: "The reformatted server is behavior-neutral: 853 tests, coverage, typecheck, build and the dist boot smoke pass"
    verification:
      - kind: unit
        ref: "bun run test:coverage -> Tests 853 passed (853); 98.68/96.8/98.42/98.68"
        status: pass
      - kind: other
        ref: "dist boot smoke -> {\"status\":\"ok\"} boot smoke ok"
        status: pass
    human_judgment: false
  - id: D5
    description: ".git-blame-ignore-revs holds the reformat SHA, and git blame with --ignore-revs-file attributes no line to it"
    requirement: TOOL-10
    verification:
      - kind: other
        ref: "Task 2 verify 1 -> blame ignores the reformat"
        status: pass
    human_judgment: false
  - id: D6
    description: "CLAUDE.md and AGENTS.md describe Biome 2.5.15, the lint:fix command and the blame.ignoreRevsFile hint; the repo allows merge commits for D-02"
    verification:
      - kind: other
        ref: "Task 2 verify 2 -> docs ok"
        status: pass
      - kind: other
        ref: "gh api repos/tejas-rawal/dash-tracker --jq .allow_merge_commit -> merge commits allowed"
        status: pass
    human_judgment: false

duration: 5min
completed: 2026-11-12
status: complete
---

# Phase 18 Plan 03: Biome 2.5.15 Migration Summary

**Biome 2.5.15 now lints and formats the repo with the same 36 warnings as 1.9.4. The 1.9.4 `style.all` set is listed rule by rule in `biome.json`, the migrate and the pure-tool reformat are separate commits, and the reformat SHA is in `.git-blame-ignore-revs`.**

## Performance

- **Duration:** about 5 min
- **Started:** 2026-11-12T18:35:42Z
- **Completed:** 2026-11-12T18:40:30Z
- **Tasks:** 2
- **Files modified:** 26

## Accomplishments

- `@biomejs/biome` is pinned at 2.5.15. `bun run lint` exits 0 with `Found 36 warnings.` and the same tally and locations as the 1.9.4 baseline.
- `biome.json` is on the Biome 2 schema (`files.includes`, `preset`), and every style rule that 1.9.4's `style.all` enabled is named at its 1.9.4 severity. Nothing was turned off and no new Biome 2 style rule was enabled.
- `lint:fix` is `biome check --write --unsafe .`. `@biomejs/biome` is out of `trustedDependencies`, and `bun pm untrusted` still reports 0.
- The reformat commit is byte-for-byte `biome check --write .` output and is listed in `.git-blame-ignore-revs`.

## Task Commits

| Step | Commit | Full SHA |
|------|--------|----------|
| Fix (noUselessUndefinedInitialization) | `de60381` refactor(18-03): drop a redundant undefined initializer Biome 2 flags | de60381eddea30e1dd9d8e9a54d10b71e6ef9bda |
| Migrate (config only) | `597be9a` build(18-03): Biome 2.5.15 with biome migrate (config only) | 597be9a60d7ff03ad038f957d35a694c4ed5c7f6 |
| Reformat (tool output only) | `86e09f1` the Biome 2.5.15 reformat commit | 86e09f13589ebcbd3e14e8f6a998723e707ae167 |
| Blame-ignore | `28d4994` chore(18-03): ignore the Biome 2.5.15 reformat in git blame | 28d49948361f1c627f2f60d58a3ea0b4345ee526 |
| Docs | `2b6ccff` docs(18-03): Biome 2.5.15, lint:fix and the blame-ignore file | 2b6ccff4caed0ef9b99b010aaa26be541a421921 |

## Lint at each commit

- **Fix commit (`de60381`), Biome 1.9.4:** exit 0, `Found 36 warnings.`
- **Migrate commit (`597be9a`), Biome 2.5.15:** **red by design.** `Found 20 errors.` and `Found 36 warnings.`, with no info diagnostics:
  - 17 `assist/source/organizeImports`
  - 3 `format`: root `package.json`, `apps/server/package.json`, `BusDataRepository.ts`
  - 30 useFilenamingConvention, 1 useNamingConvention (`config/axios.ts:8`), 2 useThrowOnlyError (`BusRouteController.test.ts:152,268`), 3 suppressions/unused (`BusRouteController.test.ts:150,266`, `vitest.config.mts:5`). These are the 1.9.4 baseline locations.
  - The plan's planning run counted 21 errors (4 format). `biome.json` was already formatted inside this commit, so it is not among them.
  - D-10 requires the migrate and the reformat to be separate commits, and that conflicts with D-01's green lint at every commit. **Call this out in the PR description:** lint is red at this one commit only. Tests (853), typecheck and build passed there.
- **Reformat commit (`86e09f1`) and later:** `bun run lint` exits 0 with `Found 36 warnings.` The tally is 30 `lint/style/useFilenamingConvention`, 1 `lint/style/useNamingConvention`, 2 `lint/style/useThrowOnlyError` and 3 `suppressions/unused`, the same as 18-01's baseline.

## Files the reformat changed (20)

- `package.json`, `apps/server/package.json`: the formatter expanded their arrays
- `apps/server/src/api/repositories/BusDataRepository.ts`: two parameter type literals are now wrapped
- `apps/server/src/config/index.ts`: the `./axios` re-export moved to the top. This changes module evaluation order; the suite and the boot smoke show it is neutral.
- `apps/server/src/test/streamClient.ts`: imports sorted
- Imports sorted in 15 test files:
  - `controllers/PredictionStreamController.test.ts`
  - `middleware/streamConcurrencyCap.test.ts`, `middleware/upstreamRateLimit.test.ts`
  - `routes/alertHygiene.test.ts`, `dataBootRetry.test.ts`, `dataReload.test.ts`, `dataReloadStream.test.ts`, `healthRoutes.test.ts`, `predictionRoutes.test.ts`, `rateLimit.test.ts`, `streamCap.test.ts`, `trustProxy.test.ts`, `upstreamTimeout.test.ts`
  - `services/HealthService.test.ts`, `services/StopService.test.ts`

## Files Created/Modified

- `biome.json`: Biome 2 schema with the named 1.9.4 style set
- `package.json`, `bun.lock`: Biome 2.5.15, the new `lint:fix`, and the trust list without `@biomejs/biome`
- `apps/server/src/api/controllers/PredictionStreamController.ts`: `let unsubscribe: (() => void) | null = null;`
- `.git-blame-ignore-revs` (new): a comment line plus `86e09f13589ebcbd3e14e8f6a998723e707ae167`
- `.claude/CLAUDE.md`, `AGENTS.md`: the Biome 2.5.15 stack line, the `lint:fix` command and the `blame.ignoreRevsFile` hint
- The 20 reformatted files listed above

## Rules turned off

None. No Biome 2 rule needed turning off.

No Biome 2 entry exists for:
- `useShorthandArrayType`: folded into `useConsistentArrayType`, which is set to warn
- `useSingleCaseStatement`: removed, with no successor

## Decisions Made

See `key-decisions` in the frontmatter. The one that differs from the plan is the null sentinel, covered under Deviations.

## D-02: merge with a merge commit

**The Phase 18 PR must be merged with a merge commit.** A squash or rebase merge rewrites `86e09f1`, and blame then stops skipping the reformat. `gh api repos/tejas-rawal/dash-tracker --jq .allow_merge_commit` printed `true`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planned fix commit would have broken Biome 1.9.4 lint**
- **Found during:** Task 1, commit 1
- **Issue:** The plan said to drop the initializer so line 25 reads `let unsubscribe: (() => void) | undefined;`. Biome 1.9.4 then reports a `lint/style/useConst` error at `PredictionStreamController.ts:25`, which is a false positive: the `cleanup` closure reads the variable before its single later assignment. Lint would have been red at the fix commit. The plan assumed it would stay at 36 warnings, and D-01 requires green.
- **Fix:** `let unsubscribe: (() => void) | null = null;`
  - Biome 1.9.4 stays at 36 warnings, because the variable is now assigned twice.
  - Biome 2.5.15 raises nothing on the line, because it is not an `undefined` initializer.
  - The `!unsubscribe` guard behaves the same.
- **Files modified:** `apps/server/src/api/controllers/PredictionStreamController.ts`
- **Verification:**
  - At `de60381`: 853 tests pass, typecheck and build pass, and 1.9.4 lint shows 36 warnings.
  - Biome 2.5.15 at `597be9a`: no info or lint diagnostic on that file.
- **Committed in:** `de60381`

**2. [Rule 1 - Bug] The blame-ignore commit's message broke the plan's `--grep` lookups**
- **Found during:** Task 2 verify
- **Issue:** The first blame-ignore commit quoted the reformat subject in its body. `git log -1 --grep='style(18-03): reformat with Biome 2.5.15'` then resolved to the blame-ignore commit, not the reformat, so the blame check and the commit-order check would fail.
- **Fix:** A soft reset of the two unpushed commits; nothing was pushed. They were recommitted (`28d4994`, `2b6ccff`), and the body now names the reformat by its short SHA. The reformat commit and the `.git-blame-ignore-revs` content did not change.
- **Verification:** `blame ignores the reformat` and `commit order ok` both print.

**3. [Plan verify defect, not a code change] `test:coverage` tail window**
- The plan's coverage check runs `tail -n 25 | grep 'Tests 853 passed'`. The coverage table prints after the Tests line, so the window misses it.
- In the full output, `Tests  853 passed (853)` appears and the run exits 0 (98.68% statements / 96.8% branches / 98.42% functions / 98.68% lines). Typecheck, build and the boot smoke (`{"status":"ok"} boot smoke ok`) were run separately.

---

**Total deviations:** 2 auto-fixed (both Rule 1), plus 1 verify-command note.
**Impact on plan:** The fix commit is a null sentinel instead of a bare `let`. Everything else matches the plan. No scope creep.

## Issues Encountered

None beyond the deviations. `.planning/config.json` and `.planning/milestone.lock` had uncommitted changes from before the plan and were left alone and uncommitted.

## User Setup Required

None. For local blame, run `git config blame.ignoreRevsFile .git-blame-ignore-revs` once (optional).

## Next Phase Readiness

- The toolchain is final: Node 24, tsx, TypeScript 6 and Biome 2.5.15. The CORS plans (18-04 onward) can be written in Biome 2 style.
- PR note: say that lint is red at `597be9a` only (D-10 vs D-01), and merge with a merge commit (D-02).

---
*Phase: 18-server-toolchain-cors*
*Completed: 2026-11-12*

## Self-Check: PASSED

- All modified and created files exist: `biome.json`, `package.json`, `bun.lock`, `.git-blame-ignore-revs`, `.claude/CLAUDE.md`, `AGENTS.md`, `PredictionStreamController.ts`.
- Commits `de60381`, `597be9a`, `86e09f1`, `28d4994` and `2b6ccff` are ancestors of HEAD.
- Every Task 1 and Task 2 verify line printed: biome 2 lint at baseline, style set restored, package.json ok, commit order ok, reformat is tool-only, boot smoke ok, blame ignores the reformat, docs ok, merge commits allowed.
