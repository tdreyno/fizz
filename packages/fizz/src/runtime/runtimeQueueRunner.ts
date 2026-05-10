import type { RuntimeCommandLineage } from "./runtimeCommandLineage.js"
import type { RuntimeQueueItem } from "./runtimeQueue.js"

type RuntimeQueueProcessorOptions<Command> = {
  executeCommand: (
    item: Command,
    lineage: RuntimeCommandLineage | undefined,
  ) => Promise<Command[]>
  onCommandCompleted: (
    command: Command,
    generatedCommands: Command[],
    lineage: RuntimeCommandLineage | undefined,
  ) => void
  onCommandStarted: (
    command: Command,
    queueSize: number,
    lineage: RuntimeCommandLineage | undefined,
  ) => void
  onQueueEmpty: () => void
  onRuntimeError: (command: Command, error: unknown) => void
  processNext: () => Promise<void>
  queue: RuntimeQueueItem<Command>[]
  stopOnError: () => void
  toQueueItems: (
    commands: Command[],
    parentLineage: RuntimeCommandLineage | undefined,
  ) => {
    items: RuntimeQueueItem<Command>[]
    promise: Promise<void[]>
  }
}

export const processRuntimeQueueHead = async <Command>(
  options: RuntimeQueueProcessorOptions<Command>,
): Promise<void> => {
  while (true) {
    const head = options.queue.shift()

    if (!head) {
      options.onQueueEmpty()

      return
    }

    const { item, lineage, onComplete, onError } = head

    options.onCommandStarted(item, options.queue.length, lineage)

    try {
      const commands = await options.executeCommand(item, lineage)

      options.onCommandCompleted(item, commands, lineage)

      const { items, promise } = options.toQueueItems(commands, head.lineage)

      options.queue.unshift(...items)

      void promise.then(() => onComplete()).catch(e => onError(e))
    } catch (e) {
      options.onRuntimeError(item, e)
      onError(e)
      options.stopOnError()
      options.queue.length = 0

      return
    }
  }
}
