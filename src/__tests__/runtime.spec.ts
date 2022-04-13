import { ActionCreatorType, Enter, createAction, enter } from "../action"
import { Runtime, createRuntime } from "../runtime"

import { createInitialContext } from "./createInitialContext"
import { noop } from "../effect"
import { state } from "../state"

// describe("Runtime", () => {
//   const trigger = createAction("Trigger")
//   type Trigger = ActionCreatorType<typeof trigger>

//   test("should handle an event", async () => {
//     const A = state<Enter | Trigger>(
//       {
//         Enter: () => noop(),
//         Trigger: () => noop(),
//       },
//       { name: "A" },
//     )

//     const context = createInitialContext([A()])

//     const runtime = new Runtime(context)

//     await runtime.run(enter())

//     expect(runtime.currentState().is(A)).toBeTruthy()
//   })
// })

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

    const runtime = createRuntime(context)

    expect(runtime.currentState().is(A)).toBeTruthy()

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("should run the action returned", async () => {
    const trigger = createAction("Trigger")
    type Trigger = ActionCreatorType<typeof trigger>

    const A = state<Enter | Trigger>({
      Enter: trigger,
      Trigger: () => B(),
    })

    const B = state<Enter>({
      Enter: noop,
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    await runtime.run(enter())

    expect(runtime.currentState().is(B)).toBeTruthy()
  })

  test("onEnter actions should run in correct order", async () => {
    const trigger = createAction("Trigger")
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

    const runtime = createRuntime(context, ["Trigger"])

    await runtime.run(enter())

    expect(runtime.currentState().is(A)).toBeTruthy()

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(runtime.currentState().data.num).toBe(13)
  })
})
