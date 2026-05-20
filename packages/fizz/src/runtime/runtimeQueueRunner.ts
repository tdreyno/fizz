import type { RuntimeQueueItem } from "./runtimeQueue.js"

type MaybePromise<T> = T | Promise<T>

type RuntimeQueueProcessorOptions<Command> = {
  executeCommand: (item: Command) => MaybePromise<Command[]>
  onCommandCompleted: (command: Command, generatedCommands: Command[]) => void
  onCommandStarted: (command: Command, queueSize: number) => void
  onQueueEmpty: () => void
  onRuntimeError: (command: Command, error: unknown) => void
  processNext: () => Promise<void>
  queue: RuntimeQueueItem<Command>[]
  stopOnError: () => void
  toQueueItems: (commands: Command[]) => {
    items: RuntimeQueueItem<Command>[]
    promise: Promise<void[]>
  }
}

const isThenable = <T>(value: MaybePromise<T>): value is Promise<T> =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as { then?: unknown }).then === "function"

export const processRuntimeQueueHead = async <Command>(
  options: RuntimeQueueProcessorOptions<Command>,
): Promise<void> => {
  while (true) {
    const head = options.queue.shift()

    if (!head) {
      options.onQueueEmpty()

      return
    }

    const { item, onComplete, onError } = head

    options.onCommandStarted(item, options.queue.length)

    try {
      const result = options.executeCommand(item)
      const commands = isThenable(result) ? await result : result

      options.onCommandCompleted(item, commands)

      const { items, promise } = options.toQueueItems(commands)

      if (items.length > 0) {
        options.queue.unshift(...items)
      }

      void promise.then(onComplete, onError)
    } catch (e) {
      options.onRuntimeError(item, e)
      onError(e)
      options.stopOnError()
      options.queue.length = 0

      return
    }
  }
}
