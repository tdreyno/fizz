import type { RuntimeQueueItem } from "./runtimeQueue.js"

type RuntimeQueueProcessorOptions<Command> = {
  executeCommand: (item: Command) => Promise<Command[]>
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

export const processRuntimeQueueHead = async <Command>(
  options: RuntimeQueueProcessorOptions<Command>,
): Promise<void> => {
  const head = options.queue.shift()

  if (!head) {
    options.onQueueEmpty()

    return
  }

  const { item, onComplete, onError } = head

  options.onCommandStarted(item, options.queue.length)

  try {
    const commands = await options.executeCommand(item)

    options.onCommandCompleted(item, commands)

    const { items, promise } = options.toQueueItems(commands)

    options.queue.unshift(...items)

    void promise.then(() => onComplete()).catch(e => onError(e))

    setTimeout(() => {
      void options.processNext()
    }, 0)
  } catch (e) {
    options.onRuntimeError(item, e)
    onError(e)
    options.stopOnError()
    options.queue.length = 0
  }
}
