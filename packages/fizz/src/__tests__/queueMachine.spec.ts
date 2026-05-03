import {
  canQueueStartProcessing,
  createQueueMachine,
  markQueueEnteredInitialState,
  startQueueProcessing,
  stopQueueProcessing,
} from "../runtime/queueMachine.js"

describe("queueMachine", () => {
  test("createQueueMachine should initialize idle state", () => {
    const machine = createQueueMachine()

    expect(machine).toEqual({
      hasEnteredInitialState: false,
      status: "idle",
    })
    expect(canQueueStartProcessing(machine)).toBe(true)
  })

  test("startQueueProcessing should transition idle queue to processing", () => {
    const machine = createQueueMachine()

    const updatedMachine = startQueueProcessing(machine)

    expect(updatedMachine).toEqual({
      hasEnteredInitialState: false,
      status: "processing",
    })
    expect(updatedMachine).not.toBe(machine)
    expect(canQueueStartProcessing(updatedMachine)).toBe(false)
  })

  test("startQueueProcessing should be a no-op when already processing", () => {
    const machine = startQueueProcessing(createQueueMachine())

    const updatedMachine = startQueueProcessing(machine)

    expect(updatedMachine).toBe(machine)
  })

  test("stopQueueProcessing should transition processing queue to idle", () => {
    const machine = startQueueProcessing(createQueueMachine())

    const updatedMachine = stopQueueProcessing(machine)

    expect(updatedMachine).toEqual({
      hasEnteredInitialState: false,
      status: "idle",
    })
    expect(updatedMachine).not.toBe(machine)
  })

  test("stopQueueProcessing should be a no-op when already idle", () => {
    const machine = createQueueMachine()

    const updatedMachine = stopQueueProcessing(machine)

    expect(updatedMachine).toBe(machine)
  })

  test("markQueueEnteredInitialState should set initial-entry flag once", () => {
    const machine = createQueueMachine()

    const updatedMachine = markQueueEnteredInitialState(machine)
    const reupdatedMachine = markQueueEnteredInitialState(updatedMachine)

    expect(updatedMachine).toEqual({
      hasEnteredInitialState: true,
      status: "idle",
    })
    expect(updatedMachine).not.toBe(machine)
    expect(reupdatedMachine).toBe(updatedMachine)
  })
})
