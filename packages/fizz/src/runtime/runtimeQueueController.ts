import {
  canQueueStartProcessing,
  createQueueMachine,
  markQueueEnteredInitialState,
  startQueueProcessing,
  stopQueueProcessing,
} from "./queueMachine.js"
import type { RuntimeQueueItem } from "./runtimeQueue.js"

export type RuntimeQueueController<Command> = {
  canStartProcessing: () => boolean
  disconnect: () => void
  enqueue: (item: RuntimeQueueItem<Command>) => number
  getQueue: () => RuntimeQueueItem<Command>[]
  hasEnteredInitialState: () => boolean
  markEnteredInitialState: () => void
  size: () => number
  startProcessing: () => void
  stopProcessing: () => void
}

export const createRuntimeQueueController = <
  Command,
>(): RuntimeQueueController<Command> => {
  let queueMachine = createQueueMachine()
  const queue: RuntimeQueueItem<Command>[] = []

  return {
    canStartProcessing: () => canQueueStartProcessing(queueMachine),
    disconnect: () => {
      queue.length = 0
      queueMachine = stopQueueProcessing(queueMachine)
    },
    enqueue: item => {
      queue.push(item)

      return queue.length
    },
    getQueue: () => queue,
    hasEnteredInitialState: () => queueMachine.hasEnteredInitialState,
    markEnteredInitialState: () => {
      queueMachine = markQueueEnteredInitialState(queueMachine)
    },
    size: () => queue.length,
    startProcessing: () => {
      queueMachine = startQueueProcessing(queueMachine)
    },
    stopProcessing: () => {
      queueMachine = stopQueueProcessing(queueMachine)
    },
  }
}
