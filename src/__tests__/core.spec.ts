import type { Enter } from "../action"
import { createInitialContext } from "../context"
import { noop } from "../effect"
import { state } from "../state"

describe("Fizz core", () => {
  describe("States", () => {
    const Entry = state<Enter>(
      {
        Enter: noop,
      },
      { name: "Entry" },
    )

    test("should allow custom state name", () => {
      expect(Entry.name).toBe("Entry")
    })

    test("should start in the state last in the history list", () => {
      const result = createInitialContext([Entry()]).currentState

      expect(result.is(Entry)).toBeTruthy()
      expect(result.isNamed("Entry")).toBeTruthy()
    })
  })

  // describe.skip("Reenter", () => {
  //   interface ReEnterReplace {
  //     type: "ReEnterReplace"
  //     payload: undefined
  //   }

  //   interface ReEnterAppend {
  //     type: "ReEnterAppend"
  //     payload: undefined
  //   }

  //   const A = state<Enter | Exit | ReEnterReplace | ReEnterAppend, boolean>({
  //     Enter: noop,
  //     Exit: noop,
  //     ReEnterReplace: (bool, _, { update }) => update(bool),
  //     ReEnterAppend: (bool, _, { reenter }) => reenter(bool),
  //   })

  //   test("should exit and re-enter the current state, replacing itself in history", () => {
  //     const context = createInitialContext([A(true)])

  //     const effects = execute(
  //       { type: "ReEnterReplace" } as Action<"ReEnterReplace", undefined>,
  //       context,
  //     )

  //     expect(effects).toBeInstanceOf(Array)
  //     expect(context.history).toHaveLength(1)
  //   })

  //   test("should exit and re-enter the current state, appending itself to history", () => {
  //     const context = createInitialContext([A(true)])

  //     const effects = execute(
  //       { type: "ReEnterAppend" } as Action<"ReEnterAppend", undefined>,
  //       context,
  //     )

  //     expect(effects).toBeInstanceOf(Array)
  //     expect(context.history).toHaveLength(2)
  //   })
  // })
})
