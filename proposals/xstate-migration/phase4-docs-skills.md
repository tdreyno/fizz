# Phase 4 Handoff — Docs & Skills (Generic XState → Fizz)

Run order: 4 of 4. **Depends on Phases 1-3** (it documents the APIs they ship).
Deliver a generic XState → Fizz migration guide (not novation-specific) and sync skills/API references.

## Objective

Make adoption easy: a single narrative migration guide mapping every XState concept to its Fizz equivalent,
plus updated reference docs/skills for the new APIs (`route().when().otherwise()`/`getRouteMetadata`, `getStatePath`/`currentStatePath`,
`onTransition`/`getFlow`/`getVisitedStateNames`/`lastAction`, `useTransition`).

## Locked decisions

- The guide is **generic** XState → Fizz. Do not reference the novation codebase. Use small, runnable, self-contained examples.

## Files

- CREATE `docs/migrating-from-xstate.md`
- EDIT `SUMMARY.md` — add the guide (new "Migrating" section near the top, or under Advanced). Use relative links.
- EDIT `docs/api.md` — document the new public APIs from Phases 1-3.
- EDIT `skills/fizz/references/core-runtime.md` — routing helpers, composed path, history/flow/`onTransition`/`lastAction`.
- EDIT `skills/fizz/references/react-integration.md` — `useTransition` and observer action access.
- EDIT `skills/fizz/references/examples.md` — add a `route()` routing example + imperative run-to-completion flow capture.
- REVIEW `skills/fizz/SKILL.md` — update if it maintains a public API list.

## Guide content (`docs/migrating-from-xstate.md`)

Follow the repo Docs Authoring rules: name the problem first, then the pattern, then a worked example.
Prefer one strong worked example per concept. Sections:

1. Why migrate / philosophy contrast (typegen-free inference, explicit effects, built-in async cancel). Pull from proposal §6.
2. Concept mapping table (adapt proposal §3 table) — XState concept → Fizz equivalent → notes.
3. Worked recipes:
   - Transient `always` + ordered `cond` → `state({ Enter: route().when(...).otherwise(...) })` (Phase 1).
   - Promise `invoke` + `onDone`/`onError` → `customJSONAsync(...).chainToAction(resolve, reject)` and `waitState(...)`.
   - `onError` branch by error code → reject handler + `matchOn(classifier, cases)` (note: no default case; classify explicitly).
   - Side-effecting actions → explicit `effect(...)` / `output(...)`.
   - Hierarchical "mode + sub-step" → `stateWithNested` recipe + child-entry helper + `getStatePath` (Phase 2).
   - Imperative `interpret(...)` → `createRuntime(...)` + `run(enter())` + `waitUntilState(matchAny(matchState(A), matchState(B)))`.
   - Transition logging / flow telemetry → `onTransition`, `getFlow()`, `getVisitedStateNames()`, `lastAction()` (Phase 3).
   - React `createActorContext` + `useActor`/`useSelector` → `createMachineContext` + `machine.selectors`/`useSelector`/`useTransition`.
4. "What Fizz models differently / not 1:1" — parallel via `createParallelMachine`; no `spawn`/actor model; no deep `#id.a.b` targeting (use mode + sub-step); guards are explicit, not config.
5. Cross-links / "What to read next".

## Accuracy guardrails (verified against source — keep correct)

- `connectExternalSnapshot` and `selectWhen` live in `@tdreyno/fizz`, **not** fizz-react.
- `useSelector` takes a `MachineHandle` (from `useMachine(..., { disableAutoSelectors: true })`), not a plain `ContextValue`.
- `matchOn` has **no** default/fallback case — the classifier must return a present key.
- Base examples on real source/tests where possible.

## Verification

- Prettier: `npm exec -- prettier --write docs/migrating-from-xstate.md docs/api.md SUMMARY.md skills/fizz/references/*.md`
  (Note: the `.github` Prettier exception in `preferences.md` does not apply here.)
- Verify all new internal markdown links resolve (paths exist).
- Confirm every API mentioned actually exists after Phases 1-3 (no aspirational APIs).
- Sonar: not applicable to markdown, but if config requires, run end-of-task analysis on changed files.

## Scope boundaries

- IN: new guide, SUMMARY/api updates, skills references sync, examples.
- OUT: any source code changes (all in Phases 1-3); novation-specific content.

## Done when

Guide complete and linked from SUMMARY; `api.md` + skills references mention all new APIs accurately; prettier clean; links resolve.
