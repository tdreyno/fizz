export type QueueStatus = "idle" | "processing"

export type QueueMachine = {
  readonly hasEnteredInitialState: boolean
  readonly status: QueueStatus
}

export const createQueueMachine = (): QueueMachine => ({
  hasEnteredInitialState: false,
  status: "idle",
})

export const startQueueProcessing = (machine: QueueMachine): QueueMachine =>
  machine.status === "idle" ? { ...machine, status: "processing" } : machine

export const stopQueueProcessing = (machine: QueueMachine): QueueMachine =>
  machine.status === "processing" ? { ...machine, status: "idle" } : machine

export const markQueueEnteredInitialState = (
  machine: QueueMachine,
): QueueMachine =>
  machine.hasEnteredInitialState
    ? machine
    : { ...machine, hasEnteredInitialState: true }

export const canQueueStartProcessing = (machine: QueueMachine): boolean =>
  machine.status === "idle"
