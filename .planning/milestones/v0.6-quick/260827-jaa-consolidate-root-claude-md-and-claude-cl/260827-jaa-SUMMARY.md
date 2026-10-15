---
quick_id: 260827-jaa
status: complete
---

# Summary: Consolidate CLAUDE.md into .claude/CLAUDE.md

- Removed root `CLAUDE.md` — the two files were both being loaded as project instructions
  on every session and had started drifting (root still referenced Prettier commands that
  no longer exist per `package.json`; `.claude/CLAUDE.md` was accurate).
- Merged the two facts unique to root `CLAUDE.md` into `.claude/CLAUDE.md`: the single-test-file
  command (added to `## Commands`) and a new `## Testing` section.
- Added `## Engineering Principles` to `.claude/CLAUDE.md` (same 7 bullets from the prior
  quick task), placed after the Architecture section.
- Removed the stale "Core Value"/"Constraints" sub-section from `.claude/CLAUDE.md`'s
  `GSD:project-start/end` block.
- `.claude/CLAUDE.md` is now the single canonical project-instructions file.
