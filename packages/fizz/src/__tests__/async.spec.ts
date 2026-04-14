import { describe, expect, test } from "@jest/globals"
import * as z from "zod"

import type { ActionCreatorType, Enter } from "../action"
import { createAction, enter } from "../action"
import { createInitialContext } from "../context"
import { noop, requestJSONAsync, startAsync } from "../effect"
import { createControlledAsyncDriver, createRuntime } from "../runtime"
import { isState, state } from "../state"

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
    const profileLoaded = createAction<
      "ProfileLoaded",
      { id: string; name: string }
    >("ProfileLoaded")
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const loadProfile = deferred<{ id: string; name: string }>()

    const Loading = state<Enter | ProfileLoaded, Data, string, string, AsyncId>(
      {
        Enter: () =>
          startAsync(
            () => loadProfile.promise,
            {
              resolve: profileLoaded,
            },
            "profile",
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
    const runtime = createRuntime(
      context,
      { profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())

    loadProfile.resolve({ id: "1", name: "Ada" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:1"],
      profileName: "Ada",
    })
  })

  test("should dispatch AsyncCancelled and abort active work when explicitly cancelled", async () => {
    const cancelLoad = createAction("CancelLoad")
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
            {
              resolve: value =>
                createAction<"Unexpected", string>("Unexpected")(value),
            },
            "profile",
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
    const runtime = createRuntime(context, { cancelLoad }, {}, { asyncDriver })

    await runtime.run(enter())
    await runtime.run(cancelLoad())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(aborted).toBeTruthy()
    expect(currentState.data.events).toEqual(["cancelled:profile"])
  })

  test("should ignore stale completions when startAsync is called without an id", async () => {
    const leave = createAction("Leave")
    type Leave = ActionCreatorType<typeof leave>

    const profileLoaded = createAction<
      "ProfileLoaded",
      { id: string; name: string }
    >("ProfileLoaded")
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
          startAsync(loadProfile.promise, {
            resolve: profileLoaded,
          }),

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
    const runtime = createRuntime(
      context,
      { leave, profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await runtime.run(leave())

    loadProfile.resolve({ id: "1", name: "Ada" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Done)) {
      throw new Error("Expected Done state")
    }

    expect(currentState.data.events).toEqual(["left"])
  })

  test("should accept an already in-flight promise", async () => {
    const profileLoaded = createAction<
      "ProfileLoaded",
      { id: string; name: string }
    >("ProfileLoaded")
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const loadProfile = deferred<{ id: string; name: string }>()

    const Loading = state<Enter | ProfileLoaded, Data, string, string, AsyncId>(
      {
        Enter: () =>
          startAsync(
            loadProfile.promise,
            {
              resolve: profileLoaded,
            },
            "profile",
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
    const runtime = createRuntime(
      context,
      { profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())

    loadProfile.resolve({ id: "2", name: "Grace" })
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:2"],
      profileName: "Grace",
    })
  })

  test("should type startAsync and cancelAsync with an id-last signature", () => {
    const profileLoaded = createAction<
      "ProfileLoaded",
      { id: string; name: string }
    >("ProfileLoaded")

    state<Enter, undefined, string, string, AsyncId>({
      Enter: (_, __, { cancelAsync, startAsync: startAsyncHelper }) => {
        startAsyncHelper(
          Promise.resolve({ id: "1", name: "Ada" }),
          {
            resolve: profileLoaded,
          },
          "profile",
        )

        cancelAsync("profile")

        // @ts-expect-error async id should stay in the last parameter slot
        startAsyncHelper("profile", Promise.resolve({ id: "1", name: "Ada" }), {
          resolve: profileLoaded,
        })

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
    const profileLoaded = createAction<"ProfileLoaded", Profile>(
      "ProfileLoaded",
    )
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const profileFailed = createAction<"ProfileFailed", string>("ProfileFailed")
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
    const runtime = createRuntime(
      context,
      { profileFailed, profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
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
    const runtime = createRuntime(context, {}, {}, { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
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
    const runtime = createRuntime(context, {}, {}, { asyncDriver })

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
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

    const profileLoaded = createAction<"ProfileLoaded", Profile>(
      "ProfileLoaded",
    )
    type ProfileLoaded = ActionCreatorType<typeof profileLoaded>

    const profileFailed = createAction<"ProfileFailed", string>("ProfileFailed")
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
    const runtime = createRuntime(
      context,
      { profileFailed, profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      events: ["loaded:1"],
      profileName: "Ada",
    })
  })

  test("should send non-ok responses to the reject handler", async () => {
    const profileLoaded = createAction<"ProfileLoaded", Profile>(
      "ProfileLoaded",
    )
    const profileFailed = createAction<"ProfileFailed", string>("ProfileFailed")
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
    const runtime = createRuntime(
      context,
      { profileFailed, profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      error: "Request failed with 422",
      events: ["failed"],
    })
  })

  test("should allow cancellation through asyncId in requestJSONAsync init", async () => {
    const cancelLoad = createAction("CancelLoad")
    type CancelLoad = ActionCreatorType<typeof cancelLoad>

    const profileLoaded = createAction<"ProfileLoaded", Profile>(
      "ProfileLoaded",
    )
    const profileFailed = createAction<"ProfileFailed", string>("ProfileFailed")
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
    const runtime = createRuntime(context, { cancelLoad }, {}, { asyncDriver })

    await runtime.run(enter())
    await runtime.run(cancelLoad())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(aborted).toBeTruthy()
    expect(currentState.data.events).toEqual(["cancelled:profile"])
  })

  test("should pass validator-thrown values to the reject handler unchanged", async () => {
    const profileLoaded = createAction<"ProfileLoaded", Profile>(
      "ProfileLoaded",
    )
    const profileFailed = createAction<"ProfileFailed", string>("ProfileFailed")
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
    const runtime = createRuntime(
      context,
      { profileFailed, profileLoaded },
      {},
      { asyncDriver },
    )

    await runtime.run(enter())
    await asyncDriver.flush()

    const currentState = runtime.currentState()

    if (!isState(currentState, Loading)) {
      throw new Error("Expected Loading state")
    }

    expect(currentState.data).toEqual({
      error: "matched thrown error",
      events: ["failed"],
    })
  })

  test("should type requestJSONAsync with optional validate before chainToAction", () => {
    const profileLoaded = createAction<"ProfileLoaded", Profile>(
      "ProfileLoaded",
    )
    const profileFailed = createAction<"ProfileFailed", string>("ProfileFailed")

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
})
