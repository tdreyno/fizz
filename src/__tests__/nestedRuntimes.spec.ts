/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-misused-promises , @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, @typescript-eslint/no-use-before-define, @typescript-eslint/no-explicit-any */
import { Enter, enter, typedAction } from "../action"
import { noop } from "../effect"
import { NoStatesRespondToAction } from "../errors"
import { createRuntime } from "../runtime"
import { state } from "../state"
import { createInitialContext } from "./createInitialContext"

describe("Nested runtimes", () => {
  const trigger = typedAction("Trigger")
  type Trigger = ReturnType<typeof trigger>

  test("should send action to parents if child cannot handle it", () => {
    const Child = state("Child", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const Parent = state("Parent", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return noop()

        case "Trigger":
          return ParentB()
      }
    })

    const ParentB = state("ParentB", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const parentContext = createInitialContext([Parent()])
    const parentRuntime = createRuntime(parentContext)

    const childContext = createInitialContext([Child()])
    const childRuntime = createRuntime(
      childContext,
      [],
      undefined,
      parentRuntime,
    )

    expect.hasAssertions()

    childRuntime.run(trigger()).fork(jest.fn(), () => {
      expect(childRuntime.currentState().name).toBe("Child")
      expect(parentRuntime.currentState().name).toBe("ParentB")
    })

    jest.runAllTimers()
  })

  test("should error if parent and child cannot handle action", () => {
    const Child = state("Child", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const Parent = state("Parent", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const parentContext = createInitialContext([Parent()])
    const parentRuntime = createRuntime(parentContext)

    const childContext = createInitialContext([Child()])
    const childRuntime = createRuntime(
      childContext,
      [],
      undefined,
      parentRuntime,
    )

    expect.assertions(3)

    childRuntime
      .run(trigger())
      .fork(e => expect(e).toBeInstanceOf(NoStatesRespondToAction), jest.fn())

    jest.runAllTimers()

    expect(childRuntime.currentState().name).toBe("Child")
    expect(parentRuntime.currentState().name).toBe("Parent")
  })

  test("should allow parent actions to fire along with local transition", () => {
    const ChildA = state("ChildA", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return [trigger(), ChildB()]
      }
    })

    const ChildB = state("ChildB", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const ParentA = state("ParentA", (action: Enter | Trigger) => {
      switch (action.type) {
        case "Enter":
          return noop()

        case "Trigger":
          return ParentB()
      }
    })

    const ParentB = state("ParentB", (action: Enter) => {
      switch (action.type) {
        case "Enter":
          return noop()
      }
    })

    const parentContext = createInitialContext([ParentA()])
    const parentRuntime = createRuntime(parentContext, ["Trigger"])

    const childContext = createInitialContext([ChildA()])
    const childRuntime = createRuntime(
      childContext,
      [],
      undefined,
      parentRuntime,
    )

    expect.hasAssertions()

    childRuntime.run(enter()).fork(jest.fn(), () => {
      expect(childRuntime.currentState().name).toBe("ChildB")
      expect(parentRuntime.currentState().name).toBe("ParentB")
    })

    jest.runAllTimers()
  })
})
