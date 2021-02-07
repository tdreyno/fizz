/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Task } from "@tdreyno/pretty-please"
import { Enter, enter, typedAction } from "../action"
import { effect, noop } from "../effect"
import { createRuntime } from "../runtime"
import { state, StateReturn } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Tasks", () => {
  const trigger = typedAction("Trigger")
  type Trigger = ReturnType<typeof trigger>

  const B = state("B", (action: Enter) => {
    switch (action.type) {
      case "Enter":
        return noop()
    }
  })

  test("should run an action with a task", () => {
    const A = state("A", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return Task.of(trigger())

        case "Trigger":
          return B()
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("B")
    })

    jest.runAllTimers()
  })

  test("should run an action with a promise", () => {
    const promise = Promise.resolve(trigger())

    const A = state("A", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return promise

        case "Trigger":
          return B()
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.hasAssertions()

    return new Promise<void>(resolve => {
      runtime.run(enter()).fork(jest.fn(), async () => {
        await promise

        expect(runtime.currentState().name).toBe("B")

        resolve()
      })
    })
  })

  test("should run transition handler result from a task", () => {
    const A = state("A", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return Task.of(B())
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().name).toBe("B")
    })

    jest.runAllTimers()
  })

  test("should run a single effect returned by the task", () => {
    const myEffectExecutor = jest.fn()
    const myEffect = effect("myEffect", undefined, myEffectExecutor)

    const A = state("A", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return Task.of(myEffect)
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(myEffectExecutor).toBeCalled()
    })

    jest.runAllTimers()
  })

  test("should run multiple effects returned by the task", () => {
    const myEffectExecutor1 = jest.fn()
    const myEffect1 = effect("myEffect", undefined, myEffectExecutor1)

    const myEffectExecutor2 = jest.fn()
    const myEffect2 = effect("myEffect", undefined, myEffectExecutor2)

    const A = state("A", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return Task.of([myEffect1, myEffect2])
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(myEffectExecutor1).toBeCalled()
      expect(myEffectExecutor2).toBeCalled()
    })

    jest.runAllTimers()
  })

  test("should run update functions", () => {
    const A = state(
      "A",
      (action: Enter, name: string): StateReturn => {
        switch (action.type) {
          case "Enter":
            return Task.of(A.update(name + name))
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    expect(context.currentState.data[0]).toBe("Test")

    runtime.run(enter()).fork(jest.fn(), jest.fn())

    jest.runAllTimers()

    expect(context.currentState.data[0]).toBe("TestTest")
  })

  test("should run effects after an update", () => {
    const myEffectExecutor1 = jest.fn()
    const myEffect1 = effect("myEffect", undefined, myEffectExecutor1)

    const A = state(
      "A",
      (action: Enter, name: string): StateReturn => {
        switch (action.type) {
          case "Enter":
            return Task.of([A.update(name + name), myEffect1])
        }
      },
    )

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(myEffectExecutor1).toBeCalled()
    })

    jest.runAllTimers()
  })
})
