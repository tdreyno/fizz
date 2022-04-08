import { ActionCreatorType, Enter, createAction, enter } from "../action"
import { effect, noop } from "../effect"

import { createInitialContext } from "./createInitialContext"
import { createRuntime } from "../runtime"
import { state } from "../state"

describe("Promises", () => {
  const trigger = createAction("Trigger")
  type Trigger = ActionCreatorType<typeof trigger>

  const B = state<Enter>({
    Enter: noop,
  })

  test("should run an action with a promise", async () => {
    const A = state<Enter | Trigger>({
      Enter: async () => trigger(),

      Trigger: B,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run an action with a promise", async () => {
    const promise = Promise.resolve(trigger())

    const A = state<Enter | Trigger>({
      Enter: () => promise,

      Trigger: B,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.assertions(1)

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run transition handler result from a promise", async () => {
    const A = state<Enter>({
      Enter: async () => B(),
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run a single effect returned by the promise", async () => {
    const myEffectExecutor = jest.fn()
    const myEffect = effect("myEffect", undefined, myEffectExecutor)

    const A = state<Enter>({
      Enter: async () => myEffect,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    await runtime.run(enter())

    expect(myEffectExecutor).toBeCalled()
  })

  test("should run multiple effects returned by the promise", async () => {
    const myEffectExecutor1 = jest.fn()
    const myEffect1 = effect("myEffect", undefined, myEffectExecutor1)

    const myEffectExecutor2 = jest.fn()
    const myEffect2 = effect("myEffect", undefined, myEffectExecutor2)

    const A = state<Enter>({
      Enter: async () => [myEffect1, myEffect2],
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    await runtime.run(enter())

    expect(myEffectExecutor1).toBeCalled()
    expect(myEffectExecutor2).toBeCalled()
  })

  test("should run update functions", async () => {
    const A = state<Enter, string>({
      Enter: async (name, _, { update }) => update(name + name),
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    expect(context.currentState.data).toBe("Test")

    await runtime.run(enter())

    expect(context.currentState.data).toBe("TestTest")
  })

  test("should run effects after an update", async () => {
    const myEffectExecutor1 = jest.fn()
    const myEffect1 = effect("myEffect", undefined, myEffectExecutor1)

    const A = state<Enter, string>({
      Enter: async (name, _, { update }) => [update(name + name), myEffect1],
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    await runtime.run(enter())

    expect(myEffectExecutor1).toBeCalled()
  })
})
