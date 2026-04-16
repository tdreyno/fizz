import { externalPromise } from "../util.js"

export type RuntimeQueueItem<Command> = {
  item: Command
  onComplete: () => void
  onError: (e: unknown) => void
}

export const queueItemsFromCommands = <Command>(commands: Command[]) => {
  const { promises, items } = commands.reduce(
    (acc, item) => {
      const { promise, reject, resolve } = externalPromise<void>()

      acc.promises.push(promise)
      acc.items.push({
        item,
        onComplete: resolve,
        onError: reject,
      })

      return acc
    },
    {
      items: [] as RuntimeQueueItem<Command>[],
      promises: [] as Promise<void>[],
    },
  )

  return { items, promise: Promise.all(promises) }
}
