import { externalPromise } from "../util.js"

export type RuntimeQueueItem<Command> = {
  item: Command
  onComplete: () => void
  onError: (e: unknown) => void
}

const EMPTY_ITEMS: ReadonlyArray<RuntimeQueueItem<unknown>> = []
const EMPTY_PROMISE: Promise<void[]> = Promise.resolve([])
const toEmptyArray = (): void[] => []

export const queueItemsFromCommands = <Command>(
  commands: ReadonlyArray<Command>,
): {
  items: RuntimeQueueItem<Command>[]
  promise: Promise<void[]>
} => {
  const length = commands.length

  // Fast path: most commands return no children at all.
  if (length === 0) {
    return {
      items: EMPTY_ITEMS as RuntimeQueueItem<Command>[],
      promise: EMPTY_PROMISE,
    }
  }

  // Single-item fast path skips Promise.all allocation.
  if (length === 1) {
    const { promise, reject, resolve } = externalPromise<void>()

    return {
      items: [
        {
          item: commands[0]!,
          onComplete: resolve,
          onError: reject,
        },
      ],
      promise: promise.then(toEmptyArray),
    }
  }

  const items = new Array<RuntimeQueueItem<Command>>(length)
  const promises = new Array<Promise<void>>(length)

  for (let index = 0; index < length; index += 1) {
    const { promise, reject, resolve } = externalPromise<void>()

    items[index] = {
      item: commands[index]!,
      onComplete: resolve,
      onError: reject,
    }
    promises[index] = promise
  }

  return { items, promise: Promise.all(promises) }
}
