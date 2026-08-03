# Shipment Tracker — Agent Instructions

These instructions apply to every session and every agent/subagent working in this repository — new
chat or old, top-level session or dispatched subagent. They override any conflicting step written in a
plan document under `docs/`.

## Git: commit and push are human-only

No agent or subagent may run `git commit` or `git push` (or any equivalent, e.g. `gh pr create` that
implies a push) in this repository. Staging, committing, and pushing to any remote are done exclusively
by the project owner.

- Prepare and verify changes as usual (tests, typecheck, lint, build).
- Leave the working tree with the changes present but uncommitted, and stop there.
- If a plan document (e.g. `docs/superpowers/plans/*.md`) includes a "Commit" step with a
  `git commit`/`git push` command, treat it as informational only — do not execute it. Report exactly
  what would be committed (files + suggested message) and let the user run `git add` / `git commit` /
  `git push` themselves.
- When dispatching implementer, fix, or reviewer subagents that touch this repo, pass this constraint
  through explicitly in the dispatch prompt — it does not apply automatically just because it's written
  here, a fresh subagent only sees what its prompt includes.

**Why:** a fix subagent pushed a commit to `origin/main` unprompted on 2026-07-23. The project owner
does not want that repeated — they want to review and control every commit and push themselves.
