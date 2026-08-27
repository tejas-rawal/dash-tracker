---
quick_id: 260827-jaa
mode: quick
---

# Plan: Consolidate CLAUDE.md into .claude/CLAUDE.md

## Task 1: Merge unique content from root CLAUDE.md into .claude/CLAUDE.md

- files: .claude/CLAUDE.md
- action:
  - In the `<!-- GSD:project-start -->` block, remove "**Core Value:**" and "### Constraints"
    (already superseded — root CLAUDE.md's Engineering Principles is the replacement).
  - Add a "## Testing" section (Vitest framework, setup.ts, vi.mock, test factories, 80%
    coverage threshold) — this content exists only in root CLAUDE.md today.
  - Add the single-test-file command (`bun run test -- <path>`) to the existing "## Commands"
    section — also unique to root CLAUDE.md.
  - Add a "## Engineering Principles" section with the 7 bullets already present in root
    CLAUDE.md, placed after the Architecture section.
  - Do not touch other GSD-managed marker blocks (Stack/Conventions/Architecture/Skills/
    Workflow/Profile) beyond what's listed above — their content is already accurate and
    root CLAUDE.md's overlapping content (e.g. Prettier references) is stale by comparison.
- verify: `grep -c "Core Value" .claude/CLAUDE.md` returns 0; `grep -c "Engineering Principles"
  .claude/CLAUDE.md` returns 1; `grep -c "## Testing" .claude/CLAUDE.md` returns 1
- done: .claude/CLAUDE.md is self-sufficient — contains everything a reader needs, nothing
  from root CLAUDE.md is lost

## Task 2: Remove root CLAUDE.md

- files: CLAUDE.md
- action: Delete the file — .claude/CLAUDE.md is now the single canonical project-instructions
  file.
- verify: `test -f CLAUDE.md` fails (file absent)
- done: Only one CLAUDE.md-equivalent file remains in the repo
