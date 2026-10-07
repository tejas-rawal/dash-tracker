---
status: testing
phase: 15-alert-nearby-data-hygiene
source: [15-VERIFICATION.md]
started: 2026-10-07T19:17:14Z
updated: 2026-10-07T19:17:14Z
---

## Current Test

number: 1
name: Decide CR-01 — structurally malformed alert fails the whole alert poll
expected: |
  Pick one. (a) Accept: record that structural breaks fail the whole poll (as D-07 already does for an
  id-less entity) via an override for the "structural alert malformation" item or a D-16 in 15-CONTEXT.md.
  (b) Reject: schedule gap closure with /gsd-plan-phase 15 --gaps so a structurally malformed entity is
  dropped-and-warned per alert, like a bad date.
awaiting: user response

## Tests

### 1. Decide CR-01 — structurally malformed alert fails the whole alert poll
expected: activePeriods [null]/{}/5/"abc" or informedEntities [null]/{} currently make fetchAlerts() reject with a TypeError, so the previous snapshot (possibly incl. since-deleted alerts) keeps serving. Accept (record decision) or reject (gap-closure plan).
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps
