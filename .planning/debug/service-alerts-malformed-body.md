---
status: resolved
resolution: "String-body JSON.parse fallback and entity->entities rename applied in 05-03. Superseded by the array-root shape fix in 05-06 (see service-alerts-body-shape.md and 05-06-SUMMARY.md) which is the final confirmed live shape."
---

# Debug: G-05-2 — "body is not an object" on live gtfs-rt-alerts/v2

## Symptom

After 05-02 corrected the endpoint path, booting against the live DASH/Swiftly
API now logs:

```
error: Failed to poll service alerts: DASH API returned a malformed service alerts response (body is not an object)
```

This is thrown at `ServiceAlertService.ts:26`, inside `fetchFromDashApi()`:

```ts
const response = await axios.get(url);
if (response.data === null || typeof response.data !== "object") {
    throw new UpstreamApiError("DASH API returned a malformed service alerts response (body is not an object)");
}
```

## Evidence

User supplied the live response shape for this endpoint:

```json
{
  "header": { "gtfs_realtime_version": "string", "incrementality": "string", "timestamp": 0 },
  "entities": [
    {
      "id": "string",
      "alert": { "active_period": [...], "informed_entity": [...], "cause": "...", "effect": "...", "header_text": [...], "description_text": [...], "url": "..." }
    }
  ]
}
```

Two distinct problems are visible from this evidence, independent of each other:

1. **Top-level key name mismatch.** The code (`DashAlertsApiResponse.entity`,
   `ServiceAlertService.ts:59,84,89,95,101`) reads `response.entity` (GTFS-RT
   protobuf-JSON convention, singular). The live DASH/Swiftly payload uses
   `entities` (plural) at the top level. This mismatch alone would NOT produce
   "body is not an object" — `response.entity === undefined` is handled by an
   early `return []` with a warning log (`ServiceAlertService.ts:84-87`), not a
   throw. So this is a real, confirmed bug (alerts would silently resolve to an
   empty array forever, never surfacing real alerts — violates ALRT-01/03), but
   it is not what's throwing today.

2. **`typeof response.data !== "object"` failing.** For this check to fail,
   `response.data` must be something other than a parsed object — most likely a
   raw string, because axios's default JSON transform only parses when it
   successfully recognizes/parses the body as JSON; some upstream APIs serve a
   `Content-Type` (e.g. `application/octet-stream`, `text/plain`, or a
   protobuf-typed header) that causes axios to leave `response.data` as a raw
   string instead of auto-parsing it. This is the actual proximate cause of the
   observed error, and it is NOT independently confirmed here — the fix must be
   defensive rather than assuming a single specific content-type.

## Root cause

`fetchFromDashApi()` only accepts an already-object `response.data`. It has no
fallback for a JSON-encoded string body (which is what a non-`application/json`
`Content-Type` header from the upstream API produces via axios's default
transform). Combined with the `entity`/`entities` field-name mismatch, alerts
ingestion is broken end-to-end against the live API even after the endpoint
path fix in 05-02.

## Required fix

1. In `fetchFromDashApi()`, when `response.data` is a `string`, attempt
   `JSON.parse` before the object-shape check; only throw `UpstreamApiError`
   if that parse also fails (or the parsed result still isn't a non-null
   object). This makes the guard robust to upstream `Content-Type` variance
   without assuming one specific header value.
2. Rename the top-level field the service reads/types from `entity` to
   `entities` in `DashAlertsApiResponse` (`ServiceAlert.ts:59`) and every call
   site in `ServiceAlertService.ts` (`fetchAlerts()`: the `undefined` check,
   `Array.isArray` check, `.every(isValidDashAlertEntity)`, and the final
   `.map(mapToServiceAlert)`), matching the confirmed live API shape.
3. Add/extend tests in `ServiceAlertService.test.ts` covering: (a) a
   JSON-string response body parses correctly, (b) a response keyed by
   `entities` (not `entity`) maps to `ServiceAlert[]` correctly, (c) existing
   malformed-body/malformed-entity guard tests still pass with the renamed
   field.

## Artifacts

- `src/server/api/services/ServiceAlertService.ts` — `fetchFromDashApi()` (string-body guard), `fetchAlerts()` (field rename: `entity` → `entities`)
- `src/server/api/models/ServiceAlert.ts` — `DashAlertsApiResponse.entity` → `entities`
- `src/server/api/services/ServiceAlertService.test.ts` — new/updated tests per above
