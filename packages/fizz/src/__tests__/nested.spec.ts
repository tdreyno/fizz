import { enter } from "../action"
import { createInitialContext } from "../context"
import { NESTED } from "../nested"
import { Runtime } from "../runtime"
import { Actions, States } from "./nestedMachine"
import { setName } from "./nestedMachine/actions"

const CORRECT_TEST_NAME = "Fizz"
const INCORRECT_TEST_NAME = "Test"

const init = async () => {
  const context = createInitialContext([
    States.Entry({ targetName: CORRECT_TEST_NAME }),
  ])

  const runtime = new Runtime(context, Actions)

  await runtime.run(enter())

  return runtime
}

describe("Nested Machines", () => {
  test("should boot top-level machine and initialize sub machine", async () => {
    const runtime = await init()

    expect(runtime.currentState().is(States.Entry)).toBeTruthy()

    expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (runtime.currentState().data as any)[NESTED].currentState().name,
    ).toBe("FormInvalid")
  })

  test("should forward actions to sub machine", async () => {
    const runtime = await init()

    await runtime.run(setName(INCORRECT_TEST_NAME))

    expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (runtime.currentState().data as any)[NESTED].currentState().data.name,
    ).toBe(INCORRECT_TEST_NAME)
  })

  test("should transition sub machine", async () => {
    const runtime = await init()

    await runtime.run(setName(CORRECT_TEST_NAME))

    // Under the sync drain contract, `await run()` resolves only after every
    // action transitively triggered (including parent transitions bubbled up
    // from the nested machine via `trigger`) has been processed. The parent
    // has already moved to `Complete` by the time `run()` resolves.
    expect(runtime.currentState().name).toBe("Complete")
  })
})
