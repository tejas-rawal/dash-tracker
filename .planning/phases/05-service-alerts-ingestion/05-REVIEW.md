---
phase: 05-service-alerts-ingestion
reviewed: 2026-09-02T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/server/api/services/ServiceAlertService.ts
  - src/server/api/models/ServiceAlert.ts
  - src/server/api/services/ServiceAlertService.test.ts
  - src/server/api/repositories/ServiceAlertRepository.test.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-09-02T00:00:00Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This review is scoped to the source changes made by plan `05-03` (gap closure `G-05-2`): a `JSON.parse` fallback for a string-encoded `response.data` in `ServiceAlertService.fetchFromDashApi()`, and the `entity` → `entities` field rename in `DashAlertsApiResponse`/`fetchAlerts()`, plus the corresponding test updates. It supersedes the WR-01/WR-02 findings in this file's prior revision (dated 2026-09-01), which were already resolved by plan `05-02`'s malformed-body/malformed-entity guards; those guards are retained and correctly re-keyed to `entities` by this plan.

Verified independently: `bun run test -- src/server/api/services/ServiceAlertService.test.ts src/server/api/repositories/ServiceAlertRepository.test.ts src/server/api/services/ServiceAlertPollService.test.ts` passes 34/34, and `bun run build` (`tsc` strict) succeeds clean. No lingering `response.entity`/`entity:`-keyed top-level references remain anywhere in `src/server/api/`. The core fixes are correct and match the plan's stated intent: a JSON-encoded string body is now parsed and mapped correctly, the pre-existing WR-01 null-body/invalid-JSON guards still throw `UpstreamApiError` unmodified, and the live API's actual `entities` field is now read end-to-end.

No blocker-level defects were found in the new logic itself. Two warnings and two info items below are robustness/documentation-accuracy gaps worth addressing, one of which (WR-01 below) is directly relevant because it reproduces the exact failure class — a malformed upstream body silently resolving to "no alerts" instead of failing loud — that this very gap-closure plan exists to prevent.

## Warnings

### WR-01: Body-shape guard accepts a JSON array root, contradicting the plan's own threat-model claim and reintroducing a silent-data-loss path

**File:** `src/server/api/services/ServiceAlertService.ts:37-40`
**Issue:** After the new `JSON.parse` fallback, the guard is `body === null || typeof body !== "object"`. In JavaScript, `typeof []` is `"object"`, so a `response.data` that is (or JSON-parses to) a bare array — e.g. `response.data = "[]"` or `response.data = []` — passes this guard undetected. `body` is then cast to `DashAlertsApiResponse` and returned; `fetchAlerts()` reads `response.entities` on an array, which is `undefined`, so it silently logs "No service alerts found in API response" and resolves to `[]` instead of throwing `UpstreamApiError`.

This directly contradicts 05-03-PLAN.md's own STRIDE mitigation text for T-05-01, which claims: *"a string that parses to a non-object JSON value (array-at-root, primitive, or invalid JSON) still throws `UpstreamApiError` exactly as before"* — that claim is false for the array-at-root case, and no test in `ServiceAlertService.test.ts` exercises it (only the invalid-JSON-string and `null` cases are covered). The failure mode this produces — a malformed/unexpected upstream shape silently degrading to "zero alerts" rather than failing loud — is precisely the class of live-breaking bug (`entity`/`entities` mismatch) this plan was created to close for the top-level field; the same silent-degradation risk now exists one level up, at the body-shape check itself, and is unverified by any test.
**Fix:**
```ts
if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new UpstreamApiError("DASH API returned a malformed service alerts response (body is not an object)");
}
```
Add a regression test asserting `data: "[]"` (or `data: []`) rejects with `UpstreamApiError`.

### WR-02: Two distinct failure modes collapse into one duplicated, non-descriptive error message

**File:** `src/server/api/services/ServiceAlertService.ts:31-33`, `38`
**Issue:** The `catch` block for a `JSON.parse` failure (invalid JSON string) and the subsequent non-null/`typeof`-object guard (valid JSON that isn't an object, or a non-string non-object body) both throw `new UpstreamApiError("DASH API returned a malformed service alerts response (body is not an object)")` — the exact same literal string, duplicated verbatim in two places. Collapsing "the body wasn't valid JSON at all" and "the body parsed fine but isn't an object" into one indistinguishable log message reduces operational diagnosability for exactly the kind of live-API surprise this gap-closure plan was written to debug (`.planning/debug/service-alerts-malformed-body.md` describes multi-step manual diagnosis required because the original error message didn't distinguish root causes). This is a deliberate choice per the plan's action text, but it reproduces the same log-message ambiguity that made G-05-2 take a dedicated debug session to diagnose.
**Fix:** Extract the shared literal to a local constant to prevent drift, and consider distinguishing the two messages for future debuggability:
```ts
const MALFORMED_BODY_MESSAGE = "DASH API returned a malformed service alerts response (body is not an object)";
// ...
} catch {
    throw new UpstreamApiError(`${MALFORMED_BODY_MESSAGE} — string body failed JSON.parse`);
}
// ...
if (body === null || typeof body !== "object") {
    throw new UpstreamApiError(MALFORMED_BODY_MESSAGE);
}
```

## Info

### IN-01: Stale "entity" wording left in test titles after the entities rename

**File:** `src/server/api/services/ServiceAlertService.test.ts:54`, `66`
**Issue:** The `entity` → `entities` rename (Task 2) updated the `makeDashAlertsApiResponse` factory and four inline fixtures per the plan's explicit list, but two pre-existing test titles were not updated and now describe a field name that no longer exists in the codebase: `"resolves to an empty array when the response has entity: []"` (line 54) and `"logs a warning and resolves to an empty array when entity is undefined"` (line 66). Both tests still pass and exercise the correct (`entities`) behavior — this is a naming/documentation drift only, but it will confuse a future reader grepping test titles for the current field name.
**Fix:** Rename both titles to reference `entities`, e.g. `"resolves to an empty array when the response has entities: []"` and `"logs a warning and resolves to an empty array when entities is undefined"`.

### IN-02: `DashAlertsApiResponse.entities` is typed as required but is treated as optional at runtime

**File:** `src/server/api/models/ServiceAlert.ts:59`
**Issue:** `entities: DashAlertEntity[]` declares the field as always present, yet `fetchAlerts()` explicitly checks `response.entities === undefined` and treats that as a valid "no alerts" case rather than a type error. This mismatch between the declared type and the actual runtime contract predates this plan (the same shape existed for the singular `entity` field) and was carried through unchanged by the rename, so it isn't a regression, but it means `tsc` can't catch a caller that forgets to guard against a missing `entities` field — the type says it's always there.
**Fix:** Change the type to `entities?: DashAlertEntity[]` so the type system reflects the documented "undefined means no alerts" branch in `fetchAlerts()`.

---

_Reviewed: 2026-09-02T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
