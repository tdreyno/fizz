# Data Clients

Use this reference when the task involves machine-scoped service dependencies like API clients, SDK wrappers, or remote data services.

## Goals

- inject service dependencies once per runtime
- access clients directly in state handlers via `utils.clients`
- keep async transitions explicit with Fizz helpers
- mock service dependencies cleanly in tests

## Core Pattern

1. Define client shape in machine typing.
2. Use `utils.clients` in handlers.
3. Inject concrete clients in `createRuntime(...)` or `useMachine(...)` options.

```ts
type ApiClient = {
  getProfile: (options: { signal: AbortSignal; userId: string }) => Promise<{
    id: string
    name: string
  }>
}
```

## Machine Typing

### `createMachine(...)`

```ts
const ProfileMachine = createMachine<
  typeof states,
  typeof actions,
  Record<string, never>,
  unknown,
  Record<string, never>,
  { apiClient: ApiClient }
>({
  actions,
  states,
})
```

### Fluent `machine(...)`

```ts
const ProfileMachine = machine("ProfileMachine")
  .withClients<{ apiClient: ApiClient }>()
  .withStates({ Loading, Loaded, Failed })
  .withActions(actions)
```

No terminal `.build()` is needed.

## Handler Access

### Object state API

```ts
const Loading = state<
  Enter,
  { userId: string },
  string,
  string,
  string,
  Record<string, unknown>,
  { apiClient: ApiClient }
>({
  Enter: (data, _, { clients }) =>
    customJSONAsync(signal =>
      clients.apiClient.getProfile({
        signal,
        userId: data.userId,
      }),
    ).chainToAction(profileLoaded, profileFailed),
})
```

### Fluent state API

```ts
const Loading = state<{ userId: string }>("Loading")
  .withClients<{ apiClient: ApiClient }>()
  .onEnter((data, _, { clients }) =>
    customJSONAsync(signal =>
      clients.apiClient.getProfile({
        signal,
        userId: data.userId,
      }),
    ).chainToAction(profileLoaded, profileFailed),
  )
```

## Runtime Injection

```ts
const runtime = createRuntime(ProfileMachine, initialState, {
  clients: {
    apiClient,
  },
})
```

React:

```ts
const machineValue = useMachine(ProfileMachine, initialState, {
  clients: {
    apiClient,
  },
})
```

If a machine uses imperative command effects, you can derive runtime `commandHandlers` directly from the injected client objects when their shape matches the command schema.

```ts
type Commands = {
  notesEditor: {
    setDocument: {
      payload: { document: string }
      result: { saved: true }
    }
  }
}

const clients = {
  notesEditor: {
    setDocument: async ({ document }: { document: string }) => {
      await editorApi.setDocument(document)

      return { saved: true as const }
    },
  },
}

const runtime = createRuntime(ProfileMachine, initialState, {
  clients,
  commandHandlers: commandHandlersFromClients<Commands>(clients),
})
```

## Testing Pattern

```ts
const apiClientMock = {
  getProfile: jest.fn().mockResolvedValue({ id: "u-1", name: "Ada" }),
}

const runtime = createRuntime(ProfileMachine, initialState, {
  clients: {
    apiClient: apiClientMock,
  },
})
```

Recommended assertions:

- state transition results
- dispatched success/failure actions
- client calls (`toHaveBeenCalledWith(...)`)

## Guidance

- Prefer `customJSONAsync(...)` for app clients that already return parsed values.
- Prefer `requestJSONAsync(...)` only when Fizz should own request/response parsing.
- Keep handlers deterministic and return transitions/actions/effects.
- Avoid global singleton clients in tests when injection can be used instead.

## See Also

- `references/async-and-scheduling.md`
- `references/testing.md`
- `references/fluent-api.md`
