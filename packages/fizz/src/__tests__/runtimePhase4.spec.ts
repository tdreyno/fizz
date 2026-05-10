import type { Enter } from "../action.js"
import { action, enter } from "../action.js"
import { createMachine } from "../createMachine.js"
import { noop } from "../effect.js"
import { createRuntime } from "../runtime.js"
import type { RuntimeCommandMiddlewareContext } from "../runtime/runtimeCommandMiddleware.js"
import { composeCommandMiddleware } from "../runtime/runtimeCommandMiddleware.js"
import type {
  RuntimeDebugCommand,
  RuntimeDebugEvent,
} from "../runtime/runtimeContracts.js"
import type { RuntimeLifecycleModule } from "../runtime/runtimeModules.js"
import { state } from "../state.js"

// ---------------------------------------------------------------------------
// Unit tests: composeCommandMiddleware
// ---------------------------------------------------------------------------

describe("composeCommandMiddleware", () => {
  const makeContext = (): RuntimeCommandMiddlewareContext => ({
    command: {
      kind: "action",
      action: { type: "test" },
    } as RuntimeDebugCommand,
    lineage: undefined,
  })

  test("calls core when there are no middlewares", async () => {
    let callCount = 0
    const core = async () => {
      callCount++

      return []
    }

    const result = await composeCommandMiddleware([], core, makeContext())

    expect(callCount).toBe(1)
    expect(result).toEqual([])
  })

  test("calls single middleware then core", async () => {
    const order: string[] = []
    const core = async () => {
      order.push("core")

      return []
    }

    await composeCommandMiddleware(
      [
        async (_ctx, next) => {
          order.push("before")
          const out = await next()
          order.push("after")

          return out
        },
      ],
      core,
      makeContext(),
    )

    expect(order).toEqual(["before", "core", "after"])
  })

  test("multiple middlewares compose in registration order (first = outermost)", async () => {
    const order: string[] = []
    const core = async () => {
      order.push("core")

      return []
    }

    await composeCommandMiddleware(
      [
        async (_ctx, next) => {
          order.push("m1-before")
          const out = await next()
          order.push("m1-after")

          return out
        },
        async (_ctx, next) => {
          order.push("m2-before")
          const out = await next()
          order.push("m2-after")

          return out
        },
      ],
      core,
      makeContext(),
    )

    expect(order).toEqual([
      "m1-before",
      "m2-before",
      "core",
      "m2-after",
      "m1-after",
    ])
  })

  test("middleware can short-circuit by not calling next()", async () => {
    let coreCallCount = 0
    const core = async () => {
      coreCallCount++

      return ["from-core" as unknown as RuntimeDebugCommand]
    }

    const result = await composeCommandMiddleware(
      [async () => []],
      core,
      makeContext(),
    )

    expect(coreCallCount).toBe(0)
    expect(result).toEqual([])
  })

  test("middleware receives the command and lineage on context", async () => {
    const captured: RuntimeCommandMiddlewareContext[] = []

    await composeCommandMiddleware(
      [
        async (ctx, next) => {
          captured.push(ctx)

          return next()
        },
      ],
      async () => [],
      makeContext(),
    )

    expect(captured).toHaveLength(1)
    expect(captured[0]?.command.kind).toBe("action")
    expect(captured[0]?.lineage).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// Fixture
// ---------------------------------------------------------------------------

const Entry = state<Enter>({ Enter: noop }, { name: "Entry" })
const Next = state<Enter>({ Enter: noop }, { name: "Next" })
const Go = action("Go")

const EntryWithTransition = state<Enter | ReturnType<typeof Go>>(
  {
    Enter: noop,
    Go: () => Next(),
  },
  { name: "EntryWithTransition" },
)

// ---------------------------------------------------------------------------
// Integration tests: runtime.useMiddleware
// ---------------------------------------------------------------------------

describe("runtime.useMiddleware", () => {
  test("middleware intercepts commands and can observe them", async () => {
    const intercepted: RuntimeDebugCommand[] = []
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {})

    runtime.useMiddleware(async (ctx, next) => {
      intercepted.push(ctx.command)

      return next()
    })

    await runtime.run(enter())

    expect(intercepted.length).toBeGreaterThan(0)
    expect(intercepted[0]?.kind).toBe("action")
  })

  test("useMiddleware returns an unregister function that stops future interception", async () => {
    const intercepted: string[] = []
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {})

    const remove = runtime.useMiddleware(async (ctx, next) => {
      intercepted.push(ctx.command.kind)

      return next()
    })

    await runtime.run(enter())

    const countAfterFirstRun = intercepted.length

    remove()

    await runtime.run(enter())

    expect(intercepted.length).toBe(countAfterFirstRun)
  })

  test("multiple middlewares fire in registration order during a command", async () => {
    const order: string[] = []
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {})

    runtime.useMiddleware(async (_ctx, next) => {
      order.push("m1-before")
      const out = await next()
      order.push("m1-after")

      return out
    })

    runtime.useMiddleware(async (_ctx, next) => {
      order.push("m2-before")
      const out = await next()
      order.push("m2-after")

      return out
    })

    await runtime.run(enter())

    const firstM1 = order.indexOf("m1-before")
    const firstM2 = order.indexOf("m2-before")
    const firstCoreBarrier = order.indexOf("m2-after")

    expect(firstM1).toBeLessThan(firstM2)
    expect(firstM2).toBeLessThan(firstCoreBarrier)
  })

  test("middleware receives lineage on generated commands", async () => {
    const contexts: RuntimeCommandMiddlewareContext[] = []
    const machine = createMachine({ states: { EntryWithTransition } })
    const runtime = createRuntime(machine, EntryWithTransition(), {})

    runtime.useMiddleware(async (ctx, next) => {
      contexts.push(ctx)

      return next()
    })

    await runtime.run(enter())
    await runtime.run(Go())

    const generated = contexts.filter(c => c.lineage?.origin === "generated")

    expect(generated.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Integration tests: runtime.addModule
// ---------------------------------------------------------------------------

type MinimalModule = RuntimeLifecycleModule & {
  callCounts: {
    clear: number
    clearForGoBack: number
    clearForTransition: number
  }
}

const makeMinimalModule = (): MinimalModule => {
  const callCounts = { clear: 0, clearForGoBack: 0, clearForTransition: 0 }

  return {
    callCounts,
    clear: () => {
      callCounts.clear++
    },
    clearForGoBack: () => {
      callCounts.clearForGoBack++
    },
    clearForTransition: () => {
      callCounts.clearForTransition++
    },
    effectHandlers: new Map(),
  }
}

describe("runtime.addModule", () => {
  test("addModule returns an unregister function", () => {
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {})
    const module = makeMinimalModule()

    const unregister = runtime.addModule(module)

    expect(typeof unregister).toBe("function")
  })

  test("lifecycle hooks are called on the added module during transitions", async () => {
    const machine = createMachine({ states: { EntryWithTransition, Next } })
    const runtime = createRuntime(machine, EntryWithTransition(), {})
    const module = makeMinimalModule()

    runtime.addModule(module)

    await runtime.run(enter())
    await runtime.run(Go())

    expect(module.callCounts.clearForTransition).toBeGreaterThan(0)
  })

  test("unregistering a module stops its lifecycle participation", async () => {
    const events: RuntimeDebugEvent[] = []
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {
      monitor: e => events.push(e),
    })
    const module = makeMinimalModule()

    const unregister = runtime.addModule(module)

    await runtime.run(enter())

    const callCountBeforeUnregister = module.callCounts.clearForTransition

    unregister()

    await runtime.run(enter())

    expect(module.callCounts.clearForTransition).toBe(callCountBeforeUnregister)
  })

  test("unregistering module allows re-registering the same effect key", () => {
    const machine = createMachine({ states: { Entry } })
    const runtime = createRuntime(machine, Entry(), {})

    const module = makeMinimalModule()
    module.effectHandlers.set("custom-effect-xyz", () => [])

    const unregister = runtime.addModule(module)

    unregister()

    const module2 = makeMinimalModule()
    module2.effectHandlers.set("custom-effect-xyz", () => [])

    expect(() => runtime.addModule(module2)).not.toThrow()
  })
})
