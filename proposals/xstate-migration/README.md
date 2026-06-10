# XState → Fizz Migration: Implementation Plan

This directory turns the gap analysis in [`../fizz-xstate.md`](../fizz-xstate.md) into an
actionable, ordered implementation plan. Each phase is a self-contained handoff document that can
be picked up and executed independently.

## Goal

Close the five gaps that add friction when migrating XState machines to Fizz, and ship a generic
XState → Fizz migration guide so adoption is easy.

| Gap  | Description                                                           | Phase                                  |
| ---- | --------------------------------------------------------------------- | -------------------------------------- |
| G1   | Declarative guarded transient transitions (`always` + ordered `cond`) | [Phase 1](phase1-routing.md)           |
| G3   | Hierarchical nesting + deep target ergonomics                         | [Phase 2](phase2-path-nesting.md)      |
| G5a  | Dotted hierarchical path string for the current state                 | [Phase 2](phase2-path-nesting.md)      |
| G4   | Telemetry-grade transition history / flow capture                     | [Phase 3](phase3-history-observers.md) |
| G5b  | Access to the triggering action from observers                        | [Phase 3](phase3-history-observers.md) |
| Docs | Generic XState → Fizz migration guide + skills/API sync               | [Phase 4](phase4-docs-skills.md)       |

## Locked decisions

1. `route()` with no matching branch and no `otherwise()` stays put (returns `undefined`, no
   transition). It does **not** emit a dev warning and does **not** throw. An empty `route()` always stays.
2. G3 is solved with a documented "mode + sub-step" recipe plus a small child-entry helper. Full
   deep string-path targeting (`#id.a.b`) is intentionally **not** implemented.
3. G5b is delivered with an additive `onTransition(fn)` runtime API and a new `useTransition` React
   hook. The existing `onContextChange(fn)` signature is left unchanged.
4. Breaking changes are permitted but the plan favors additive APIs.

## Run order

Phases are numbered in their intended execution order. Phase 1 and Phase 2 are independent of each
other; Phase 3 uses the path helper from Phase 2; Phase 4 documents the APIs shipped in Phases 1–3.

1. [Phase 1 — G1 declarative guarded transient transitions](phase1-routing.md)
2. [Phase 2 — G5a composed state path + G3 nested ergonomics](phase2-path-nesting.md)
3. [Phase 3 — G4 flow history + G5b triggering action](phase3-history-observers.md)
4. [Phase 4 — docs & skills (generic XState → Fizz)](phase4-docs-skills.md)

## Per-phase workflow

Every phase follows the repository conventions in `preferences.md` and `.github/copilot-instructions.md`:

- Red/green TDD: write a failing test first, implement the smallest change to pass, then refactor.
- Validate with the package-scoped commands listed in each handoff (test, typecheck, lint, prettier).
- Run the SonarQube workflow: disable automatic analysis at the start, analyze the edited file list at
  the end, then re-enable automatic analysis.
- Never run `git push` or modify PRs without explicit confirmation.
