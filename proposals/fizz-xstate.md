# Fizz vs. XState — Gap Analysis from a Production Codebase

**Audience:** Fizz (`@tdreyno/fizz`, `@tdreyno/fizz-react`) maintainers.
**Purpose:** Evaluate real XState machines shipping in the Yahoo Mail "Novation" frontend against Fizz's current API surface, identify which XState patterns Fizz already covers (and where Fizz is stronger), and produce a prioritized list of feature gaps Fizz could close to make it a viable replacement for XState in this class of application.

This document is grounded in actual machines, not generic state-machine theory. The codebase is private, so all relevant XState code is **inlined** below rather than linked; excerpts are lightly trimmed for length but otherwise faithful.

---

## 1. Scope and Method

### Machines evaluated

Three production XState v4 machines, plus their integration code:

| #   | Machine                       | Role                                                                                        | Consumption style                                  |
| --- | ----------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | TAP subscription orchestrator | Decides if push should be active; drives subscribe/unsubscribe against the TAP push service | React, via `@xstate/react` `createActorContext`    |
| 2   | Notification preferences      | Owns local (IndexedDB) storage of per-account notification prefs with a fallback            | React, via `createActorContext`                    |
| 3   | Push-service subscription     | Linear async pipeline: browser PushManager → register → associate, with error recovery      | **Imperative**, via `interpret(...)` outside React |

Supporting integration code:

- TAP React provider — provider, selectors, Redux↔machine bridging
- Notifications React provider/hook
- Push-subscription imperative driver — interpreter, transition-history capture, telemetry
- A generic actor transition logger (reused across machines)

### Explicitly out of scope

- A protractor test-tooling machine that uses `spawn(...)`, callback actors with bidirectional `send`/`receive`, and `after`/delay transitions. It is test infrastructure, not product code, so its advanced-feature usage is noted only briefly in §5 to keep the gap list complete without over-claiming production demand.

### XState surface area actually used across the three production machines

- `createMachine(config, options)` — declarative config-object authoring
- `tsTypes` / typegen (`*.typegen.ts`) for type inference
- Hierarchical/compound states with `initial` + nested `states`
- Deep transition targets via string ids (`#tap.startup.disabled`, `#notifications.enabled.complete`)
- Eventless **transient** transitions (`always`) with **ordered guard fallthrough**
- `final` states
- Promise-based `invoke` services with `onDone` / `onError`
- `onError` branching by **error code** read from `event.data`
- `assign` actions; `entry` / `exit` actions; side-effecting actions
- `cond` guards (incl. guards that read external/browser state)
- Top-level `on` handlers (machine-wide event handling)
- A manual loop-guard counter (`apiRequests` + `requestCountOverLimit`)
- React: `createActorContext`, `useActor`, `useActorRef`, `useSelector`, `withContext`, `EmittedFrom`
- Imperative: `interpret(...)`, `.onTransition(...)`, awaiting a final state, `state.toStrings()`, `state.value`, `state.event.data`

**Not used anywhere in production:** parallel states, history states, `spawn`/child-actor composition, delayed/`after` transitions, activities.

This matters: it means a Fizz migration of this codebase would **not** be blocked by Fizz's lack of (or different model for) parallel/spawn/delay features. The real blockers are smaller and more mundane — see §4.

---

## 2. Per-Machine Analysis

Each section inlines the relevant XState code, explains how the machine maps onto Fizz, gives a short Fizz sketch, and lists gaps surfaced.

### 2.1 TAP subscription orchestrator

**What it does:** On startup, decides whether push notifications should be active, reads stored registration/notify-tags from IndexedDB, and drives subscribe/unsubscribe flows against the TAP push service. Bridges to Redux account state.

#### XState code

The startup region is the crux: a compound state whose children are mostly **eventless decision nodes** (`always` + ordered `cond`) plus one promise `invoke`, terminating in a `final` state.

```typescript
const tapMachine = createMachine(
  {
    id: "tap",
    tsTypes: {} as import("./tap_machine.typegen").Typegen0,
    initial: "startup",
    context: {
      /* ~30 fields: accounts, notifyTags, reason, webPushCapable, ... */
    },
    states: {
      startup: {
        initial: "waiting",
        states: {
          disabled: { type: "final" }, // terminal
          waiting: {
            always: [
              { cond: "webPushNotAvailable", target: "#tap.startup.disabled" },
            ],
          },
          boot: {
            always: [
              { cond: "tapHookEnabled", target: "#tap.startup.continue" },
              { target: "#tap.startup.checkForStoredRegistration" },
            ],
          },
          checkForStoredRegistration: {
            invoke: {
              src: "checkForStoredRegistration",
              onDone: {
                actions: "assignStoredRegistration",
                target: "#tap.startup.continue",
              },
              onError: { target: "#tap.startup.disabled" },
            },
          },
          continue: {
            entry: "setMachineEnabled",
            always: [
              {
                cond: "notificationSettingDisabled",
                target: "#tap.unsubscribing",
              },
              {
                cond: "permissionGranted",
                actions: "setReasonPermissionGranted",
                target: "#tap.reading",
              },
              { target: "#tap.reading" },
            ],
          },
        },
      },
      reading: {
        invoke: {
          src: "getCurrentNotifyTags",
          onDone: {
            actions: [
              "assignNotifyTags",
              "assignDefaultNotifyTagsForMissingAccounts",
            ],
            target: "#tap.ready",
          },
          onError: { actions: "assignDefaultNotifyTags", target: "#tap.ready" },
        },
      },
      subscribing: {
        entry: "assignTags",
        exit: "resetReason",
        invoke: { src: "ensureSubscribedToTAP" /* ... */ },
      },
      unsubscribing: { invoke: { src: "unsubscribe" /* ... */ } },
      // ...
    },
    on: {
      ENABLE: {
        /* ... */
      },
      UNSUBSCRIBE: {
        /* ... */
      },
      ACCOUNTS_UPDATED: {
        /* ... */
      },
    },
  },
  {
    guards: {
      tapHookEnabled: ({ tapHookEnabled }) => tapHookEnabled,
      webPushNotAvailable: ({ webPushCapable }) => !webPushCapable,
      notificationSettingDisabled: ({ notificationsSettingEnabled }) =>
        !notificationsSettingEnabled,
      permissionGranted: () =>
        getBrowserPermissionState() === PermissionStates.GRANTED, // reads browser
      permissionDenied: () =>
        getBrowserPermissionState() === PermissionStates.DENIED,
    },
    actions: {
      /* assignNotifyTags, setMachineEnabled, ... */
    },
    services: {
      /* checkForStoredRegistration, getCurrentNotifyTags, ensureSubscribedToTAP, unsubscribe */
    },
  },
)
```

React consumption injects runtime dependencies and Redux callbacks via `withContext`:

```typescript
const TapContext = createActorContext(tapMachine, { devTools: true })

// inside the provider:
const accounts = useSelector(selectAccountsWithNotifications)
const machine = tapMachine.withContext({
  ...tapMachine.context,
  accounts,
  saveRegistration: (...args) => dispatch(saveRegistrationAction(...args)),
})
```

**Surface used here:** compound states, `final`, eventless `always` + ordered `cond`, promise `invoke` with `onDone`/`onError`, `entry`/`exit`, guards that read browser state, top-level `on`, and `createActorContext` + `useSelector` + `withContext`.

#### Fizz mapping

- The `startup` orchestration is the hardest part to port. XState's transient `always` chains are _pure routing states_ — they enter, evaluate ordered guards, and immediately transition with no event. In Fizz this becomes the declarative `route().when(...).otherwise(...)` builder used as the `Enter` handler, which evaluates ordered predicates and transitions. This is functionally equivalent and, via `getRouteMetadata(...)`, restores the inspector-visible "this is a decision node" property.
- Promise `invoke` → `customJSONAsync(...)` / `startAsync(...)` chained with `.chainToAction(resolve, reject)`, or `waitState(...)` for the request-on-enter pattern. Cleaner than XState because cancellation and stale-completion handling are built in.
- `assign` → `update(...)` returns from handlers. Browser-permission guards → plain functions called inside `Enter` routing.
- `withContext(...)` dependency injection → Fizz machine-scoped clients (`utils.clients`) or closing over injected values at machine-creation time.
- `createActorContext` + `useSelector` → `createMachineContext(...)` + `machine.selectors` via `selectWhen(...)`.

#### Fizz sketch (startup routing + a service)

```typescript
import { action, state, createMachine, customJSONAsync } from "@tdreyno/fizz"

const enable = action("Enable")
const notifyTagsLoaded = action("NotifyTagsLoaded").withPayload<NotifyTag[]>()
const notifyTagsFailed = action("NotifyTagsFailed")

// Transient "decision node" becomes explicit Enter routing.
const Startup = state<ReturnType<typeof enable>, StartupData>({
  Enter: (data, _payload, { trigger }) => {
    if (!data.webPushCapable) return Disabled(data)
    if (data.tapHookEnabled || data.hasStoredRegistration) return Continue(data)
    return CheckStoredRegistration(data)
  },
})

const Continue = state<never, StartupData>({
  Enter: data => {
    if (!data.notificationsSettingEnabled) return Unsubscribing(data)
    if (getBrowserPermissionState() === PermissionStates.GRANTED) {
      return Reading({
        ...data,
        reason: SubscriptionReason.PERMISSION_ALREADY_GRANTED,
      })
    }
    return Reading(data)
  },
})

const Reading = state<never, StartupData>({
  Enter: (data, _p, { clients }) =>
    customJSONAsync(signal =>
      clients.tap.getCurrentNotifyTags({ signal }),
    ).chainToAction(notifyTagsLoaded, notifyTagsFailed),
  NotifyTagsLoaded: (data, tags) => Ready({ ...data, notifyTags: tags }),
  NotifyTagsFailed: data =>
    Ready({ ...data, notifyTags: defaultTags(data.accounts) }),
})

const Disabled = state<never, StartupData>({}) // terminal — no handlers
```

#### Gaps surfaced

- **G1 — Guarded transient transitions.** The `always` + ordered-`cond` pattern is used at `boot`, `continue`, `ready`. Fizz forces this into imperative `Enter` bodies. No declarative "guarded auto-transition list" exists.
- **G3 — Deep nested targeting.** `target: '#tap.startup.disabled'` jumps to a specific nested leaf. Fizz `stateWithNested(...)` has no equivalent string-path deep target.

### 2.2 Notification preferences

**What it does:** Owns local (IndexedDB) storage of per-account notification preferences, with a mailbox-attribute fallback when IndexedDB is unavailable. Three top-level regions: `startup`, `enabled`, `disabled`, each with nested write/fallback sub-states.

#### XState code

The notable feature is a **side-effecting `entry` action** (`saveMailboxAttribute` dispatches Redux) and an `onError` that routes to that fallback path:

```typescript
const notificationsMachine = createMachine(
  {
    id: 'notifications',
    tsTypes: {} as import('./notifications_machine.typegen').Typegen0,
    initial: 'startup',
    // context carries a stored callback used by the side-effecting action:
    context: { configuration: {}, experience: Experience.NORMAL, saveMailboxAttribute: noop, /* ... */ },
    states: {
      startup: {
        initial: 'waiting',
        states: {
          waiting: { on: { LAUNCH_COMPLETED: { target: 'boot' } } },   // gate on a Redux-sourced event
          boot: {
            always: [
              { cond: 'localSettingEnabled', target: '#notifications.enabled' },
              { target: 'checkMailboxAttribute' },
            ],
          },
          readConfigurationFromStorage: {
            invoke: {
              src: 'readConfigurationFromStorage',
              onDone:  { actions: 'assignConfiguration', target: 'checkLocalSetting' },
              onError: { target: 'checkMailboxAttribute' },          // fallback path
            },
          },
          // checkMailboxAttribute, checkLocalSetting ...
        },
      },
      enabled: {
        initial: 'enabling',
        states: {
          enabling: { always: { target: 'writeConfigurationToStorage' } },
          writeConfigurationToStorage: {
            invoke: {
              src: 'writeConfigurationToStorage',
              onDone:  { actions: 'assignNormalExperience',   target: 'complete' },
              onError: { actions: 'assignFailSafeExperience', target: 'setMailboxAttribute' },
            },
          },
          setMailboxAttribute: {
            // side-effecting action (dispatches Redux) mixed with pure assigns:
            entry: ['assignMailboxAttributeEnabled', 'saveMailboxAttribute'],
            always: { target: 'complete' },
          },
          complete: {},
        },
      },
      disabled: { /* near-identical mirror of `enabled` */ },
    },
  },
  {
    actions: {
      saveMailboxAttribute: context => context.saveMailboxAttribute({ enabled: true }), // <-- side effect
      // ...pure assign actions
    },
    services: { readConfigurationFromStorage: /* ... */, writeConfigurationToStorage: /* ... */ },
  },
)
```

React consumption injects the `saveMailboxAttribute` callback via `withContext`, and a small updater component sends `LAUNCH_COMPLETED` when a Redux selector flips.

**Surface used here:** three compound regions, transient `always`+`cond` routing, promise `invoke` with fallback `onError`, a **side-effecting entry action**, deep targets, and `createActorContext`/`useSelector`.

#### Fizz mapping

- `enabled` and `disabled` are near-identical mirror sub-machines. Fizz would model them as two states with shared helper handlers, or — notably — this is the _one_ place a `createParallelMachine` is **not** wanted; it's a mode switch, so flat Fizz states are correct.
- The `onError` → fallback-path routing maps cleanly to `chainToAction(resolve, reject)` where the reject branch transitions to the `SetMailboxAttribute` state.
- The side-effecting `saveMailboxAttribute` entry action should become an explicit Fizz **effect** (or an output action to the Redux adapter) rather than an inline side effect — this is a place where Fizz's "effects are explicit objects" model is strictly better than XState's free-form action functions.
- The `waiting`-for-`LAUNCH_COMPLETED` gate maps to a Fizz state that only accepts `LaunchCompleted`.

#### Fizz sketch (enable flow with storage fallback as explicit effect)

```typescript
import { action, state, output, customJSONAsync } from "@tdreyno/fizz"

const updateConfiguration = action("UpdateConfiguration").withPayload<Config>()
const wroteConfig = action("WroteConfig")
const writeFailed = action("WriteFailed")
// Adapter-facing output instead of an inline Redux dispatch in an action:
const saveMailboxAttribute = action("SaveMailboxAttribute").withPayload<{
  enabled: boolean
}>()

const Enabled = state<ReturnType<typeof updateConfiguration>, NotifData>({
  Enter: (data, _p, { clients }) =>
    customJSONAsync(signal =>
      clients.storage.writeConfig(data.configuration, { signal }),
    ).chainToAction(wroteConfig, writeFailed),
  WroteConfig: data => ({ ...data, experience: Experience.NORMAL }),
  WriteFailed: data => [
    output(saveMailboxAttribute({ enabled: true })), // explicit, observable by the Redux adapter
    EnabledComplete({ ...data, experience: Experience.FAIL_SAFE }),
  ],
  UpdateConfiguration: (data, configuration) =>
    Enabled({ ...data, configuration }),
})
```

#### Gaps surfaced

- **G1 — Guarded transient transitions** (again): `boot`, `enabling`, `disabling`, `checkLocalSetting`, `checkMailboxAttribute` are all `always`+`cond` routing nodes.
- **G3 — Deep nested targeting** (again).
- No new gaps; reinforces G1/G3 and showcases a Fizz **advantage** (explicit effects vs. side-effecting actions).

### 2.3 Push-service subscription (imperative)

**What it does:** A flat, mostly-linear async pipeline that subscribes the browser PushManager, registers with TAP/Rivendell, and manages associations — with rich error-recovery routing. Unlike the other two, it is **not** used in React; it is interpreted imperatively.

#### XState code

The two distinctive features are (a) **`onError` branching by error code** and a **manual loop-guard counter**, and (b) **imperative interpretation** that captures transition history for telemetry.

```typescript
// Guards classify the rejected promise's error payload (event.data):
const failedBecauseAssociationDoesNotExist = (_: MachineContext, event: MachineEvent) =>
  isErrorPlatformEvent(event) &&
  RivendellApiClient.isResponseError(event.data) &&
  event.data.errorCode === RivendellApiClient.ERROR_NO_ASSOCIATION_EXISTS

const requestCountOverLimit = (context: MachineContext) => context.apiRequests > 10 // loop defense

// A representative step: onError is an *ordered guard array* that routes by error code,
// incrementing a counter each time to bound recovery loops.
updateAssociation: {
  invoke: {
    src: 'updateAssociation',
    onDone:  [{ actions: 'assignAssociationTimestamp', target: '#webpush.complete' }],
    onError: [
      { cond: 'requestCountOverLimit', target: '#webpush.failed' },
      { actions: 'incrementApiRequestCounter',
        cond: 'failedBecauseRegistrationDoesNotExist', target: '#webpush.addRegistration' },
      { actions: 'incrementApiRequestCounter',
        cond: 'failedBecauseAssociationDoesNotExist', target: '#webpush.addAssociation' },
      { target: '#webpush.failed' },
    ],
  },
},
```

The imperative driver interprets the machine outside React, records every transition, and derives telemetry from the _path_ the machine took:

```typescript
const transitions: MachineState[] = []

// scenario/flow telemetry is derived from the ordered list of visited state values:
const getScenario = (ts: MachineState[]) => {
  const visited = ts.map(t => t.value)
  if (visited.includes("unsubscribeToMigrate")) return Scenario.MIGRATE
  if (visited.includes("subscribe")) return Scenario.SUBSCRIBE
  if (
    visited.includes("addAssociation") ||
    visited.includes("updateAssociation")
  )
    return Scenario.RENEW
  return Scenario.NOOP
}
const getFlow = (ts: MachineState[]) => ts.map(t => t.value).join(",")

const interpreter = interpret(machine, { devTools: true })

interpreter.onTransition(() => {
  registrationTimestamp = machine.context.registrationTimestamp
  registrationVersion = machine.context.registrationVersion
})

const done = new Promise<void>(resolve => {
  interpreter.onDone(async () => {
    const finalTransition = transitions[transitions.length - 1]
    const scenario = getScenario(transitions)
    const flow = getFlow(transitions)
    if (finalTransition.value === "failed") {
      handleFailure((finalTransition.event as ErrorPlatformEvent).data)
      return resolve()
    }
    infoLogger
      .feature("push_notifications_subscription_complete", {
        scenario,
        flow,
        registrationTimestamp,
        registrationVersion,
      })
      .logSuccess()
    resolve()
  })
})

interpreter.subscribe(transition => transitions.push(transition)) // capture full history
interpreter.start()
```

**Surface used here:** flat states + `final`, promise `invoke` for every step, **`onError` ordered guard arrays keyed on error code** (`event.data`), a manual loop-guard counter, and imperative `interpret(...)` / `onTransition` / `onDone` / `subscribe` with transition-history-derived telemetry.

#### Fizz mapping

- This is the machine Fizz models **most naturally**. The async pipeline is exactly what `startAsync(...)`/`customJSONAsync(...)` + `.chainToAction(...)` + `matchOn(...)` are for.
- Error-code branching maps to a `reject` handler that uses `matchOn(error => classify(error), { ... })` to pick the recovery transition — strictly cleaner than XState's parallel `onError` guard arrays.
- The `apiRequests` loop guard is just a context counter in Fizz — same approach, no special support needed.
- **Imperative interpretation** maps to:
  - `createRuntime(machine, machine.states.Unsubscribed(initial))` + `enter()`
  - transition-history capture via `runtime.onContextChange(...)` (the runtime context carries state history)
  - awaiting the final outcome via `runtime.runUntil(action, matchState(...))` or the standalone `runtime.waitUntilState(...)` family, racing `Subscribed` against `Failed`.

#### Fizz sketch (error-code recovery + await-final imperatively)

```typescript
import {
  action,
  state,
  createMachine,
  createRuntime,
  enter,
  customJSONAsync,
  matchOn,
  matchState,
  matchAny,
} from "@tdreyno/fizz"

const associationAdded = action("AssociationAdded")
const associationFailed = action("AssociationFailed").withPayload<unknown>()

const AddAssociation = state<ReturnType<typeof associationAdded>, SubData>({
  Enter: (data, _p, { clients }) =>
    customJSONAsync(signal =>
      clients.rivendell.addAssociation(data, { signal }),
    ).chainToAction(
      () => associationAdded(),
      // error-code routing replaces parallel onError guard arrays:
      matchOn(err => classifyRivendellError(err), {
        ASSOCIATION_EXISTS: () => associationFailed("update"),
        NO_REGISTRATION: () => associationFailed("addReg"),
        default: () => associationFailed("fatal"),
      }),
    ),
  AssociationAdded: data => Complete(data),
  AssociationFailed: (data, reason) =>
    data.apiRequests > 10
      ? Failed(data)
      : reason === "update"
        ? UpdateAssociation(inc(data))
        : reason === "addReg"
          ? AddRegistration(inc(data))
          : Failed(data),
})

// Imperative driver (replaces interpret + onTransition + await-final):
const runtime = createRuntime(machine, machine.states.Unsubscribed(initial))
const history: string[] = []
runtime.onContextChange(ctx => history.push(ctx.currentState.name))
await runtime.run(enter())
const outcome = await runtime.waitUntilState(
  matchAny(
    matchState(machine.states.Subscribed),
    matchState(machine.states.Failed),
  ),
)
```

#### Gaps surfaced

- **G4 — Telemetry-grade transition history.** The imperative consumer builds an ordered list of state _values_ to compute `scenario`/`flow` strings. Fizz exposes state history through runtime context, but the ergonomics of "give me the ordered list of visited state names for this run" are not a first-class, documented helper. Worth confirming/packaging.
- Otherwise **fully covered**, and Fizz is the better fit here (built-in cancellation, no parallel `onError` guard arrays, no typegen file).

### 2.4 Generic transition logger

**What it does:** A reusable hook that records every transition's dotted path and, on reaching a configured success/failure state, logs a feature beacon including the full `flow` and the failure event payload.

#### XState code

```typescript
const [state] = useActor(actor)

// dotted hierarchical path of the (possibly nested) current state, appended each transition:
useEffect(() => {
  setTransitions(prev => prev.concat(state.toStrings().join("/"))) // e.g. "startup/startup.disabled"
}, [state.value])

// on reaching the configured failure state, log the *triggering event's* payload:
if (state.matches(failureState)) {
  feature.logFailure(state.event.data) // payload of the event that caused this state
}
```

It is typed generically with `EmittedFrom<T>`, `ActorRefFrom`, and `AnyStateMachine`.

**Surface used here:** `useActor`, `state.toStrings()` (dotted nested path), `state.value`, and `state.event.data` (the triggering event's payload), accessed from a _generic observer_ that doesn't know the machine's shape.

#### Fizz mapping

- Observing transitions → `useMachineSubscription(...)` (React) or `runtime.onContextChange(...)` (runtime).
- Success/failure detection → `currentState.is(machine.states.X)` or `selectWhen(...)`.

#### Gaps surfaced

- **G5a — Dotted hierarchical path string.** `state.toStrings()` yields a stable, log-friendly string for nested states. Fizz `currentState.name` is flat; there's no documented equivalent that renders nested composition as a path. Relevant for any team that pipes machine flow into analytics.
- **G5b — Triggering-event access.** `state.event.data` lets the logger attach the failing event's payload without the machine explicitly modeling it. In Fizz, a handler receives the action payload, but generic _observers_ (`onContextChange`) don't obviously get "the action that caused this state" with its payload. Worth confirming whether runtime context exposes the last action.

---

## 3. Consolidated XState → Fizz Mapping

| XState concept                                                                 | Fizz equivalent                                                                      | Status                                        |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | --------------------------------------------- |
| `createMachine(config, options)` declarative config object                     | `createMachine({ states, actions, ... })` handler-map builder                        | Covered (different shape)                     |
| `tsTypes` + generated `*.typegen.ts`                                           | Native TS inference, no codegen                                                      | **Fizz advantage**                            |
| `assign(...)` actions                                                          | `update(...)` / object return                                                        | Covered                                       |
| `entry` / `exit` actions                                                       | `Enter` handler / state exit semantics                                               | Covered                                       |
| `final` state                                                                  | terminal state (no handlers)                                                         | Covered                                       |
| Promise `invoke` + `onDone`/`onError`                                          | `startAsync`/`customJSONAsync(...).chainToAction(resolve, reject)`, `waitState(...)` | Covered (Fizz cleaner: built-in cancel/stale) |
| `onError` branch by error code (`event.data`)                                  | reject handler + `matchOn(...)`                                                      | Covered                                       |
| Side-effecting actions                                                         | explicit `Effect` / `output(...)`                                                    | **Fizz advantage**                            |
| `cond` guards                                                                  | functions in handlers / `switch_(...)`                                               | Covered (less declarative)                    |
| Manual loop-guard counter                                                      | context counter                                                                      | Covered                                       |
| Top-level `on` (machine-wide handlers)                                         | per-state handlers / shared handler helpers                                          | Covered (more verbose)                        |
| `interpret(...)` imperative driver                                             | `createRuntime(...)` + `enter()`                                                     | Covered                                       |
| `interpreter.subscribe(...)` / `.onTransition(...)`                            | `runtime.onContextChange(...)`                                                       | Covered                                       |
| await machine reaching final state                                             | `runtime.runUntil(...)` / `waitUntilState(...)` + `matchState`/`matchAny`            | Covered                                       |
| `createActorContext` + `useActor`/`useSelector`                                | `createMachineContext(...)` + `machine.selectors` (`selectWhen`)                     | Covered                                       |
| `EmittedFrom<typeof machine>` selector typing                                  | inferred selector signatures                                                         | Covered                                       |
| **Eventless transient transitions (`always`) with ordered `cond` fallthrough** | imperative routing in `Enter`                                                        | **Partial / Gap (G1)**                        |
| **Compound nesting with deep `#id.a.b` targets**                               | `stateWithNested(...)` (no deep string targets)                                      | **Partial / Gap (G3)**                        |
| **`state.toStrings()` dotted nested path**                                     | `currentState.name` (flat)                                                           | **Gap (G5a)**                                 |
| **`state.event.data` from a generic observer**                                 | action payload in handlers; observer access unclear                                  | **Gap (G5b)**                                 |
| Parallel / history / `spawn` / `after` / activities                            | `createParallelMachine` (parallel only); others differ                               | Not exercised in product code (see §5)        |

---

## 4. Prioritized Gaps for Fizz to Close

Ranked by how often the pattern appears across these production machines and how much friction the workaround adds.

### G1 — Declarative guarded transient ("auto") transitions — **High priority**

**Evidence:** TAP machine (`boot`, `continue`, `ready`), Notifications machine (`boot`, `enabling`, `disabling`, `checkLocalSetting`, `checkMailboxAttribute`), Push-subscription machine (`subscribing`). This is the single most-used XState feature that Fizz lacks a first-class answer for.

**Why it matters:** These are _decision nodes_ — states whose only job is "evaluate ordered conditions on entry, then route." XState makes them declarative and inspectable. In Fizz they collapse into imperative `Enter` bodies with `if`/early-return, which works but (a) hides routing intent, (b) isn't introspectable by tooling, and (c) re-implements the same ordered-fallthrough logic by hand each time.

**Suggested direction:** A helper for entry-time guarded routing, e.g.:

```typescript
const Boot = routingState([
  { when: d => !d.webPushCapable, to: Disabled },
  { when: d => d.tapHookEnabled, to: Continue },
  { to: CheckStoredRegistration }, // default
])
```

This keeps Fizz's explicit model while restoring the declarative, ordered-guard ergonomics XState users rely on. (Conceptually a sibling of `switch_(...)` specialized for on-enter routing.)

### G3 — Hierarchical nesting + deep transition targets — **Medium priority**

**Evidence:** Both React machines use compound states and `target: '#machine.region.leaf'`. `stateWithNested(...)` exists but there's no documented way to target a specific nested leaf by path the way `#id.a.b` does.

**Why it matters:** Real product machines model "modes with sub-steps" (`enabled` → `writeConfig`/`fallback`/`complete`). Fizz can express this with separate states, but loses the grouping/inheritance and the "re-enter a region at a specific leaf" capability.

**Suggested direction:** Either (a) document the idiomatic Fizz pattern for "mode + sub-step" decomposition so migrators have a clear recipe, or (b) extend `stateWithNested(...)` with explicit child-target entry helpers. Given Fizz's philosophy, (a) plus a small "enter child X of region Y" helper is likely enough — full XState-style nesting is probably not desirable.

### G4 — First-class run transition-history / flow capture — **Medium priority**

**Evidence:** The push-subscription driver builds `transitions: MachineState[]`, then derives `scenario` and a comma-joined `flow` string for telemetry (see the imperative driver code in §2.3). This is a common real-world need: "what path did this run take?"

**Why it matters:** Teams instrument machines for analytics. Today this requires manually pushing into an array from `onContextChange`. A documented, supported helper would reduce boilerplate and standardize the pattern.

**Suggested direction:** A small runtime helper or documented recipe, e.g. `runtime.getVisitedStateNames()` or an opt-in history recorder, plus guidance that pairs with `waitUntilState(...)` for "run to completion, then read the path."

### G5a — Dotted hierarchical path for logging — **Low/Medium priority**

**Evidence:** The generic transition logger uses `state.toStrings().join('/')` (see §2.4).

**Why it matters:** Stable, human-readable nested-state strings are the natural key for flow analytics. Fizz's flat `currentState.name` suffices for flat machines but not for nested composition.

**Suggested direction:** Expose a `currentState.path` (or `toPathString()`) that renders nested composition deterministically. Cheap to add, directly unblocks log/analytics migration.

### G5b — Triggering-action access from observers — **Low priority**

**Evidence:** The generic transition logger reads `state.event.data` to log the failing event payload (see §2.4).

**Why it matters:** Generic observers (not the handler that consumed the action) sometimes need "what action caused this transition, with its payload." Confirm whether runtime context already surfaces the last action; if not, a `context.lastAction` would close this.

**Suggested direction:** Confirm/document existing runtime-context fields; add `lastAction` to the change-notification payload if absent.

---

## 5. XState Features Not Exercised by Product Code

For completeness, and to avoid over-scoping Fizz work: the following XState capabilities appear **only** in test tooling (a protractor automation machine), not in any of the three product machines:

- **`spawn(...)` + callback actors** with bidirectional `send`/`receive` (a long-lived child process modeled as an actor).
- **`after` / delayed transitions** (timeout-driven retries with cooldown).
- **`cancel`/`send`/`stop` action creators** from `xstate/lib/actions`.

Fizz already has strong answers for the timing/async parts of these (`startTimer`/`startInterval`/`debounceAsync`, `cancelAsync`, full `disconnect()` teardown). The genuine _model_ gap is **actor spawning / child-process-as-actor with bidirectional messaging** — but since no product machine needs it, it should be considered a **non-blocking, lower-priority** consideration rather than a migration blocker. `createParallelMachine(...)` covers "several branches alive at once," which is the more common need.

---

## 6. Where Fizz Already Wins

Migrating these machines to Fizz would be a net improvement in several respects:

1. **No typegen build step.** All three machines carry a hand-maintained `*.typegen.ts` and `tsTypes` wiring, plus eslint-disabled `as` casts on `context`/`events`/`services` schemas. Fizz's native inference deletes that entire category of file and ceremony.
2. **Async is first-class.** Every machine's core work is promise-`invoke`. Fizz's `customJSONAsync`/`startAsync` + `.chainToAction(...)` + `matchOn(...)` express the same flows with built-in cancellation, stale-completion handling, and `disconnect()` teardown — none of which XState v4 gives for free, and all of which matter for a push-subscription pipeline that can be torn down mid-flight.
3. **Effects are explicit.** The notifications machine's side-effecting `saveMailboxAttribute` entry action (a Redux dispatch hidden inside an action) becomes an explicit `Effect`/`output(...)` in Fizz — easier to test and observe.
4. **Cleaner error-code recovery.** The push-subscription machine's parallel `onError` guard arrays (`failedBecause*` reading `event.data`) become a single `reject` handler with `matchOn(...)`.
5. **Imperative driving is supported and ergonomic.** The `interpret(...)`-based consumer maps onto `createRuntime` + `runUntil`/`waitUntilState`, with `matchState`/`matchAny` handling the race-to-final-state cleanly.

The remaining friction is concentrated in **G1 (guarded transient transitions)** and the **nested-state ergonomics (G3, G5a)**. Closing G1 alone would remove the largest single source of awkwardness in porting this codebase.

---

## 7. Appendix — Integration Patterns Observed

These are the consumer-side patterns a Fizz migration must preserve.

### A. React, shared instance (TAP & Notifications machines)

XState: `createActorContext(machine, { devTools: true })` → Provider built with `machine.withContext({...deps, ...reduxCallbacks})`; consumers use `useActor()` for `send` and `useSelector(stateFn)` for reads; "updater" components bridge Redux → machine events (e.g. `LAUNCH_COMPLETED`, `ACCOUNTS_UPDATED`).

Fizz: `createMachineContext(...)` Provider + hook; inject deps via machine-scoped clients; read with `machine.selectors` (`selectWhen(...)`); bridge external store with `connectExternalSnapshot` (Redux) or effect/output adapters; observe with `useMachineSubscription(...)`.

### B. Imperative, await-to-completion (Push-subscription machine)

XState: `interpret(machine.withContext(...))`, `interpreter.subscribe(...)` to collect history, `interpreter.onDone(...)` to resolve the outer Promise on final state, derive telemetry from visited `state.value`s.

Fizz: `createRuntime(machine, initialState)` + `await runtime.run(enter())`; record history with `onContextChange`; `await runtime.waitUntilState(matchAny(matchState(Subscribed), matchState(Failed)))`; derive telemetry from recorded names (see G4).

### C. Generic transition logging (transition logger hook)

XState: `useActor`, `state.toStrings().join('/')` for the flow, `state.event.data` for failure payloads.

Fizz: `useMachineSubscription(...)` / `onContextChange(...)`; needs G5a (path string) and possibly G5b (triggering action) for full parity.
