/* eslint-disable @typescript-eslint/no-unused-vars, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import serializeJavascript from "serialize-javascript"
import { Action, Enter, enter, Exit } from "../action"
import {
  Context,
  createInitialContext as originalCreateInitialContext,
} from "../context"
import { execute } from "../core"
import { goBack, log, noop } from "../effect"
import { StateDidNotRespondToAction, UnknownStateReturnType } from "../errors"
import { state, StateTransition } from "../state"

function createInitialContext(
  history: Array<StateTransition<any, any, any>>,
  options = {},
) {
  return originalCreateInitialContext(history, {
    disableLogging: true,
    ...options,
  })
}

describe("Fizz core", () => {
  describe("States", () => {
    const Entry = state<Enter>(
      {
        Enter: noop,
      },
      { debugName: "Entry" },
    )

    test("should allow custom state name", () => {
      expect(Entry.name).toBe("Entry")
    })

    test("should start in the state last in the history list", () => {
      expect(
        createInitialContext([Entry()]).currentState.is(Entry),
      ).toBeTruthy()
    })

    test("should throw exception when getting invalid action", () => {
      expect(() =>
        execute(
          { type: "Fake" } as Action<"Fake", undefined>,
          createInitialContext([Entry()], {
            allowUnhandled: false,
          }),
        ),
      ).toThrowError(StateDidNotRespondToAction)
    })

    test("should not throw exception when allowing invalid actions", () => {
      expect(() =>
        execute(
          { type: "Fake" } as Action<"Fake", undefined>,
          createInitialContext([Entry()], {
            allowUnhandled: true,
          }),
        ),
      ).not.toThrowError(StateDidNotRespondToAction)
    })
  })

  describe("Transitions", () => {
    test("should flatten nested state transitions", () => {
      const A = state<Enter>(
        {
          Enter: () => [log("Enter A"), B()],
        },
        { debugName: "A" },
      )

      const B = state<Enter>(
        {
          Enter: () => [log("Enter B"), C()],
        },
        { debugName: "B" },
      )

      const C = state<Enter>(
        {
          Enter: () => log("Entered C"),
        },
        { debugName: "C" },
      )

      const { effects } = execute(enter(), createInitialContext([A()]))

      expect(effects).toBeInstanceOf(Array)

      const gotos = effects.filter(r => r.label === "entered")
      expect(gotos).toHaveLength(3)

      const gotoLogs = effects.filter(
        r => r.label === "log" && r.data[0].match(/^Enter:/),
      )
      expect(gotoLogs).toHaveLength(3)

      const normalLogs = effects.filter(
        r => r.label === "log" && r.data[0].match(/^Enter /),
      )
      expect(normalLogs).toHaveLength(2)
    })
  })

  describe("Exit events", () => {
    test("should fire exit events", () => {
      const A = state<Enter | Exit>(
        {
          Enter: () => [log("Enter A"), B()],
          Exit: () => log("Exit A"),
        },
        { debugName: "A" },
      )

      const B = state<Enter | Exit>(
        {
          Enter: noop,
          Exit: () => log("Exit B"),
        },
        { debugName: "B" },
      )

      const { effects } = execute(
        enter(),
        createInitialContext([A()], {
          allowUnhandled: true,
        }),
      )

      expect(effects).toBeInstanceOf(Array)

      const events = effects.filter(r =>
        ["entered", "exited"].includes(r.label),
      )

      expect(events[0]).toMatchObject({
        label: "entered",
        data: { name: "A" },
      })
      expect(events[1]).toMatchObject({
        label: "exited",
        data: { name: "A" },
      })
      expect(events[2]).toMatchObject({
        label: "entered",
        data: { name: "B" },
      })
    })
  })

  describe("Reenter", () => {
    interface ReEnterReplace {
      type: "ReEnterReplace"
      payload: undefined
    }

    interface ReEnterAppend {
      type: "ReEnterAppend"
      payload: undefined
    }

    const A = state<Enter | Exit | ReEnterReplace | ReEnterAppend, boolean>({
      Enter: noop,
      Exit: noop,
      ReEnterReplace: (bool, _, { update }) => update(bool),
      ReEnterAppend: (bool, _, { reenter }) => reenter(bool),
    })

    test("should exit and re-enter the current state, replacing itself in history", () => {
      const context = createInitialContext([A(true)])

      const { effects } = execute(
        { type: "ReEnterReplace" } as Action<"ReEnterReplace", undefined>,
        context,
      )

      expect(effects).toBeInstanceOf(Array)
      expect(context.history).toHaveLength(1)
    })

    test("should exit and re-enter the current state, appending itself to history", () => {
      const context = createInitialContext([A(true)])

      const { effects } = execute(
        { type: "ReEnterAppend" } as Action<"ReEnterAppend", undefined>,
        context,
      )

      expect(effects).toBeInstanceOf(Array)
      expect(context.history).toHaveLength(2)
    })
  })

  describe("goBack", () => {
    interface GoBack {
      type: "GoBack"
      payload: undefined
    }

    const A = state<Enter, string>(
      {
        Enter: noop,
      },
      { debugName: "A" },
    )

    const B = state<Enter | GoBack>(
      {
        Enter: noop,
        GoBack: () => goBack(),
      },
      { debugName: "B" },
    )

    test("should return to previous state", () => {
      const context = createInitialContext([B(), A("Test")])

      const { effects } = execute(
        { type: "GoBack" } as Action<"GoBack", undefined>,
        context,
      )
      expect(effects).toBeInstanceOf(Array)

      const events = effects.filter(r =>
        ["entered", "exited"].includes(r.label),
      )

      expect(events[0]).toMatchObject({
        label: "exited",
        data: { name: "B" },
      })
      expect(events[1]).toMatchObject({
        label: "entered",
        data: { name: "A" },
      })

      expect(context.currentState.is(A)).toBeTruthy()
      expect(context.currentState.data).toBe("Test")
    })
  })

  describe("update", () => {
    type Data = [str: string, bool: boolean, num: number, fn: () => string]

    type Update = Action<"Update", undefined>

    const A = state<Enter | Update, Data>({
      Enter: noop,
      Update: (data, _, { update }) => update(data),
    })

    test("should pass through original values", () => {
      const context = createInitialContext([
        A(["Test", false, 5, () => "Inside"]),
      ])

      const action: Update = {
        type: "Update",
        payload: undefined,
      }

      execute(action, context)

      expect(context.currentState.data[0]).toBe("Test")
      expect(context.currentState.data[1]).toBe(false)
      expect(context.currentState.data[2]).toBe(5)
      expect(context.currentState.data[3]()).toBe("Inside")
    })
  })

  describe("Serialization", () => {
    test("should be able to serialize and deserialize state", () => {
      interface Next {
        type: "Next"
        payload: undefined
      }

      const A = state<Enter>(
        {
          Enter: () => B({ name: "Test" }),
        },
        { debugName: "A" },
      )

      const B = state<Enter | Next, { name: string }>(
        {
          Enter: noop,
          Next: ({ name }) => C(name),
        },
        { debugName: "B" },
      )

      const C = state<Enter, string>(
        {
          Enter: noop,
        },
        { debugName: "C" },
      )

      function serializeContext(c: Context) {
        return serializeJavascript(
          c.history.map(({ data, name }) => ({
            data,
            name,
          })),
        )
      }

      const STATES = { A, B, C }

      function deserializeContext(s: string) {
        const unboundHistory: Array<{ data: Array<any>; name: string }> = eval(
          "(" + s + ")",
        )

        return createInitialContext(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return
          unboundHistory.map(({ data, name }) => (STATES as any)[name](data)),
        )
      }

      const context = createInitialContext([A()], {
        allowUnhandled: false,
      })

      execute(enter(), context)

      expect(context.currentState.is(B)).toBeTruthy()
      const serialized = serializeContext(context)

      const newContext = deserializeContext(serialized)

      execute({ type: "Next" } as Action<"Next", undefined>, newContext)

      expect(newContext.currentState.is(C)).toBeTruthy()
      expect(newContext.currentState.data).toBe("Test")
    })
  })

  describe("Unknown effect", () => {
    test("should throw error on unknown effect", () => {
      const A = state<Enter>({
        Enter: () =>
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          (() => {
            // fake effect
          }) as any,
      })

      const context = createInitialContext([A()])

      expect(() => execute(enter(), context)).toThrowError(
        UnknownStateReturnType,
      )
    })
  })

  describe("State Args are immutable", () => {
    test("should not mutate original data when transitioning", () => {
      const A = state<Enter, Array<number>>({
        Enter: data => {
          data.push(4)

          return B(data)
        },
      })

      const B = state<Enter, Array<number>>({
        Enter: noop,
      })

      const originalData = [1, 2, 3]

      const context = createInitialContext([A(originalData)])

      execute(enter(), context)

      expect(context.currentState.is(B)).toBeTruthy()
      expect(originalData).toEqual([1, 2, 3])
      expect(context.currentState.data).toEqual([1, 2, 3, 4])
    })

    test("should not mutate original data when updating", () => {
      const A = state<Enter, Array<number>>({
        Enter: (data, _, { update }) => {
          data.push(4)

          return update(data)
        },
      })

      const originalData = [1, 2, 3]

      const context = createInitialContext([A(originalData)])

      execute(enter(), context)

      expect(originalData).toEqual([1, 2, 3])
      expect(context.currentState.data).toEqual([1, 2, 3, 4])
    })

    test("should not break functions or instances when making immutable", () => {
      const fnChecker = jest.fn()
      const testFn = () => {
        fnChecker()
      }

      const classChecker = jest.fn()
      class TestClass {
        run() {
          classChecker()
        }
      }

      interface Shared {
        fn: () => void
        klass: TestClass
      }

      const A = state<Enter, Shared>({
        Enter: (shared, _, { update }) => {
          shared.fn()
          shared.klass.run()

          return update(shared)
        },
      })

      const instance = new TestClass()
      const originalData = {
        fn: testFn,
        klass: instance,
      }

      const context = createInitialContext([A(originalData)])

      execute(enter(), context)

      expect(fnChecker).toHaveBeenCalledTimes(1)
      expect(classChecker).toHaveBeenCalledTimes(1)

      expect(context.currentState.data.fn).toBe(testFn)
      expect(context.currentState.data.klass).toBe(instance)
    })

    test("should mutate original data when enabling mutability", () => {
      const A = state<Enter, Array<number>>(
        {
          Enter: (data, _, { update }) => {
            data.push(4)

            return update(data)
          },
        },
        { mutable: true },
      )

      const originalData = [1, 2, 3]

      const context = createInitialContext([A(originalData)])

      execute(enter(), context)

      expect(originalData).toEqual([1, 2, 3, 4])

      expect(context.currentState.data).toEqual([1, 2, 3, 4])
    })
  })
})
