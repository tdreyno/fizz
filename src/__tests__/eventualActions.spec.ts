import { Subscription } from "@tdreyno/pretty-please"
import { Action, Enter, enter, Exit } from "../action"
import { noop, subscribe, unsubscribe } from "../effect"
import { createRuntime } from "../runtime"
import { state } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Eventual actions", () => {
  interface Trigger {
    type: "Trigger"
  }

  const B = state("B", (action: Enter) => {
    switch (action.type) {
      case "Enter":
        return noop()
    }
  })

  test("should listen for eventual actions", () => {
    const sub = new Subscription<Action<"Trigger", undefined>>()

    const A = state("A", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return subscribe("trigger", sub)

        case "Trigger":
          return B()
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.assertions(2)

    runtime.run(enter()).fork(jest.fn(), () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(runtime.currentState()!.name).toBe("A")

      sub
        .emit({ type: "Trigger" } as Action<"Trigger", undefined>)
        .fork(jest.fn(), () => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          expect(runtime.currentState()!.name).toBe("B")
        })

      jest.runAllTimers()
    })

    jest.runAllTimers()
  })

  test("should unsubscribe", () => {
    const sub = new Subscription<Action<"Trigger", undefined>>()

    const A = state("A", (action: Enter | Trigger | Exit) => {
      switch (action.type) {
        case "Enter":
          return subscribe("trigger", sub)

        case "Trigger":
          return C()

        case "Exit":
          return unsubscribe("trigger")
      }
    })

    const C = state("C", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return noop()

        case "Trigger":
          return B()
      }
    })

    const context = createInitialContext([A()])

    const runtime = createRuntime(context, ["Trigger"])

    expect.assertions(3)

    runtime.run(enter()).fork(jest.fn(), () => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      expect(runtime.currentState()!.name).toBe("A")

      sub
        .emit({ type: "Trigger" } as Action<"Trigger", undefined>)
        .fork(jest.fn(), () => {
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          expect(runtime.currentState()!.name).toBe("C")

          sub
            .emit({ type: "Trigger" } as Action<"Trigger", undefined>)
            .fork(jest.fn(), () => {
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              expect(runtime.currentState()!.name).toBe("C")
            })

          jest.runAllTimers()
        })

      jest.runAllTimers()
    })

    jest.runAllTimers()
  })
})
