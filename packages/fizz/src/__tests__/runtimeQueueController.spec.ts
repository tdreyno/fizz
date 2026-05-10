import { createRuntimeQueueController } from "../runtime/runtimeQueueController.js"

const noop = (): void => undefined

describe("runtimeQueueController", () => {
  test("tracks queue size as items are enqueued", () => {
    const controller = createRuntimeQueueController<string>()

    controller.enqueue({
      item: "first",
      onComplete: noop,
      onError: noop,
    })
    controller.enqueue({
      item: "second",
      onComplete: noop,
      onError: noop,
    })

    expect(controller.size()).toBe(2)
  })

  test("tracks processing lifecycle independently from queue entries", () => {
    const controller = createRuntimeQueueController<string>()

    expect(controller.canStartProcessing()).toBe(true)

    controller.startProcessing()

    expect(controller.canStartProcessing()).toBe(false)

    controller.stopProcessing()

    expect(controller.canStartProcessing()).toBe(true)
  })

  test("tracks initial-enter marker", () => {
    const controller = createRuntimeQueueController<string>()

    expect(controller.hasEnteredInitialState()).toBe(false)

    controller.markEnteredInitialState()
    controller.markEnteredInitialState()

    expect(controller.hasEnteredInitialState()).toBe(true)
  })

  test("disconnect clears queue and resets processing state", () => {
    const controller = createRuntimeQueueController<string>()

    controller.enqueue({
      item: "item",
      onComplete: noop,
      onError: noop,
    })
    controller.startProcessing()

    controller.disconnect()

    expect(controller.size()).toBe(0)
    expect(controller.canStartProcessing()).toBe(true)
  })
})
