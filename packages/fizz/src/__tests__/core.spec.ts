import type { Enter } from "../action"
import { action, enter } from "../action"
import { createInitialContext } from "../context"
import { createMachine } from "../createMachine"
import { noop, output } from "../effect"
import { createRuntime } from "../runtime"
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

    test("should allow an optional machine name argument", () => {
      const machine = createMachine(
        {
          states: { Entry },
        },
        "EntryMachine",
      )

      expect(machine.name).toBe("EntryMachine")
    })

    test("should allow overriding initialState with withInitialState", () => {
      const machine = createMachine({
        initialState: Entry(),
        states: { Entry },
      })

      const nextMachine = machine.withInitialState(Entry())

      expect(nextMachine.initialState).toBeDefined()
      expect(nextMachine.withInitialState).toBeInstanceOf(Function)
    })

    test("should allow outputs alias as machine root config", async () => {
      const notice = action("Notice").withPayload<string>()
      const Start = state<Enter>(
        {
          Enter: () => output(notice("hello")),
        },
        { name: "Start" },
      )

      const machine = createMachine({
        outputs: { notice },
        states: { Start },
      })
      const runtime = createRuntime(machine, Start())
      const outputs: string[] = []

      runtime.onOutput(action => {
        outputs.push(action.type)
      })

      await runtime.run(enter())

      expect(outputs).toEqual(["Notice"])
    })

    test("should reject machine definitions that include both outputs and outputActions", () => {
      const notice = action("Notice").withPayload<string>()

      expect(() =>
        createMachine({
          outputActions: { notice },
          outputs: { notice },
          states: { Entry },
        }),
      ).toThrow(
        "createMachine(...) accepts either outputs or outputActions, not both",
      )
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
