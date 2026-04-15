# Examples

Short copyable examples for common Fizz and fizz-react tasks.

## Simple state transition

```typescript
import { Enter, action, state } from "@tdreyno/fizz"

const finish = action("Finish")

const Start = state<Enter | ReturnType<typeof finish>>({
  Enter: () => undefined,
  Finish: () => Done(),
})

const Done = state<Enter>({
  Enter: () => undefined,
})
```

## Runtime bootstrapping

```typescript
import { createInitialContext, createRuntime, enter } from "@tdreyno/fizz"

const context = createInitialContext([Start()])
const runtime = createRuntime(context, { finish }, {})

await runtime.run(enter())
```

## JSON request mapped back into actions

```typescript
import { Enter, action, requestJSONAsync, state } from "@tdreyno/fizz"

type Profile = {
  id: string
}

const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const Loading = state({
  Enter: () =>
    requestJSONAsync("/api/profile", { asyncId: "profile" })
      .validate(assertProfile)
      .chainToAction(profileLoaded, error => profileFailed(String(error))),
})
```

## React integration with `useMachine(...)`

```typescript
import { useMachine } from "@tdreyno/fizz-react"

const machine = useMachine({ Start, Done }, { finish }, Start())

const current = machine.currentState
```

## Practical reminders

- Prefer explicit action names.
- Keep handlers readable.
- Use Fizz helpers for async and timing behavior.
- Let React render the machine instead of re-implementing it.
