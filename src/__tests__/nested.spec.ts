import { enter, beforeEnter } from "../action"
import { isState, NESTED } from "../state"
import { createInitialContext } from "../context"
import { createRuntime } from "../runtime"
import { States, Actions } from "./nestedMachine"
import { timeout } from "./util"
import { setName } from "./nestedMachine/actions"

const CORRECT_TEST_NAME = "Fizz"
const INCORRECT_TEST_NAME = "Test"

const init = async () => {
  const context = createInitialContext([
    States.Entry({ targetName: CORRECT_TEST_NAME }),
  ])

  const runtime = createRuntime(context, Object.keys(Actions))

  await runtime.run(beforeEnter(runtime))
  await runtime.run(enter())

  return runtime
}

describe("Nested Machines", () => {
  test("should boot top-level machine and initialize sub machine", async () => {
    const runtime = await init()

    expect(isState(runtime.currentState(), States.Entry)).toBeTruthy()

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

    expect(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      (runtime.currentState().data as any)[NESTED].currentState().name,
    ).toBe("FormValid")

    // Wait for event to travel from sub to parent
    await timeout(100)

    expect(runtime.currentState().name).toBe("Complete")
  })
})
