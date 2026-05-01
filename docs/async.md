# Async

Fizz async operations let a state start promise-backed work without leaving the state machine model. You can use the low-level async helpers directly, use `requestJSONAsync(...)` for the common JSON request flow, or use `customJSONAsync(...)` when an app client already returns parsed JSON.

Async operations are a good fit for `fetch`, form submission, loading related resources, and other request-shaped work where stale completions should be ignored automatically.

## Low-level helpers

Fizz adds two async helpers to the state handler utils:

- `startAsync(run, handlers, asyncId?)`
- `cancelAsync(asyncId)`

`startAsync(...)` accepts either:

- A lazy function `(signal, context) => Promise<T>`
- A `Promise<T>` that is already in flight

The `handlers` object maps the settled result to your own actions:

```typescript
{
  resolve: value => someAction(value),
  reject: reason => someOtherAction(reason),
}

Both `resolve` and `reject` handlers are required.
```

If you provide an `asyncId`, the state can later cancel that specific operation with `cancelAsync(asyncId)`. If you omit the id, Fizz generates one internally so the operation still participates in stale-completion protection and state-exit cleanup, but you cannot target it later with manual cancellation.

For non-promise external lifecycles (subscriptions, controllers, handles), prefer state resources via `resource(...)`, `abortController(...)`, and `subscription(...)`. Those values are available through handler `utils.resources` and are cleaned up automatically on state exit.

```text
Async lifecycle

startAsync(...) or requestJSONAsync(...)
        |
        v
       [running]
        |
    +---------+---------+
    |                   |
    v                   v
  resolve(value)      reject(reason)
    |                   |
    v                   v
resolve handler       reject handler
    |                   |
    +---------+---------+
        |
        v
    mapped action enters runtime
```

When an active async operation is explicitly cancelled, Fizz dispatches `AsyncCancelled` with this payload shape:

```typescript
{
  asyncId: "your-async-id"
}
```

## JSON requests with `requestJSONAsync`

`requestJSONAsync(input, init?)` is a convenience builder for the common `fetch(...).json()` flow.

It supports two valid shapes:

- `requestJSONAsync(input, init?).chainToAction(resolve, reject)`
- `requestJSONAsync(input, init?).validate(validator).chainToAction(resolve, reject)`

Builder stages may also include:

- `.validate(validatorOrParser)` for assert-style or parser-style validation
- `.map(mapper)` when a payload should be transformed before action mapping

`requestJSONAsync(...)` will:

- pass through normal `RequestInit` options such as `method`, `body`, `credentials`, and similar config
- accept an optional `asyncId` in `init` when a request should later be cancellable with `cancelAsync(asyncId)`
- always send `Accept: "application/json"`; if you provide `Accept` yourself it is ignored and replaced
- inject the runtime abort signal so stale requests can be cancelled cleanly
- reject when `response.ok` is false
- parse `response.json()` internally

`validate(...)` is optional. When present, it may appear only once and it must come before `chainToAction(...)`.

`validate(...)` also supports parser-style functions such as `zod` `.parse(...)`.

`map(...)` is optional. It transforms the resolved payload before `chainToAction(...)`.

Use `validate(...)` when you want to assert that the parsed JSON matches the payload shape your action expects. The validator should throw when the payload is invalid. If it throws, that exact thrown value becomes the value received by the `reject` handler.

If you return `requestJSONAsync(...)` directly without chaining `validate(...)` or `chainToAction(...)`, Fizz still treats it as a side-effect and starts the request. In that fire-and-forget form, the response value is ignored.

```text
requestJSONAsync(...) flow

requestJSONAsync(input, init)
       |
       v
   fetch(...)
       |
       v
      response.ok ?
   |       |
  yes      no
   |       |
   v       v
 response.json  reject(error)
   |
   v
 optional validate(...)
   |
   v
 chainToAction(resolve, reject)
   |
   v
 action re-enters the machine
```

## JSON client calls with `customJSONAsync`

`customJSONAsync(run, init?)` is a JSON builder for app client layers that already return parsed values.

Use it when your app calls generated OpenAPI clients, Apollo, tRPC, or any SDK function that returns JSON-like payloads.

It supports the same builder flow as `requestJSONAsync(...)`:

- `customJSONAsync(run, init?).chainToAction(resolve, reject)`
- `customJSONAsync(run, init?).validate(validator).chainToAction(resolve, reject)`
- `customJSONAsync(run, init?).validate(validatorOrParser).map(mapper).chainToAction(resolve, reject)`

`run` receives `(signal, context)` so cancellation can be wired into the client call.

```text
requestJSONAsync vs customJSONAsync

requestJSONAsync(input, init?)
- best for fetch request/response flows
- handles response.ok and response.json() internally

customJSONAsync(run, init?)
- best for app client functions returning parsed payloads
- lets the client call own transport and error behavior
```

## Retry and backoff

Both `requestJSONAsync(...)` and `customJSONAsync(...)` accept an optional `retry` object in `init`.

```typescript
type RetryPolicy = {
  attempts?: number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  random?: () => number
  strategy?:
    | {
        kind: "fixed"
        delayMs: number
        jitter?: {
          kind: "full"
          ratio?: number
        }
      }
    | {
        kind: "exponential"
        baseDelayMs: number
        maxDelayMs?: number
        jitter?: {
          kind: "full"
          ratio?: number
        }
      }
}
```

Notes:

- `retry` is opt-in for JSON helpers. Without it, they perform a single attempt.
- `attempts` defaults to `3` when `retry` is provided but `attempts` is omitted.
- `shouldRetry(...)` receives the thrown error and current attempt number.
- `random` is optional and primarily useful for deterministic test control when jitter is enabled.

### `requestJSONAsync(...)` retry example

```typescript
requestJSONAsync("/api/profile", {
  retry: {
    attempts: 4,
    shouldRetry: (error, attempt) => {
      if (!(error instanceof Error)) {
        return false
      }

      return /429|503|timeout|network/i.test(error.message) && attempt < 4
    },
    strategy: {
      kind: "exponential",
      baseDelayMs: 200,
      maxDelayMs: 2000,
      jitter: {
        kind: "full",
        ratio: 0.2,
      },
    },
  },
}).chainToAction(profileLoaded, profileFailed)
```

### `customJSONAsync(...)` retry example

```typescript
customJSONAsync(
  (signal, context) =>
    context.apiClient.getProfile({
      signal,
      userId: context.userId,
    }),
  {
    retry: {
      attempts: 3,
      strategy: {
        kind: "fixed",
        delayMs: 150,
      },
    },
  },
)
  .validate(assertProfile)
  .chainToAction(profileLoaded, profileFailed)
```

## Common request example

This example starts a profile request when the state is entered, validates the JSON payload, maps the parsed result to a user action, and maps failures to a user-visible error action.

```typescript
import { Enter, action, requestJSONAsync, state } from "@tdreyno/fizz"

const profileLoaded = action("ProfileLoaded").withPayload<{
  id: string
  name: string
}>()

const profileFailed = action("ProfileFailed").withPayload<string>()

type Data = {
  error?: string
  profileName?: string
}

const assertProfile = (
  value: unknown,
): asserts value is { id: string; name: string } => {
  if (typeof value !== "object" || value === null) {
    throw new Error("Invalid profile payload")
  }

  const candidate = value as Record<string, unknown>

  if (typeof candidate.id !== "string" || typeof candidate.name !== "string") {
    throw new Error("Invalid profile payload")
  }
}

const Loading = state<
  Enter | typeof profileLoaded | typeof profileFailed,
  Data
>({
  Enter: () =>
    requestJSONAsync("/api/profile")
      .validate(assertProfile)
      .chainToAction(profileLoaded, error =>
        profileFailed(error instanceof Error ? error.message : "Unknown error"),
      ),

  ProfileLoaded: (data, profile, { update }) =>
    update({
      ...data,
      profileName: profile.name,
    }),

  ProfileFailed: (data, message, { update }) =>
    update({
      ...data,
      error: message,
    }),
})
```

## Zod validation example

If you already use `zod`, you can pass a schema parser directly to `validate(...)`. `zod`'s `.parse(...)` method throws when the payload is invalid, which matches the contract that `requestJSONAsync(...)` expects.

```typescript
import * as z from "zod"

import { Enter, action, requestJSONAsync, state } from "@tdreyno/fizz"

const Profile = z.object({
  id: z.string(),
  name: z.string(),
})

type Profile = z.infer<typeof Profile>

const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const Loading = state<Enter | typeof profileLoaded | typeof profileFailed>({
  Enter: () =>
    requestJSONAsync("/api/profile")
      .validate(Profile.parse)
      .chainToAction(profileLoaded, error =>
        profileFailed(error instanceof Error ? error.message : "Unknown error"),
      ),
})
```

## Parser and map example

Use `validate(...)` with parser-style validators when the parser returns typed data, and `map(...)` when you want to transform before dispatching an action.

```typescript
import * as z from "zod"

import { Enter, action, customJSONAsync, state } from "@tdreyno/fizz"

const Profile = z.object({
  id: z.string(),
  name: z.string(),
})

const profileNameLoaded = action("ProfileNameLoaded").withPayload<string>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const Loading = state<Enter | typeof profileNameLoaded | typeof profileFailed>({
  Enter: () =>
    customJSONAsync(signal =>
      fetch("/api/profile", { signal }).then(response => response.json()),
    )
      .validate(Profile.parse)
      .map(profile => profile.name)
      .chainToAction(profileNameLoaded, error =>
        profileFailed(error instanceof Error ? error.message : "Unknown error"),
      ),
})
```

## POST example

You can pass through normal `RequestInit` options for verbs such as `POST`, `PUT`, `PATCH`, and `DELETE`.

```typescript
requestJSONAsync("/api/posts", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    title: "Hello world",
  }),
}).chainToAction(postCreated, postFailed)
```

## Cancellable request example

If a request-shaped flow needs explicit cancellation later, put the `asyncId` in the optional `init` object.

```typescript
requestJSONAsync("/api/profile", {
  asyncId: "profile",
}).chainToAction(profileLoaded, profileFailed)

CancelLoad: (_, __, { cancelAsync }) => cancelAsync("profile")
```

## When to use `startAsync` directly

Use `startAsync(...)` directly when you need behavior that the JSON request builder does not expose, such as:

- mapping a non-request async operation
- handling a response format other than `response.json()`
- starting from a promise that is already in flight

```typescript
import { Enter, startAsync, state } from "@tdreyno/fizz"

const profilePromise = fetch("/api/profile").then(response => response.json())

const Loading = state<Enter | typeof profileLoaded>({
  Enter: () =>
    startAsync(
      profilePromise,
      {
        resolve: profileLoaded,
      },
      "profile",
    ),
})
```

## Apollo client example

This pattern uses an Apollo client call that returns parsed data and maps it back into machine actions.

```typescript
import { Enter, action, customJSONAsync, state } from "@tdreyno/fizz"

type Profile = {
  id: string
  name: string
}

type Data = {
  error?: string
  profileName?: string
}

const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const assertProfile = (value: unknown): asserts value is Profile => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    !("name" in value)
  ) {
    throw new Error("Invalid profile payload")
  }
}

const Loading = state<
  Enter | typeof profileLoaded | typeof profileFailed,
  Data
>({
  Enter: (_, __, { context }) =>
    customJSONAsync(
      async signal => {
        const result = await context.apollo.query({
          context: {
            fetchOptions: {
              signal,
            },
          },
          query: context.profileQuery,
        })

        return result.data.profile
      },
      { asyncId: "profile" },
    )
      .validate(assertProfile)
      .chainToAction(profileLoaded, error =>
        profileFailed(error instanceof Error ? error.message : "Unknown error"),
      ),

  ProfileLoaded: (data, profile, { update }) =>
    update({
      ...data,
      profileName: profile.name,
    }),

  ProfileFailed: (data, message, { update }) =>
    update({
      ...data,
      error: message,
    }),
})
```

## OpenAPI client example

This pattern calls a generated OpenAPI client method and uses the same validation and action mapping shape.

```typescript
import { Enter, action, customJSONAsync, state } from "@tdreyno/fizz"

type Profile = {
  id: string
  name: string
}

type Data = {
  error?: string
  profileName?: string
}

const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
const profileFailed = action("ProfileFailed").withPayload<string>()

const assertProfile = (value: unknown): asserts value is Profile => {
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    !("name" in value)
  ) {
    throw new Error("Invalid profile payload")
  }
}

const Loading = state<
  Enter | typeof profileLoaded | typeof profileFailed,
  Data
>({
  Enter: (_, __, { context }) =>
    customJSONAsync(
      signal =>
        context.openApiClient.getProfile({
          signal,
          userId: context.userId,
        }),
      { asyncId: "profile" },
    )
      .validate(assertProfile)
      .chainToAction(profileLoaded, error =>
        profileFailed(error instanceof Error ? error.message : "Unknown error"),
      ),

  ProfileLoaded: (data, profile, { update }) =>
    update({
      ...data,
      profileName: profile.name,
    }),

  ProfileFailed: (data, message, { update }) =>
    update({
      ...data,
      error: message,
    }),
})
```

## Generalized domain error mapping

When multiple clients can throw different error shapes, use a shared domain `Error` subclass in your reject handlers.

```typescript
class DomainRequestError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = "DomainRequestError"
  }
}

const toDomainRequestError = (error: unknown): DomainRequestError => {
  if (error instanceof DomainRequestError) {
    return error
  }

  if (error instanceof Error) {
    return new DomainRequestError(error.message)
  }

  return new DomainRequestError("Unknown request error")
}

customJSONAsync(signal =>
  context.apiClient.getProfile({
    signal,
    userId: context.userId,
  }),
)
  .validate(Profile.parse)
  .chainToAction(profileLoaded, error =>
    profileFailed(toDomainRequestError(error)),
  )
```

## Cancellation and stale completions

- `cancelAsync(asyncId)` cancels the active async operation for that id and dispatches `AsyncCancelled`.
- Same-state `update(...)` transitions keep active async operations running.
- If a state transition replaces the current state instance (for example, moving to a different state), Fizz cancels async work started by that instance.
- Abort-style rejections are suppressed and do not flow into the `reject` handler.
- If an async operation resolves after it has become stale, Fizz ignores the completion.

```text
Cancellation and stale completion behavior

[running async]
  |
  +--> cancelAsync(asyncId)
  |         |
  |         v
  |   AsyncCancelled enters runtime
  |
  +--> state exits before completion
  |         |
  |         v
  |   async is cancelled for that state instance
  |
  +--> completion arrives after becoming stale
        |
        v
       completion is ignored
```

## Related Docs

- [Architecture](./architecture.md)
- [Custom Effects](./custom-effects.md)
- [Complex Actions](./complex-actions.md)
- [Testing](./testing.md)
