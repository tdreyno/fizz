# Data Clients

Fizz supports machine-scoped data clients so state handlers can call app SDKs directly without bouncing through global output listeners.

Use this page when you want:

- typed client access in handlers via `utils.clients`
- clean dependency injection for runtime setup
- easy mocking in tests
- `customJSONAsync(...)` pipelines backed by app clients

## Why Data Clients

`fetch`-based effects are useful, but many apps use SDKs like OpenAPI clients, GraphQL clients, or service modules. Data clients let the machine call those dependencies directly while keeping transitions explicit and testable.

## Machine Setup

Declare client types in the machine definition (or fluent machine builder), then inject concrete implementations at runtime.

```ts
import { createMachine } from "@tdreyno/fizz"

type ApiClient = {
  getProfile: (options: { signal: AbortSignal; userId: string }) => Promise<{
    id: string
    name: string
  }>
}

const machine = createMachine<
  typeof states,
  typeof actions,
  typeof outputActions,
  unknown,
  Record<string, never>,
  { apiClient: ApiClient }
>({
  actions,
  outputActions,
  states,
})
```

Fluent machine builder version:

```ts
import { machine } from "@tdreyno/fizz/fluent"

const ProfileMachine = machine("ProfileMachine")
  .withClients<{ apiClient: ApiClient }>()
  .withStates({ Loading, Loaded, Failed })
  .withActions(actions)
```

No `.build()` call is required.

## Handler Usage

Access clients from state handler utils and keep side effects in explicit async/effect helpers.

```ts
import { customJSONAsync, state } from "@tdreyno/fizz"

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

Fluent state version:

```ts
import { state } from "@tdreyno/fizz/fluent"

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

Inject clients when creating a runtime.

```ts
import { createRuntime } from "@tdreyno/fizz"

const runtime = createRuntime(machine, initialState, {
  clients: {
    apiClient,
  },
})
```

React integration:

```ts
const context = useMachine(machine, initialState, {
  clients: {
    apiClient,
  },
})
```

## Testing and Mocks

Data clients are easy to mock because they are plain injected dependencies.

```ts
const apiClientMock = {
  getProfile: jest.fn().mockResolvedValue({
    id: "u-1",
    name: "Ada",
  }),
}

const runtime = createRuntime(machine, initialState, {
  clients: {
    apiClient: apiClientMock,
  },
})
```

Benefits:

- no global singleton setup
- no output wiring just to reach app services
- direct assertions on client calls in unit tests

## Choosing Between Helpers

- Use `requestJSONAsync(...)` when Fizz should own transport and JSON parsing.
- Use `customJSONAsync(...)` when your client already returns parsed data.
- Use `startAsync(...)` for non-request promise workflows.

## Related Docs

- [Async](async.md)
- [Custom Effects](custom-effects.md)
- [Testing](testing.md)
- [Fluent API](fluent-api.md)
