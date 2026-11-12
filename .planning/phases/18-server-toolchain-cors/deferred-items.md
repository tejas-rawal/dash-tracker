# Phase 18 Deferred Items

- **18-04 RED evidence carries the machine hostname** (found during 18-06): `.planning/phases/18-server-toolchain-cors/.tdd/18-04-red-junit.xml` and the `output` field of `18-04-red.json` were committed with the JUnit `hostname="…"` attribute unredacted. 18-06's own evidence files are redacted (`hostname="redacted"`). Out of 18-06's scope, so not changed here. The fix is a one-line `sed` on both 18-04 files in a docs commit. History still holds the old value unless it is rewritten.
