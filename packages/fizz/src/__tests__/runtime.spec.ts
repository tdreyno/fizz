import { jest } from "@jest/globals"

import type { ActionCreatorType, Enter, Exit } from "../action"
import { action, enter } from "../action"
import type { Context } from "../context"
import { createInitialContext } from "../context"
import { createMachine } from "../createMachine"
import { goBack, log, noop } from "../effect"
import { UnknownStateReturnType } from "../errors"
import { createRuntime, Runtime } from "../runtime"
import { state } from "../state"

describe("Runtime", () => {
  test("should transition through multiple states", async () => {
    const A = state<Enter>(
      {
        Enter: () => B(),
      },
      { name: "A" },
    )

    const B = state<Enter>(
      {
        Enter: noop,
      },
      { name: "B" },
    )

    const context = createInitialContext([A()])

    const runtime = new Runtime(context)

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should create a runtime from a machine definition", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>(
      {
        Enter: noop,
        Trigger: () => B(),
      },
      { name: "A" },
    )

    const B = state<Enter>(
      {
        Enter: noop,
      },
      { name: "B" },
    )

    const machine = createMachine({
      actions: { trigger },
      states: { A, B },
    })

    const runtime = createRuntime(machine, A())

    await runtime.run(trigger())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run the action returned", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>({
      Enter: trigger,
      Trigger: () => B(),
    })

    const B = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = new Runtime(context, { trigger })

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run in correct order", async () => {
    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger, { num: number }>({
      Enter: (shared, __, { update }) => {
        return [update({ ...shared, num: shared.num * 5 }), trigger()]
      },

      Trigger: (shared, __, { update }) => {
        return update({ ...shared, num: shared.num - 2 })
      },
    })

    const context = createInitialContext([A({ num: 3 })])

    const runtime = new Runtime(context, { trigger })

    await runtime.run(enter())

    const s = runtime.currentState()

    if (!s.is(A)) {
      throw new Error("Expected current state A")
    }

    expect(s.data.num).toBe(13)
  })

  test("should not throw exception when sending unhandled actions", async () => {
    const trigger = action("Trigger")

    const A = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = new Runtime(context, { trigger })

    await runtime.run(enter())

    await expect(runtime.run(trigger())).resolves.toBeUndefined()
  })

  test("should treat void return as noop", async () => {
    const A = state<Enter>({
      Enter: () => {
        return
      },
    })

    const context = createInitialContext([A()])

    const runtime = new Runtime(context)

    await expect(runtime.run(enter())).resolves.toBeUndefined()
  })

  describe("Entering", () => {
    test("should enter a state and log", async () => {
      const A = state<Enter>(
        {
          Enter: () => log("Hello A"),
        },
        { name: "A" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Hello A"], "log")
    })

    test("should apply context options when creating a runtime from a machine", async () => {
      const A = state<Enter>(
        {
          Enter: () => log("Hello A"),
        },
        { name: "A" },
      )

      const customLogger = jest.fn()
      const machine = createMachine({
        states: { A },
      })

      const runtime = createRuntime(machine, A(), {
        customLogger,
      })

      await runtime.run(enter())

      expect(customLogger).toHaveBeenCalledWith(["Hello A"], "log")
    })

    test("should enter a state and immediately run an action", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const A = state<Enter | Next>(
        {
          Enter: () => next(),
          Next: () => log("Hello A"),
        },
        { name: "A" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Hello A"], "log")
    })

    test("should enter a state and immediately go to another state", async () => {
      const A = state<Enter>(
        {
          Enter: () => B(),
        },
        { name: "A" },
      )

      const B = state<Enter>(
        {
          Enter: () => log("Hello B"),
        },
        { name: "B" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(B)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Hello B"], "log")
    })

    test("should enter a state and immediately update", async () => {
      const A = state<Enter, number>(
        {
          Enter: (n, _, { update }) => update(n + 1),
        },
        { name: "A" },
      )

      const context = createInitialContext([A(1)])

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(runtime.currentState().data).toBe(2)
    })

    test("should enter a state and immediately transition then run an action", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const A = state<Enter>(
        {
          Enter: () => [B(), next()],
        },
        { name: "A" },
      )

      const B = state<Enter | Next>(
        {
          Enter: () => noop(),
          Next: () => log("Next"),
        },
        { name: "B" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], {
        customLogger,
      })

      const runtime = new Runtime(context)
      await runtime.run(enter())

      expect(runtime.currentState().is(B)).toBeTruthy()
      expect(customLogger).toHaveBeenCalledWith(["Next"], "log")
    })

    test("should preserve mixed transition and action results synchronously", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const C = state<Enter>(
        {
          Enter: noop,
        },
        { name: "C" },
      )

      const B = state<Enter | Next>(
        {
          Enter: noop,
          Next: () => C(),
        },
        { name: "B" },
      )

      const A = state<Enter>(
        {
          Enter: () => [B(), next()],
        },
        { name: "A" },
      )

      const context = createInitialContext([A()])
      const runtime = new Runtime(context, { next })

      await runtime.run(enter())

      expect(runtime.currentState().is(C)).toBeTruthy()
    })
  })

  describe("Exit events", () => {
    test("should fire exit events", async () => {
      const A = state<Enter | Exit>(
        {
          Enter: () => [log("Enter A"), B()],
          Exit: () => log("Exit A"),
        },
        { name: "A" },
      )

      const B = state<Enter>(
        {
          Enter: noop,
        },
        { name: "B" },
      )

      const customLogger = jest.fn()

      const context = createInitialContext([A()], { customLogger })

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(runtime.currentState().is(B)).toBeTruthy()

      expect(customLogger).toHaveBeenCalledWith(["Exit A"], "log")
    })
  })

  describe("Transitions", () => {
    test("should flatten nested state transitions", async () => {
      const A = state<Enter>(
        {
          Enter: () => [log("Enter A"), B()],
        },
        { name: "A" },
      )

      const B = state<Enter>(
        {
          Enter: () => [log("Enter B"), C()],
        },
        { name: "B" },
      )

      const C = state<Enter>(
        {
          Enter: () => log("Enter C"),
        },
        { name: "C" },
      )

      const context = createInitialContext([A()])

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(runtime.currentState().is(C)).toBeTruthy()
    })
  })

  describe("update", () => {
    type Data = [str: string, bool: boolean, num: number, fn: () => string]

    const update = action("Update")
    type Update = ActionCreatorType<typeof update>

    const A = state<Enter | Update, Data>({
      Enter: noop,
      Update: (data, _, { update }) => update(data),
    })

    test("should pass through original values", async () => {
      const context = createInitialContext([
        A(["Test", false, 5, () => "Inside"]),
      ])

      const runtime = new Runtime(context)
      await runtime.run(update())

      const state = runtime.currentState()

      if (!state.is(A)) {
        throw new Error("Expected state A")
      }

      const [a, b, c, d] = state.data

      expect(a).toBe("Test")
      expect(b).toBe(false)
      expect(c).toBe(5)

      expect(typeof d).toBe("function")

      if (typeof d !== "function") {
        throw new TypeError("Expected callback function")
      }

      expect((d as () => string)()).toBe("Inside")
    })
  })

  describe("goBack", () => {
    const hi = action("Hi")
    type Hi = ActionCreatorType<typeof hi>

    const trigger = action("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Hi, string>(
      {
        Enter: noop,
        Hi: () => log("Hi"),
      },
      { name: "A" },
    )

    const B = state<Enter | Trigger>(
      {
        Enter: (data, __, { update }) => [update(data), trigger()],
        Trigger: () => [goBack(), hi()],
      },
      { name: "B" },
    )

    test("should return to previous state", async () => {
      const customLogger = jest.fn()

      const context = createInitialContext([B(), A("Test")], {
        customLogger,
      })

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(runtime.currentState().is(A)).toBeTruthy()
      expect(runtime.currentState().data).toBe("Test")
      expect(customLogger).toHaveBeenCalledWith(["Hi"], "log")
    })
  })

  describe("Unknown effect", () => {
    test("should throw error on unknown effect", async () => {
      const A = state<Enter>({
        Enter: () =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          (() => {
            // fake effect
          }) as any,
      })

      const context = createInitialContext([A()])

      const runtime = new Runtime(context)

      await expect(runtime.run(enter())).rejects.toBeInstanceOf(
        UnknownStateReturnType,
      )
    })
  })

  describe("Serialization", () => {
    test("should be able to serialize and deserialize state", async () => {
      const next = action("Next")
      type Next = ActionCreatorType<typeof next>

      const A = state<Enter>(
        {
          Enter: () => B({ name: "Test" }),
        },
        { name: "A" },
      )

      const B = state<Enter | Next, { name: string }>(
        {
          Enter: noop,
          Next: ({ name }) => C(name),
        },
        { name: "B" },
      )

      const C = state<Enter, string>(
        {
          Enter: noop,
        },
        { name: "C" },
      )

      function serializeContext(c: Context) {
        return JSON.stringify(
          c.history.toArray().map(({ data, name }) => ({
            data,
            name,
          })),
        )
      }

      const STATES = { A, B, C }

      function deserializeContext(s: string) {
        const unboundHistory = JSON.parse(s) as Array<{
          data: Array<any>
          name: string
        }>

        return createInitialContext(
          unboundHistory.map(({ data, name }) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return
            return (STATES as any)[name](data)
          }),
        )
      }

      const context = createInitialContext([A()])

      const runtime = new Runtime(context)

      await runtime.run(enter())

      expect(context.currentState.is(B)).toBeTruthy()

      const serialized = serializeContext(context)
      const newContext = deserializeContext(serialized)

      const runtime2 = new Runtime(newContext)

      await runtime2.run(next())

      expect(newContext.currentState.is(C)).toBeTruthy()
      expect(newContext.currentState.data).toBe("Test")
    })
  })
})
