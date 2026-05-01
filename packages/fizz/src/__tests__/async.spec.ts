import { describe, expect, test } from "@jest/globals"
import * as z from "zod"

import type { ActionCreatorType, Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import {
  customJSONAsync,
  debounceAsync,
  noop,
  requestJSONAsync,
  resolveRetryDelayMs,
  startAsync,
} from "../effect"
import {
  createControlledAsyncDriver,
  createControlledTimerDriver,
  Runtime,
} from "../runtime"
import { state } from "../state"

type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T) => void
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return {
    promise,
    reject,
    resolve,
  }
}

type AsyncId = "profile"

type Data = {
  events: string[]
  profileName?: string
}

const appendEvent = (data: Data, event: string): Data => ({
  ...data,
  events: [...data.events, event],
})

const ignoreAsync = () => undefined

type Profile = {
  id: string
  name: string
}

type FakeResponse<T> = {
  json: () => Promise<T>
  ok: boolean
  status: number
}

const createResponse = <T>(options: {
  json: () => Promise<T>
  ok?: boolean
  status?: number
}): FakeResponse<T> => ({
  json: options.json,
  ok: options.ok ?? true,
  status: options.status ?? 200,
})

describe("Async scheduled operations", () => {
  test("should map resolved async work to a user action through the controlled async driver", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<{
      id: string
      name: string
    }>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const loadProfile = deferred<{ id: string; name: string }>()

    const Loading = state<Enter | ProfileLoaded, Data, string, string, AsyncId>(
      {
        Enter: () =>
          startAsync(() => loadProfile.promise, "profile").chainToAction(
            profileLoaded,
            ignoreAsync,
          ),

        ProfileLoaded: (data, profile, { update }) => {
          return update({
            ...appendEvent(data, `loaded:${profile.id}`),
            profileName: profile.name,
          })
        },
      },
      { name: "Loading" },
    )

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, { profileLoaded }, {}, { asyncDriver })

    await runtime.run(enter())

    loadProfile.resolve({ id: "1", name: "Ada" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:1"],
      profileName: "Ada",
    })
  })

  test("should dispatch AsyncCancelled and abort active work when explicitly cancelled", async () => {
    const cancelLoad = action("CancelLoad")
    type CancelLoad = ActionCreatorType<typeof cancelLoad>

    let aborted = false

    const Loading = state<Enter | CancelLoad, Data, string, string, AsyncId>(
      {
        Enter: () =>
          startAsync(
            signal =>
              new Promise<string>((_resolve, reject) => {
                signal.addEventListener("abort", () => {
                  aborted = true
                  reject(new DOMException("Aborted", "AbortError"))
                })
              }),
            "profile",
          ).chainToAction(
            value => action("Unexpected").withPayload<string>()(value),
            ignoreAsync,
          ),

        CancelLoad: (_, __, { cancelAsync }) => cancelAsync("profile"),

        AsyncCancelled: (data, payload, { update }) => {
          const asyncId: "profile" = payload.asyncId

          return update(appendEvent(data, `cancelled:${asyncId}`))
        },
      },
      { name: "Loading" },
    )

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, { cancelLoad }, {}, { asyncDriver })

    await runtime.run(enter())
    await runtime.run(cancelLoad())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(aborted).toBeTruthy()
    expect(currentState.data.events).toEqual(["cancelled:profile"])
  })

  test("should ignore stale completions when startAsync is called without an id", async () => {
    const leave = action("Leave")
    type Leave = ActionCreatorType<typeof leave>

    const profileLoaded = action("ProfileLoaded").withPayload<{
      id: string
      name: string
    }>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const loadProfile = deferred<{ id: string; name: string }>()

    const Done = state<Enter, Data>(
      {
        Enter: noop,
      },
      { name: "Done" },
    )

    const Loading = state<Enter | Leave | ProfileLoaded, Data>(
      {
        Enter: () =>
          startAsync(loadProfile.promise).chainToAction(
            profileLoaded,
            ignoreAsync,
          ),

        Leave: data => Done(appendEvent(data, "left")),

        ProfileLoaded: (data, profile, { update }) => {
          return update({
            ...appendEvent(data, `loaded:${profile.id}`),
            profileName: profile.name,
          })
        },
      },
      { name: "Loading" },
    )

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { leave, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await runtime.run(leave())

    loadProfile.resolve({ id: "1", name: "Ada" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.events).toEqual(["left"])
  })

  test("should keep in-flight async work across a same-state update", async () => {
    const refresh = action("Refresh")
    type Refresh = ActionCreatorType<typeof refresh>

    const profileLoaded = action("ProfileLoaded").withPayload<{
      id: string
      name: string
    }>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const loadProfile = deferred<{ id: string; name: string }>()

    const Loading = state<
      Enter | Refresh | ProfileLoaded,
      Data,
      string,
      string,
      AsyncId
    >(
      {
        Enter: () =>
          startAsync(() => loadProfile.promise, "profile").chainToAction(
            profileLoaded,
            ignoreAsync,
          ),

        Refresh: (data, _, { update }) => update(appendEvent(data, "refresh")),

        ProfileLoaded: (data, profile, { update }) =>
          update({
            ...appendEvent(data, `loaded:${profile.id}`),
            profileName: profile.name,
          }),
      },
      { name: "Loading" },
    )

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileLoaded, refresh },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await runtime.run(refresh())

    loadProfile.resolve({ id: "3", name: "Lin" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["refresh", "loaded:3"],
      profileName: "Lin",
    })
  })

  test("should accept an already in-flight promise", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<{
      id: string
      name: string
    }>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const loadProfile = deferred<{ id: string; name: string }>()

    const Loading = state<Enter | ProfileLoaded, Data, string, string, AsyncId>(
      {
        Enter: () =>
          startAsync(loadProfile.promise, "profile").chainToAction(
            profileLoaded,
            ignoreAsync,
          ),

        ProfileLoaded: (data, profile, { update }) => {
          return update({
            ...appendEvent(data, `loaded:${profile.id}`),
            profileName: profile.name,
          })
        },
      },
      { name: "Loading" },
    )

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, { profileLoaded }, {}, { asyncDriver })

    await runtime.run(enter())

    loadProfile.resolve({ id: "2", name: "Grace" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:2"],
      profileName: "Grace",
    })
  })

  test("should type startAsync and cancelAsync with a fluent id-last signature", () => {
    const profileLoaded = action("ProfileLoaded").withPayload<{
      id: string
      name: string
    }>()

    state<Enter, undefined, string, string, AsyncId>({
      Enter: (_, __, { cancelAsync, startAsync: startAsyncHelper }) => {
        startAsyncHelper(
          Promise.resolve({ id: "1", name: "Ada" }),
          "profile",
        ).chainToAction(profileLoaded, ignoreAsync)

        cancelAsync("profile")

        // @ts-expect-error async id should stay in the last parameter slot
        startAsyncHelper("profile", Promise.resolve({ id: "1", name: "Ada" }))

        // @ts-expect-error startAsync chain requires both resolve and reject
        startAsyncHelper(
          Promise.resolve({ id: "1", name: "Ada" }),
          "profile",
        ).chainToAction(profileLoaded)

        // @ts-expect-error async ids should be narrowed to the declared union
        cancelAsync("unknown")

        return noop()
      },

      AsyncCancelled: (data, payload) => {
        const asyncId: "profile" = payload.asyncId

        return data && asyncId && noop()
      },
    })
  })

  test("should request JSON, validate it, and map the parsed value to a user action", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

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

    let fetchOptions: RequestInit | undefined

    const Loading = state<Enter | ProfileLoaded | ProfileFailed, Data>({
      Enter: () => {
        globalThis.fetch = (async (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          fetchOptions = init

          return createResponse({
            json: async () => ({ id: "1", name: "Ada" }),
          }) as unknown as Response
        }) as typeof fetch

        return requestJSONAsync("/api/profile", {
          headers: {
            Accept: "text/plain",
            "X-Trace": "123",
          },
          method: "POST",
        })
          .validate(assertProfile)
          .chainToAction(profileLoaded, error =>
            profileFailed(
              error instanceof Error ? error.message : "Unknown error",
            ),
          )
      },

      ProfileLoaded: (data, profile, { update }) =>
        update({
          ...appendEvent(data, `loaded:${profile.id}`),
          profileName: profile.name,
        }),

      ProfileFailed: (data, message, { update }) =>
        update({
          ...appendEvent(data, "failed"),
          error: message,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(new Headers(fetchOptions?.headers).get("Accept")).toBe(
      "application/json",
    )
    expect(new Headers(fetchOptions?.headers).get("X-Trace")).toBe("123")
    expect(fetchOptions?.method).toBe("POST")
    expect(currentState.data).toEqual({
      events: ["loaded:1"],
      profileName: "Ada",
    })
  })

  test("should allow requestJSONAsync to run as a bare side-effect", async () => {
    let fetchOptions: RequestInit | undefined

    const Loading = state<Enter, Data>({
      Enter: () => {
        globalThis.fetch = (async (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          fetchOptions = init

          return createResponse({
            json: async () => ({ id: "1", name: "Ada" }),
          }) as unknown as Response
        }) as typeof fetch

        return requestJSONAsync("/api/profile", {
          headers: {
            Accept: "text/plain",
            "X-Trace": "123",
          },
          method: "POST",
        })
      },
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, {}, {}, { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(new Headers(fetchOptions?.headers).get("Accept")).toBe(
      "application/json",
    )
    expect(new Headers(fetchOptions?.headers).get("X-Trace")).toBe("123")
    expect(fetchOptions?.method).toBe("POST")
    expect(currentState.data).toEqual({
      events: [],
    })
  })

  test("should allow validated requestJSONAsync to run as a bare side-effect", async () => {
    let validated = false

    const assertProfile = (value: unknown): asserts value is Profile => {
      if (
        typeof value !== "object" ||
        value === null ||
        !("id" in value) ||
        !("name" in value)
      ) {
        throw new Error("Invalid profile payload")
      }

      validated = true
    }

    const Loading = state<Enter, Data>({
      Enter: () => {
        globalThis.fetch = (async () =>
          createResponse({
            json: async () => ({ id: "1", name: "Ada" }),
          }) as unknown as Response) as typeof fetch

        return requestJSONAsync("/api/profile").validate(assertProfile)
      },
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, {}, {}, { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(validated).toBeTruthy()
    expect(currentState.data).toEqual({
      events: [],
    })
  })

  test("should map customJSONAsync values to a user action", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

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

    const Loading = state<Enter | ProfileLoaded | ProfileFailed, Data>({
      Enter: () =>
        customJSONAsync(async () => ({ id: "9", name: "Mina" }))
          .validate(assertProfile)
          .chainToAction(profileLoaded, error =>
            profileFailed(
              error instanceof Error ? error.message : "Unknown error",
            ),
          ),

      ProfileLoaded: (data, profile, { update }) =>
        update({
          ...appendEvent(data, `loaded:${profile.id}`),
          profileName: profile.name,
        }),

      ProfileFailed: (data, message, { update }) =>
        update({
          ...appendEvent(data, "failed"),
          error: message,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:9"],
      profileName: "Mina",
    })
  })

  test("should allow validated customJSONAsync to run as a bare side-effect", async () => {
    let validated = false

    const assertProfile = (value: unknown): asserts value is Profile => {
      if (
        typeof value !== "object" ||
        value === null ||
        !("id" in value) ||
        !("name" in value)
      ) {
        throw new Error("Invalid profile payload")
      }

      validated = true
    }

    const Loading = state<Enter, Data>({
      Enter: () =>
        customJSONAsync(async () => ({ id: "8", name: "Kai" })).validate(
          assertProfile,
        ),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, {}, {}, { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(validated).toBeTruthy()
    expect(currentState.data).toEqual({
      events: [],
    })
  })

  test("should support zod schema parsing in validate as documented", async () => {
    const Profile = z.object({
      id: z.string(),
      name: z.string(),
    })

    type Profile = z.infer<typeof Profile>

    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    const Loading = state<Enter | ProfileLoaded | ProfileFailed, Data>({
      Enter: () => {
        globalThis.fetch = (async () =>
          createResponse({
            json: async () => ({ id: "1", name: "Ada" }),
          }) as unknown as Response) as typeof fetch

        return (
          requestJSONAsync("/api/profile")
            // eslint-disable-next-line @typescript-eslint/unbound-method
            .validate(Profile.parse)
            .chainToAction(profileLoaded, error =>
              profileFailed(
                error instanceof Error ? error.message : "Unknown error",
              ),
            )
        )
      },

      ProfileLoaded: (data, profile, { update }) =>
        update({
          ...appendEvent(data, `loaded:${profile.id}`),
          profileName: profile.name,
        }),

      ProfileFailed: (data, message, { update }) =>
        update({
          ...appendEvent(data, "failed"),
          error: message,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:1"],
      profileName: "Ada",
    })
  })

  test("should support parser-style validation with validate", async () => {
    const Profile = z.object({
      id: z.string(),
      name: z.string(),
    })

    type Profile = z.infer<typeof Profile>

    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    const Loading = state<Enter | ProfileLoaded | ProfileFailed, Data>({
      Enter: () =>
        customJSONAsync(async () => ({ id: "7", name: "Rita" }))
          .validate(value => Profile.parse(value))
          .chainToAction(profileLoaded, error =>
            profileFailed(
              error instanceof Error ? error.message : "Unknown error",
            ),
          ),

      ProfileLoaded: (data, profile, { update }) =>
        update({
          ...appendEvent(data, `loaded:${profile.id}`),
          profileName: profile.name,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:7"],
      profileName: "Rita",
    })
  })

  test("should allow mapping before chainToAction", async () => {
    const profileNameLoaded = action("ProfileNameLoaded").withPayload<string>()
    type ProfileNameLoaded = ActionCreatorType<typeof profileNameLoaded>

    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    const Loading = state<Enter | ProfileNameLoaded | ProfileFailed, Data>({
      Enter: () => {
        globalThis.fetch = (async () =>
          createResponse({
            json: async () => ({ id: "1", name: "Ada" }),
          }) as unknown as Response) as typeof fetch

        return requestJSONAsync("/api/profile")
          .map(profile => {
            if (
              typeof profile !== "object" ||
              profile === null ||
              !("name" in profile)
            ) {
              throw new Error("Invalid profile payload")
            }

            return String((profile as { name: unknown }).name)
          })
          .chainToAction(profileNameLoaded, error =>
            profileFailed(
              error instanceof Error ? error.message : "Unknown error",
            ),
          )
      },

      ProfileNameLoaded: (data, profileName, { update }) =>
        update({
          ...appendEvent(data, "loaded:name"),
          profileName,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileNameLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:name"],
      profileName: "Ada",
    })
  })

  test("should send non-ok responses to the reject handler", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    const Loading = state<
      Enter | ActionCreatorType<typeof profileLoaded> | ProfileFailed,
      Data
    >({
      Enter: () => {
        globalThis.fetch = (async () =>
          createResponse({
            json: async () => ({ message: "nope" }),
            ok: false,
            status: 422,
          }) as unknown as Response) as typeof fetch

        return requestJSONAsync("/api/profile").chainToAction(
          profileLoaded,
          error =>
            profileFailed(
              error instanceof Error ? error.message : "Unknown error",
            ),
        )
      },

      ProfileFailed: (data, message, { update }) =>
        update({
          ...appendEvent(data, "failed"),
          error: message,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      error: "Request failed with 422",
      events: ["failed"],
    })
  })

  test("should allow cancellation through asyncId in requestJSONAsync init", async () => {
    const cancelLoad = action("CancelLoad")
    type CancelLoad = ActionCreatorType<typeof cancelLoad>

    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    let aborted = false

    const Loading = state<
      | Enter
      | CancelLoad
      | ActionCreatorType<typeof profileLoaded>
      | ProfileFailed,
      Data,
      string,
      string,
      AsyncId
    >({
      Enter: () => {
        globalThis.fetch = (async (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ) => {
          init?.signal?.addEventListener("abort", () => {
            aborted = true
          })

          return new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("Aborted", "AbortError"))
            })
          })
        }) as typeof fetch

        return requestJSONAsync("/api/profile", {
          asyncId: "profile",
        }).chainToAction(profileLoaded, error =>
          profileFailed(
            error instanceof Error ? error.message : "Unknown error",
          ),
        )
      },

      CancelLoad: (_, __, { cancelAsync }) => cancelAsync("profile"),

      AsyncCancelled: (data, payload, { update }) => {
        const asyncId: "profile" = payload.asyncId

        return update(appendEvent(data, `cancelled:${asyncId}`))
      },
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, { cancelLoad }, {}, { asyncDriver })

    await runtime.run(enter())
    await runtime.run(cancelLoad())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(aborted).toBeTruthy()
    expect(currentState.data.events).toEqual(["cancelled:profile"])
  })

  test("should allow cancellation through asyncId in customJSONAsync init", async () => {
    const cancelLoad = action("CancelLoad")
    type CancelLoad = ActionCreatorType<typeof cancelLoad>

    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    let aborted = false

    const Loading = state<
      | Enter
      | CancelLoad
      | ActionCreatorType<typeof profileLoaded>
      | ProfileFailed,
      Data,
      string,
      string,
      AsyncId
    >({
      Enter: () =>
        customJSONAsync(
          signal =>
            new Promise<unknown>((_resolve, reject) => {
              signal.addEventListener("abort", () => {
                aborted = true
                reject(new DOMException("Aborted", "AbortError"))
              })
            }),
          {
            asyncId: "profile",
          },
        ).chainToAction(profileLoaded, error =>
          profileFailed(
            error instanceof Error ? error.message : "Unknown error",
          ),
        ),

      CancelLoad: (_, __, { cancelAsync }) => cancelAsync("profile"),

      AsyncCancelled: (data, payload, { update }) => {
        const asyncId: "profile" = payload.asyncId

        return update(appendEvent(data, `cancelled:${asyncId}`))
      },
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, { cancelLoad }, {}, { asyncDriver })

    await runtime.run(enter())
    await runtime.run(cancelLoad())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(aborted).toBeTruthy()
    expect(currentState.data.events).toEqual(["cancelled:profile"])
  })

  test("should retry requestJSONAsync when retry policy allows", async () => {
    let attempts = 0

    const Loading = state<Enter, Data>({
      Enter: () => {
        globalThis.fetch = (async () => {
          attempts += 1

          if (attempts < 3) {
            return createResponse({
              json: async () => ({ message: "retry" }),
              ok: false,
              status: 503,
            }) as unknown as Response
          }

          return createResponse({
            json: async () => ({ id: "1", name: "Ada" }),
          }) as unknown as Response
        }) as typeof fetch

        return requestJSONAsync("/api/profile", {
          retry: {
            attempts: 3,
            strategy: {
              delayMs: 0,
              kind: "fixed",
            },
          },
        })
      },
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(context, {}, {}, { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(attempts).toBe(3)
    expect(currentState.data).toEqual({ events: [] })
  })

  test("should retry customJSONAsync when retry policy allows", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    let attempts = 0

    const Loading = state<
      Enter | ActionCreatorType<typeof profileLoaded> | ProfileFailed,
      Data
    >({
      Enter: () =>
        customJSONAsync(
          async () => {
            attempts += 1

            if (attempts < 2) {
              throw new Error("retry")
            }

            return { id: "9", name: "Mina" }
          },
          {
            retry: {
              attempts: 3,
              strategy: {
                baseDelayMs: 0,
                kind: "exponential",
              },
            },
          },
        ).chainToAction(profileLoaded, error =>
          profileFailed(
            error instanceof Error ? error.message : "Unknown error",
          ),
        ),

      ProfileLoaded: (data, profile, { update }) =>
        update({
          ...appendEvent(data, `loaded:${profile.id}`),
          profileName: profile.name,
        }),

      ProfileFailed: (data, message, { update }) =>
        update({
          ...appendEvent(data, "failed"),
          error: message,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(attempts).toBe(2)
    expect(currentState.data).toEqual({
      events: ["loaded:9"],
      profileName: "Mina",
    })
  })

  test("should calculate exponential delay with jitter for retry policy", () => {
    const attemptOne = resolveRetryDelayMs(
      {
        random: () => 0.5,
        strategy: {
          baseDelayMs: 100,
          jitter: {
            kind: "full",
            ratio: 0.5,
          },
          kind: "exponential",
          maxDelayMs: 800,
        },
      },
      1,
    )

    const attemptFour = resolveRetryDelayMs(
      {
        random: () => 1,
        strategy: {
          baseDelayMs: 100,
          kind: "exponential",
          maxDelayMs: 800,
        },
      },
      4,
    )

    expect(attemptOne).toBe(75)
    expect(attemptFour).toBe(800)
  })

  test("should pass validator-thrown values to the reject handler unchanged", async () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()
    type ProfileFailed = ActionCreatorType<typeof profileFailed>

    const thrown = new Error("Invalid profile payload")

    const Loading = state<
      Enter | ActionCreatorType<typeof profileLoaded> | ProfileFailed,
      Data
    >({
      Enter: () => {
        globalThis.fetch = (async () =>
          createResponse({
            json: async () => ({ wrong: true }),
          }) as unknown as Response) as typeof fetch

        return requestJSONAsync("/api/profile")
          .validate(() => {
            throw thrown
          })
          .chainToAction(profileLoaded, error =>
            profileFailed(
              error === thrown ? "matched thrown error" : "wrong error",
            ),
          )
      },

      ProfileFailed: (data, message, { update }) =>
        update({
          ...appendEvent(data, "failed"),
          error: message,
        }),
    })

    const context = createInitialContext([Loading({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const runtime = new Runtime(
      context,
      { profileFailed, profileLoaded },
      {},
      {
        asyncDriver,
      },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      error: "matched thrown error",
      events: ["failed"],
    })
  })

  test("should debounce async work and only run the latest scheduled payload", async () => {
    const saveDraft = action("SaveDraft").withPayload<string>()
    type SaveDraft = ActionCreatorType<typeof saveDraft>

    const saved = action("Saved").withPayload<string>()
    type Saved = ActionCreatorType<typeof saved>

    const runs: string[] = []

    const Editing = state<
      Enter | SaveDraft | Saved,
      Data,
      string,
      string,
      "draft"
    >(
      {
        Enter: noop,

        SaveDraft: (_, draft) =>
          debounceAsync(
            async () => {
              runs.push(draft)

              return draft.toUpperCase()
            },
            {
              asyncId: "draft",
              delayMs: 20,
            },
          ).chainToAction(saved),

        Saved: (data, value, { update }) =>
          update(appendEvent(data, `saved:${value}`)),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      context,
      { saveDraft, saved },
      {},
      {
        asyncDriver,
        timerDriver,
      },
    )

    await runtime.run(enter())
    await runtime.run(saveDraft("a"))
    await timerDriver.advanceBy(10)
    await runtime.run(saveDraft("ab"))
    await timerDriver.advanceBy(19)

    expect(runs).toEqual([])

    await timerDriver.advanceBy(1)
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(runs).toEqual(["ab"])
    expect(currentState.data.events).toEqual(["saved:AB"])
  })

  test("should cancel in-flight debounced async work when replaced and ignore stale completion", async () => {
    const saveDraft = action("SaveDraft").withPayload<string>()
    type SaveDraft = ActionCreatorType<typeof saveDraft>

    const saved = action("Saved").withPayload<string>()
    type Saved = ActionCreatorType<typeof saved>

    const requests = new Map<string, Deferred<string>>()
    const aborted: string[] = []

    const Editing = state<
      Enter | SaveDraft | Saved,
      Data,
      string,
      string,
      "draft"
    >(
      {
        Enter: noop,

        SaveDraft: (_, draft) =>
          debounceAsync(
            signal => {
              const request = deferred<string>()

              signal.addEventListener("abort", () => {
                aborted.push(draft)
              })

              requests.set(draft, request)

              return request.promise
            },
            {
              asyncId: "draft",
              delayMs: 10,
            },
          ).chainToAction(saved),

        Saved: (data, value, { update }) =>
          update(appendEvent(data, `saved:${value}`)),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      context,
      { saveDraft, saved },
      {},
      {
        asyncDriver,
        timerDriver,
      },
    )

    await runtime.run(enter())
    await runtime.run(saveDraft("a"))
    await timerDriver.advanceBy(10)
    await runtime.run(saveDraft("ab"))

    requests.get("a")?.resolve("A")
    await asyncDriver.flush()

    await timerDriver.advanceBy(10)

    requests.get("ab")?.resolve("AB")
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(aborted).toEqual(["a"])
    expect(currentState.data.events).toEqual(["saved:AB"])
  })

  test("should cancel pending debounced async work through cancelAsync", async () => {
    const saveDraft = action("SaveDraft")
    type SaveDraft = ActionCreatorType<typeof saveDraft>

    const cancelSave = action("CancelSave")
    type CancelSave = ActionCreatorType<typeof cancelSave>

    const Editing = state<
      Enter | SaveDraft | CancelSave,
      Data,
      string,
      string,
      "draft"
    >(
      {
        Enter: noop,

        SaveDraft: () =>
          debounceAsync(async () => "saved", {
            asyncId: "draft",
            delayMs: 20,
          }).chainToAction(() => undefined),

        CancelSave: (_, __, { cancelAsync }) => cancelAsync("draft"),

        AsyncCancelled: (data, payload, { update }) =>
          update(appendEvent(data, `cancelled:${payload.asyncId}`)),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      context,
      { cancelSave, saveDraft },
      {},
      {
        asyncDriver,
        timerDriver,
      },
    )

    await runtime.run(enter())
    await runtime.run(saveDraft())
    await runtime.run(cancelSave())
    await timerDriver.advanceBy(25)
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual(["cancelled:draft"])
  })

  test("should skip reject mapping for abort-classified debounceAsync failures", async () => {
    const saveDraft = action("SaveDraft")
    type SaveDraft = ActionCreatorType<typeof saveDraft>

    const saveFailed = action("SaveFailed").withPayload<string>()
    type SaveFailed = ActionCreatorType<typeof saveFailed>

    const saveSettled = action("SaveSettled").withPayload<string>()
    type SaveSettled = ActionCreatorType<typeof saveSettled>

    const requests = new Map<string, Deferred<string>>()

    const Editing = state<
      Enter | SaveDraft | SaveFailed | SaveSettled,
      Data,
      string,
      string,
      "draft"
    >(
      {
        Enter: noop,

        SaveDraft: () =>
          debounceAsync(
            signal => {
              const request = deferred<string>()

              signal.addEventListener("abort", () => {
                request.reject(new Error("cancelled"))
              })

              requests.set("draft", request)

              return request.promise
            },
            {
              asyncId: "draft",
              classifyAbort: error =>
                error instanceof Error && error.message === "cancelled",
              delayMs: 10,
            },
          ).chainToAction(saveSettled, error => saveFailed(String(error))),

        SaveFailed: (data, message, { update }) =>
          update(appendEvent(data, `failed:${message}`)),

        SaveSettled: (data, message, { update }) =>
          update(appendEvent(data, `saved:${message}`)),
      },
      { name: "Editing" },
    )

    const context = createInitialContext([Editing({ events: [] })])
    const asyncDriver = createControlledAsyncDriver()
    const timerDriver = createControlledTimerDriver()
    const runtime = new Runtime(
      context,
      { saveDraft, saveFailed, saveSettled },
      {},
      {
        asyncDriver,
        timerDriver,
      },
    )

    await runtime.run(enter())
    await runtime.run(saveDraft())
    await timerDriver.advanceBy(10)
    await runtime.run(saveDraft())
    await asyncDriver.flush()
    await timerDriver.advanceBy(10)

    requests.get("draft")?.resolve("saved")
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!currentState.is(Editing)) {
      throw new Error("Expected Editing state")
    }

    expect(currentState.data.events).toEqual(["saved:saved"])
  })

  test("should type requestJSONAsync with optional validate before chainToAction", () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()

    const assertProfile = (value: unknown): asserts value is Profile => {
      if (typeof value !== "object" || value === null) {
        throw new Error("Expected object")
      }

      const candidate = value as Record<string, unknown>

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string"
      ) {
        throw new TypeError("Expected profile payload")
      }
    }

    requestJSONAsync("/api/profile").chainToAction(profileLoaded, profileFailed)

    requestJSONAsync("/api/profile", {
      asyncId: "profile",
      headers: {
        Accept: "application/json",
      },
    })
      .validate(assertProfile)
      .chainToAction(profileLoaded, profileFailed)

    requestJSONAsync<"profile">("/api/profile", {
      asyncId: "profile",
    }).chainToAction(profileLoaded, profileFailed)

    type ValidatedBuilder = ReturnType<
      ReturnType<typeof requestJSONAsync>["validate"]
    >
    type ChainResult = ReturnType<
      ReturnType<typeof requestJSONAsync>["chainToAction"]
    >

    /* eslint-disable @typescript-eslint/no-unused-vars */
    // @ts-expect-error validate should not be available after chainToAction
    type ValidateAfterChain = ChainResult["validate"]

    // @ts-expect-error validate should only be allowed once
    type ValidateTwice = ValidatedBuilder["validate"]
    /* eslint-enable @typescript-eslint/no-unused-vars */
  })

  test("should type customJSONAsync with optional validate before chainToAction", () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()

    const assertProfile = (value: unknown): asserts value is Profile => {
      if (typeof value !== "object" || value === null) {
        throw new Error("Expected object")
      }

      const candidate = value as Record<string, unknown>

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string"
      ) {
        throw new TypeError("Expected profile payload")
      }
    }

    customJSONAsync(async () => ({ id: "1", name: "Ada" })).chainToAction(
      profileLoaded,
      profileFailed,
    )

    customJSONAsync(async () => ({ id: "1", name: "Ada" }), {
      asyncId: "profile",
    })
      .validate(assertProfile)
      .chainToAction(profileLoaded, profileFailed)

    customJSONAsync<"profile">(async () => ({ id: "1", name: "Ada" }), {
      asyncId: "profile",
    }).chainToAction(profileLoaded, profileFailed)

    type ValidatedBuilder = ReturnType<
      ReturnType<typeof customJSONAsync>["validate"]
    >
    type ChainResult = ReturnType<
      ReturnType<typeof customJSONAsync>["chainToAction"]
    >

    /* eslint-disable @typescript-eslint/no-unused-vars */
    // @ts-expect-error validate should not be available after chainToAction
    type ValidateAfterChain = ChainResult["validate"]

    // @ts-expect-error validate should only be allowed once
    type ValidateTwice = ValidatedBuilder["validate"]
    /* eslint-enable @typescript-eslint/no-unused-vars */
  })

  test("should type debounceAsync with required asyncId and optional reject", () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()
    const profileFailed = action("ProfileFailed").withPayload<string>()

    debounceAsync(async () => ({ id: "1", name: "Ada" }), {
      asyncId: "profile",
      delayMs: 50,
    }).chainToAction(profileLoaded, error => profileFailed(String(error)))

    debounceAsync(async () => ({ id: "1", name: "Ada" }), {
      asyncId: "profile",
      delayMs: 50,
    }).chainToAction(profileLoaded)

    // @ts-expect-error debounceAsync requires asyncId
    debounceAsync(async () => ({ id: "1", name: "Ada" }), {
      delayMs: 50,
    }).chainToAction(profileLoaded)

    // @ts-expect-error debounceAsync requires a lazy run function
    debounceAsync(Promise.resolve({ id: "1", name: "Ada" }), {
      asyncId: "profile",
      delayMs: 50,
    }).chainToAction(profileLoaded)
  })

  test("should type parser-style validate and map stages", () => {
    const profileLoaded = action("ProfileLoaded").withPayload<Profile>()

    const profileFailed = action("ProfileFailed").withPayload<string>()

    const ProfileParser = (value: unknown): Profile => {
      if (typeof value !== "object" || value === null) {
        throw new Error("Expected object")
      }

      const candidate = value as Record<string, unknown>

      if (
        typeof candidate.id !== "string" ||
        typeof candidate.name !== "string"
      ) {
        throw new TypeError("Expected profile payload")
      }

      return {
        id: candidate.id,
        name: candidate.name,
      }
    }

    requestJSONAsync("/api/profile")
      .validate(ProfileParser)
      .map((profile: Profile) => profile.name)
      .chainToAction(
        (name: string) =>
          action("ProfileNameLoaded").withPayload<string>()(name),
        (error: unknown) => profileFailed(String(error)),
      )

    customJSONAsync(async () => ({ id: "1", name: "Ada" }))
      .validate(ProfileParser)
      .map((profile: Profile) => profile.id)
      .chainToAction(
        (id: string) => action("ProfileIdLoaded").withPayload<string>()(id),
        (error: unknown) => profileFailed(String(error)),
      )

    type MappedChainResult = ReturnType<
      ReturnType<typeof customJSONAsync>["map"]
    >

    /* eslint-disable @typescript-eslint/no-unused-vars */
    // @ts-expect-error validate should not be available after map
    type ValidateAfterMap = MappedChainResult["validate"]
    /* eslint-enable @typescript-eslint/no-unused-vars */

    profileLoaded({ id: "1", name: "Ada" })
  })
})
