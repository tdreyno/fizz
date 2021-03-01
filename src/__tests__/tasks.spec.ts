import { Task } from "@tdreyno/pretty-please"
import { Enter, enter, createAction, ActionCreatorType } from "../action"
import { effect, noop } from "../effect"
import { createRuntime } from "../runtime"
import { state } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Tasks", () => {
  const trigger = createAction("Trigger")
  type Trigger = ActionCreatorType<typeof trigger>

  const B = state<Enter>({
    Enter: noop,
  })

  test("should run an action with a task", () => {
    const A = state<Enter | Trigger>({
      Enter: () => Task.of(trigger()),

      Trigger: B,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().is(B)).toBeTruthy()
    })

    jest.runAllTimers()
  })

  test("should run an action with a promise", () => {
    const promise = Promise.resolve(trigger())

    const A = state<Enter | Trigger>({
      Enter: () => promise,

      Trigger: B,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.hasAssertions()

    return new Promise<void>(resolve => {
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      runtime.run(enter()).fork(jest.fn(), async () => {
        await promise

        expect(runtime.currentState().is(B)).toBeTruthy()

        resolve()
      })
    })
  })

  test("should run transition handler result from a task", () => {
    const A = state<Enter>({
      Enter: () => Task.of(B()),
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context)

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState().is(B)).toBeTruthy()
    })

    jest.runAllTimers()
  })

  test("should run a single effect returned by the task", () => {
    const myEffectExecutor = jest.fn()
    const myEffect = effect("myEffect", undefined, myEffectExecutor)

    const A = state<Enter>({
      Enter: () => Task.of(myEffect),
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

    const A = state<Enter>({
      Enter: () => Task.of([myEffect1, myEffect2]),
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
    const A = state<Enter, string>({
      Enter: (name, _, { update }) => Task.of(update(name + name)),
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(context.currentState.data).toBe("Test")

    runtime.run(enter()).fork(jest.fn(), jest.fn())

    jest.runAllTimers()

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(context.currentState.data).toBe("TestTest")
  })

  test("should run effects after an update", () => {
    const myEffectExecutor1 = jest.fn()
    const myEffect1 = effect("myEffect", undefined, myEffectExecutor1)

    const A = state<Enter, string>({
      Enter: (name, _, { update }) => Task.of([update(name + name), myEffect1]),
    })

    const context = createInitialContext([A("Test")])

    const runtime = createRuntime(context)

    expect.hasAssertions()

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(myEffectExecutor1).toBeCalled()
    })

    jest.runAllTimers()
  })
})
