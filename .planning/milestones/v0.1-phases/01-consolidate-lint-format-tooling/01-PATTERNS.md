# Phase 1: Consolidate Lint & Format Tooling - Pattern Map

**Mapped:** 2026-08-25
**Files analyzed:** 8 (all existing config files being edited in place, plus 2 files to delete)
**Analogs found:** N/A — this is a config-consolidation phase, not new-code creation. There are no controller/service/model analogs to copy patterns from. Instead, this document captures the exact current-state content of each file so the planner can diff against target state precisely.

## File Classification

| File | Role | Data Flow | Action | Notes |
|------|------|-----------|--------|-------|
| `package.json` | config | transform (edit in place) | modify | remove `prettier` field, rewire `format`/`format:write` scripts, remove 3 devDependencies |
| `biome.json` | config | transform (edit in place) | modify | remove `**/package.json` from `files.ignore` |
| `.prettierrc` | config | n/a | delete | only sets `plugins: ["prettier-plugin-packagejson"]` |
| `.prettierignore` | config | n/a | delete | last block already documents the `**/package.json` carve-out being closed |
| `.vscode/settings.json` | config | transform (edit in place) | modify | global `editor.defaultFormatter` → `biomejs.biome` |
| `.vscode/extensions.json` | config | transform (edit in place) | modify | remove `esbenp.prettier-vscode` from `recommendations` |
| `bun.lockb` | config (binary lockfile) | batch (regenerate) | modify | regenerate via `bun install` after devDependency removal |
| `package-lock.json` | config (lockfile) | batch (regenerate) | modify | regenerate via `npm install` (or equivalent) to stay consistent with `package.json` per CLAUDE.md |

No source-code files (controllers/services/models/routes) are touched by this phase — it is entirely tooling/config. No codebase analog search was needed; the "pattern" here is the exact current content of each file, shown below, which the planner edits directly.

## Pattern Assignments

### `package.json` (config, edit in place)

**Current full content:**
```json
{
	"name": "dash-tracker",
	"version": "0.0.1",
	"author": {
		"name": "Tejas Rawal",
		"url": "https://dashbus.obaweb.org/tracker"
	},
	"repository": {
		"type": "git",
		"url": "git+https://github.com/tejas-rawal/dash-tracker.git"
	},
	"main": "./dist/index.js",
	"exports": "./dist/index.js",
	"bugs": {
		"url": "https://github.com/tejas-rawal/dash-tracker/issues"
	},
	"description": "DASH bus tracker app",
	"keywords": ["dash", "bus", "tracker"],
	"license": "Apache-2.0",
	"packageManager": "bun@1.0.31",
	"prettier": "@jonahsnider/prettier-config",
	"private": true,
	"scripts": {
		"lint": "biome check .",
		"lint:fix": "biome check . --apply-unsafe",
		"build": "rm -rf dist && tsc",
		"format": "prettier --check .",
		"format:write": "prettier --check . --write",
		"test": "vitest --run --typecheck",
		"test:coverage": "vitest --run --typecheck --coverage",
		"start-server": "ts-node src/server/app.ts",
		"dev-server": "nodemon --exec ts-node src/server/app.ts"
	},
	"types": "./dist/index.d.ts",
	"dependencies": {
		"@types/express": "^5.0.0",
		"@types/winston": "^2.4.4",
		"axios": "^1.7.9",
		"dotenv": "^16.4.7",
		"zod": "^3.24.0",
		"express": "^4.21.2",
		"nodemon": "^3.1.9",
		"ts-node": "^10.9.2",
		"winston": "^3.17.0"
	},
	"devDependencies": {
		"@biomejs/biome": "^1.9.4",
		"@jonahsnider/prettier-config": "1.1.2",
		"@tsconfig/node20": "20.1.4",
		"@tsconfig/strictest": "2.0.5",
		"@types/node": "20.17.6",
		"@types/supertest": "^7.2.0",
		"@vitest/coverage-v8": "2.1.5",
		"prettier": "3.3.3",
		"prettier-plugin-packagejson": "2.5.3",
		"supertest": "^7.2.2",
		"tsx": "4.19.2",
		"typescript": "^5.7.3",
		"vitest": "2.1.5"
	}
}
```

**Required edits (per CONTEXT.md D-01, D-04):**
1. Delete the top-level `"prettier": "@jonahsnider/prettier-config"` field entirely.
2. Rewire scripts:
   - `"format": "prettier --check ."` → `"format": "biome check ."`
   - `"format:write": "prettier --check . --write"` → `"format:write": "biome check . --write"`
   - Note existing `lint`/`lint:fix` already use `biome check .` / `biome check . --apply-unsafe` — leave as is, these are the reference pattern for what the new `format`/`format:write` scripts should mirror in style (bare `biome check .` for check-only, additional flag for the write variant).
3. Remove from `devDependencies`: `@jonahsnider/prettier-config`, `prettier`, `prettier-plugin-packagejson` (3 entries).
4. All other fields/scripts/dependencies remain untouched.

---

### `biome.json` (config, edit in place)

**Current full content:**
```json
{
    "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
    "files": {
        "ignore": ["node_modules", "dist", "coverage", "**/package.json"]
    },
    "formatter": {
        "formatWithErrors": true,
        "lineWidth": 120,
        "indentStyle": "space",
        "indentWidth": 4
    },
    "javascript": {
        "formatter": {
            "jsxQuoteStyle": "single",
            "quoteStyle": "double"
        }
    },
    "json": {
        "parser": {
            "allowComments": true
        }
    },
    "linter": {
        "rules": {
            "recommended": true,
            "nursery": {
                "all": false
            },
            "style": {
                "all": true,
                "noParameterProperties": "off",
                "noDefaultExport": "off"
            },
            "suspicious": {
                "noExplicitAny": "info"
            }
        }
    }
}
```

**Required edit (per CONTEXT.md D-01):**
- Change `"files": { "ignore": ["node_modules", "dist", "coverage", "**/package.json"] }` to `"files": { "ignore": ["node_modules", "dist", "coverage"] }` — remove the `**/package.json` entry so `biome check --write` covers `package.json` like every other file.
- Formatter block (`lineWidth: 120`, `indentStyle: "space"`, `indentWidth: 4`, `quoteStyle: "double"`) already matches what `@jonahsnider/prettier-config` enforced — confirmed no changes needed here (this is the "tooling swap, not a style change" requirement being satisfied — nothing to do, just verify it stays as is).

---

### `.prettierrc` (delete)

**Current full content:**
```json
{
	"plugins": ["prettier-plugin-packagejson"]
}
```

**Action:** Delete this file entirely. No replacement needed — Biome's `json` formatter settings in `biome.json` already cover JSON formatting, and `prettier-plugin-packagejson`'s package.json-specific sorting behavior is not being replicated (out of scope per CONTEXT.md, which only requires closing the `files.ignore` gap so Biome formats package.json like any other JSON file).

---

### `.prettierignore` (delete)

**Action:** Delete this file entirely. Its final block:
```
# Biome can format these
**/*.ts
**/*.js
**/*.tsx
**/*.jsx
**/*.cts
**/*.mts
**/*.cjs
**/*.mjs
**/*.json
**/*.jsonc
!**/package.json
```
documents the exact `**/package.json` carve-out that D-01 closes (by removing the corresponding ignore entry in `biome.json`). No content from this file needs to migrate anywhere — `.gitignore` already independently covers build artifacts/OS files that `.prettierignore` also listed (verified via direct comparison of the two files — significant overlap, e.g., `.DS_Store`, `dist`, `coverage`, `node_modules`).

---

### `.vscode/settings.json` (edit in place)

**Current full content:**
```json
{
	"[javascript]": {
		"editor.defaultFormatter": "biomejs.biome"
	},
	"[javascriptreact]": {
		"editor.defaultFormatter": "biomejs.biome"
	},
	"[json]": {
		"editor.defaultFormatter": "biomejs.biome"
	},
	"[jsonc]": {
		"editor.defaultFormatter": "biomejs.biome"
	},
	"[typescript]": {
		"editor.defaultFormatter": "biomejs.biome"
	},
	"[typescriptreact]": {
		"editor.defaultFormatter": "biomejs.biome"
	},
	"editor.defaultFormatter": "esbenp.prettier-vscode",
	"typescript.preferences.importModuleSpecifierEnding": "js",
	"typescript.tsdk": "node_modules/typescript/lib"
}
```

**Required edit (per CONTEXT.md D-02):**
- Change `"editor.defaultFormatter": "esbenp.prettier-vscode"` (the bare top-level key, not inside a language block) to `"editor.defaultFormatter": "biomejs.biome"`.
- Per-language overrides (`[javascript]`, `[javascriptreact]`, `[json]`, `[jsonc]`, `[typescript]`, `[typescriptreact]`) already all point at `biomejs.biome` — CONTEXT.md leaves it to Claude's discretion whether to simplify/remove these now-redundant blocks or leave them. Either is acceptable; if simplifying, remove all 6 language-specific blocks and keep only the global `editor.defaultFormatter` plus the unrelated `typescript.*` settings.

---

### `.vscode/extensions.json` (edit in place)

**Current full content:**
```json
{
	"recommendations": ["editorconfig.editorconfig", "esbenp.prettier-vscode", "redhat.vscode-yaml", "biomejs.biome"]
}
```

**Required edit (per CONTEXT.md D-03):**
- Remove `"esbenp.prettier-vscode"` from the `recommendations` array. Result:
```json
{
	"recommendations": ["editorconfig.editorconfig", "redhat.vscode-yaml", "biomejs.biome"]
}
```

---

### `bun.lockb` (binary lockfile, regenerate)

**Action:** After editing `package.json`'s `devDependencies` (removing `prettier`, `@jonahsnider/prettier-config`, `prettier-plugin-packagejson`), run `bun install` to regenerate `bun.lockb` so it reflects the removal. No manual edits — this is a binary file managed exclusively by the `bun` CLI.

---

### `package-lock.json` (JSON lockfile, regenerate)

**Action:** After the same `package.json` devDependency edits, regenerate `package-lock.json` (e.g., via `npm install`) so it stays consistent with `package.json`, per CLAUDE.md's note that `package-lock.json` is kept for npm compatibility and must not go stale. No manual edits to the file content — let the package manager regenerate it.

## Shared Patterns

### Script naming/invocation convention
**Source:** `package.json` `scripts` block (lines shown above)
**Apply to:** `format` and `format:write` scripts
The existing `lint`/`lint:fix` pair already establishes the target convention:
```json
"lint": "biome check .",
"lint:fix": "biome check . --apply-unsafe"
```
The new `format`/`format:write` scripts should mirror this style exactly, using `biome check .` as the base command with `--write` (not `--apply-unsafe`, since formatting is always "safe") appended for the write variant:
```json
"format": "biome check .",
"format:write": "biome check . --write"
```

### Config-value parity check
**Source:** `biome.json` `formatter` block vs. former `@jonahsnider/prettier-config` settings
**Apply to:** Verification step in the plan, not a code change
Confirm (already confirmed via direct inspection per CONTEXT.md's code_context section) that `biome.json`'s `lineWidth: 120`, `indentStyle: "space"`/`indentWidth: 4`, and `quoteStyle: "double"` match what Prettier previously enforced project-wide, satisfying the "tooling swap, not a style change" constraint. No values need to change in `biome.json`'s formatter block itself.

## No Analog Found

This phase touches only pre-existing config files (edited in place or deleted); there are no new source files requiring a codebase analog. N/A.

## Metadata

**Analog search scope:** N/A (config-only phase; no source-code pattern search performed)
**Files scanned:** `package.json`, `biome.json`, `.prettierrc`, `.prettierignore`, `.vscode/settings.json`, `.vscode/extensions.json`, `.gitignore` (for cross-reference)
**Pattern extraction date:** 2026-08-25
