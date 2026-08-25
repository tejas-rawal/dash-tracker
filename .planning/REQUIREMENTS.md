# Requirements: dash-tracker (Tooling Cleanup)

**Defined:** 2026-08-25
**Core Value:** A single, unambiguous command for linting and formatting — no redundant tools, no drift between what CI checks and what a contributor runs locally.

## v1 Requirements

Requirements for this milestone. Each maps to roadmap phases.

### Tooling

- [ ] **TOOL-01**: Biome is the sole tool for both linting and formatting (`biome check` / `biome check --write`)
- [ ] **TOOL-02**: Prettier, `@jonahsnider/prettier-config`, and `prettier-plugin-packagejson` are fully removed (dependency, config file, and any plugin references)
- [ ] **TOOL-03**: `package.json` scripts (`lint`, `lint:fix`, `format`, `format:write`) are updated to reflect the single-tool Biome flow
- [ ] **TOOL-04**: Full codebase passes the new Biome formatter with zero outstanding diffs, landed as its own commit separate from the config/dependency change

## v2 Requirements

None — feature work is deferred to a future milestone, scope not yet decided.

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New feature work (bus route/prediction endpoints, etc.) | Deferred to a future milestone — not part of this cleanup |
| Replacing `tsc` as the build tool (e.g. Vite, esbuild) | Vite is a frontend bundler/dev server; poor fit for compiling this Node/Express backend. Not a lint/format concern. |
| Replacing Vitest | Test runner only, unrelated to lint/format consolidation |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| TOOL-01 | Phase 1 | Pending |
| TOOL-02 | Phase 1 | Pending |
| TOOL-03 | Phase 1 | Pending |
| TOOL-04 | Phase 2 | Pending |

**Coverage:**
- v1 requirements: 4 total
- Mapped to phases: 4 ✓
- Unmapped: 0

---
*Requirements defined: 2026-08-25*
*Last updated: 2026-08-25 after roadmap creation*
