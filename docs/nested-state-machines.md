# Nested State Machines

Nested state machines let one state own a smaller workflow without flattening every transition into the top-level machine.

Use `stateWithNested(...)` when a parent state is still one coherent mode, but that mode contains its own step-by-step interaction. A common example is a form, wizard, or setup flow that only exists while the parent state is active.

If nesting only hides a state that should really be split into separate top-level states, prefer another plain `state(...)` instead.

## When nesting helps

Reach for a nested machine when:

- one parent mode owns a smaller workflow with its own transitions
- the child flow should disappear when the parent state changes
- the parent still needs to react when the child reaches a milestone
- forwarding a small, explicit set of actions is clearer than duplicating handlers across top-level states

This keeps the parent focused on the larger workflow while the child handles the local details.

## The shape of `stateWithNested(...)`

`stateWithNested(...)` takes four arguments:

1. a handler map for actions the parent state owns
2. the child's initial state
3. a map of action creators that should be forwarded to the child runtime
4. optional state metadata such as the state name

```typescript
const Entry = stateWithNested(
  {
    // Parent-owned handlers that run on the parent state.
    CompletedForm: () => Complete(),
  },
  // The child's initial state when the parent state enters.
  FormInvalid({ name: "" }),
  {
    // Actions forwarded from the parent runtime into the child runtime.
    SetName: setName,
  },
  // Optional metadata for the parent state definition.
  { name: "Entry" },
)
```

When the parent state enters, Fizz creates the child runtime and enters the child's initial state automatically.

```text
Top-level machine

[Previous State] ---> [Entry] -----------------------> [Complete]
          |  ^                               ^
          |  | CompletedForm                |
          |  +------------------------------+
          |
          +--> nested child runtime
            [FormInvalid] ---> [FormValid]
              ^               |
              |               |
              +--- SetName ---+
```

## A working example

This example mirrors the nested machine fixture used in the Fizz test suite. The parent `Entry` state owns a small form. The child machine validates the form name and tells the parent when the form is complete.

```text
Parent state boundary

+--------------------------------------------------+
| Entry                                             |
|                                                   |
|  nested child runtime                             |
|                                                   |
|  [FormInvalid] -- SetName(valid) --> [FormValid]  |
|       ^                                           |
|       |                                           |
|       +-- SetName(invalid) keeps same state       |
+--------------------------------------------------+

CompletedForm from child moves parent to [Complete]
```

### Define the actions

```typescript
import { action } from "@tdreyno/fizz"

export const completedForm = action("CompletedForm").withPayload<string>()
export const setName = action("SetName").withPayload<string>()
```

### Build the child states

`FormInvalid` owns the local form data. It can also read parent data through `parentRuntime`.

```typescript
import { state } from "@tdreyno/fizz"

type EntryData = {
  targetName: string
}

type FormData = {
  name: string
}

const FormInvalid = state<ReturnType<typeof setName>, FormData>(
  {
    SetName(data, name, { update, parentRuntime }) {
      const targetName = (parentRuntime?.currentState().data as EntryData)
        .targetName

      if (name === targetName) {
        return FormValid({ ...data, name })
      }

      return update({ ...data, name })
    },
  },
  { name: "FormInvalid" },
)
```

When the child reaches the valid state, it tells the parent by running a parent action.

```typescript
import { Enter, state } from "@tdreyno/fizz"

const FormValid = state<Enter, FormData>(
  {
    Enter(data, _, { parentRuntime }) {
      void parentRuntime?.run(completedForm(data.name))
    },
  },
  { name: "FormValid" },
)
```

### Build the parent state

The parent owns the larger workflow. It forwards only the actions listed in the third argument.

```typescript
import { state, stateWithNested } from "@tdreyno/fizz"

const Complete = state({}, { name: "Complete" })

const Entry = stateWithNested<ReturnType<typeof completedForm>, EntryData>(
  {
    CompletedForm() {
      return Complete()
    },
  },
  FormInvalid({ name: "" }),
  {
    SetName: setName,
  },
  { name: "Entry" },
)
```

In this setup:

- the parent starts in `Entry`
- the child runtime starts in `FormInvalid`
- `SetName(...)` is forwarded from the parent runtime to the child runtime
- the child transitions to `FormValid` when the input matches the parent's `targetName`
- `FormValid` triggers `CompletedForm(...)` on the parent runtime
- the parent transitions to `Complete`

```text
State progression for the example

parent: [Entry] -----------------------------------> [Complete]
          |
          | owns child runtime
          v
child:  [FormInvalid] -- SetName(correct name) --> [FormValid]
            |
            +-- SetName(wrong name) --> [FormInvalid]
```

## Parent and child communication

Nested machines stay predictable when the communication rules are explicit.

### Parent to child

Only the action creators listed in the `nestedActions` object are forwarded to the child runtime.

That is useful because the parent still controls the boundary. If an action should not affect the child workflow, do not forward it.

```text
Parent-to-child forwarding

SetName("Fizz")
  |
  v
parent runtime in [Entry]
  |
  +-- nestedActions includes SetName
  |
  v
child runtime handles SetName
  |
  +-- stays in [FormInvalid]
  |
  +-- or transitions to [FormValid]
```

### Child to parent

Child handlers receive `parentRuntime` in their handler utils. Use it when the child needs to notify the parent that something meaningful happened.

Keep that communication milestone-oriented. Good examples are “completed”, “cancelled”, or “needs retry”. Avoid turning the child into a thin wrapper that constantly calls back into the parent for every small decision.

```text
Child-to-parent milestone flow

[FormValid] enters
  |
  v
parentRuntime.run(CompletedForm(name))
  |
  v
parent [Entry] handles CompletedForm
  |
  v
transition to [Complete]
```

## Practical tradeoffs

Nested state machines are a composition tool, not a default.

They work well when a parent state owns a local workflow with a clear boundary. They work poorly when they are used to hide an oversized parent state or when most actions need to bounce back and forth between parent and child.

If the child starts looking like a separate mode in the main app workflow, it is often clearer to promote that logic into top-level states instead.

## Related Docs

- [Architecture](./architecture.md)
- [Complex Actions](./complex-actions.md)
- [API](./api.md)
- [Testing](./testing.md)
