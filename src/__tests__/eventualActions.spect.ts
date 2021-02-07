/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Subscription } from "@tdreyno/pretty-please"
import { Enter, enter, Exit } from "../action"
import { noop, subscribe, unsubscribe } from "../effect"
import { Runtime } from "../runtime"
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
    const sub = new Subscription<{ type: "Trigger" }>()

    const A = state("A", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return subscribe("trigger", sub)

        case "Trigger":
          return B()
      }
    })

    const context = createInitialContext([A()])

    const runtime = Runtime.create(context, ["Trigger"])

    expect.assertions(2)

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState()!.name).toBe("A")

      sub.emit({ type: "Trigger" }).fork(jest.fn(), () => {
        expect(runtime.currentState()!.name).toBe("B")
      })

      jest.runAllTimers()
    })

    jest.runAllTimers()
  })

  test("should unsubscribe", () => {
    const sub = new Subscription<{ type: "Trigger" }>()

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

    const runtime = Runtime.create(context, ["Trigger"])

    expect.assertions(3)

    runtime.run(enter()).fork(jest.fn(), () => {
      expect(runtime.currentState()!.name).toBe("A")

      sub.emit({ type: "Trigger" }).fork(jest.fn(), () => {
        expect(runtime.currentState()!.name).toBe("C")

        sub.emit({ type: "Trigger" }).fork(jest.fn(), () => {
          expect(runtime.currentState()!.name).toBe("C")
        })

        jest.runAllTimers()
      })

      jest.runAllTimers()
    })

    jest.runAllTimers()
  })
})
