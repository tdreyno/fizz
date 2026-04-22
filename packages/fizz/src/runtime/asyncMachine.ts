export type AsyncStatus =
  | "idle"
  | "active"
  | "resolved"
  | "rejected"
  | "cancelled"

export type AsyncMachine = {
  asyncId: string
  status: AsyncStatus
  token: number
}

export type AsyncParallelMachine = {
  lanes: Map<string, AsyncMachine>
}

export type AsyncEvent =
  | {
      token: number
      type: "start"
    }
  | {
      token: number
      type: "resolve"
    }
  | {
      token: number
      type: "reject"
    }
  | {
      token: number
      type: "cancel"
    }

export const createAsyncMachine = (asyncId: string): AsyncMachine => ({
  asyncId,
  status: "idle",
  token: 0,
})

export const createAsyncParallelMachine = (
  lanes = new Map<string, AsyncMachine>(),
): AsyncParallelMachine => ({
  lanes,
})

export const transitionAsync = (
  machine: AsyncMachine,
  event: AsyncEvent,
): AsyncMachine => {
  if (event.type === "start") {
    return {
      ...machine,
      status: "active",
      token: event.token,
    }
  }

  if (machine.status !== "active" || machine.token !== event.token) {
    return machine
  }

  if (event.type === "resolve") {
    return {
      ...machine,
      status: "resolved",
    }
  }

  if (event.type === "reject") {
    return {
      ...machine,
      status: "rejected",
    }
  }

  return {
    ...machine,
    status: "cancelled",
  }
}

export const canHandleAsyncTokenEvent = (
  machine: AsyncMachine,
  token: number,
): boolean => machine.status === "active" && machine.token === token

export const startAsyncLane = (
  parallel: AsyncParallelMachine,
  asyncId: string,
  token: number,
): AsyncMachine => {
  const machine = transitionAsync(createAsyncMachine(asyncId), {
    token,
    type: "start",
  })

  parallel.lanes.set(asyncId, machine)

  return machine
}

export const canHandleAsyncLaneTokenEvent = (
  parallel: AsyncParallelMachine,
  asyncId: string,
  token: number,
): boolean => {
  const machine = parallel.lanes.get(asyncId)

  if (!machine) {
    return false
  }

  return canHandleAsyncTokenEvent(machine, token)
}

export const transitionAsyncLane = (
  parallel: AsyncParallelMachine,
  asyncId: string,
  event: AsyncEvent,
): AsyncMachine | undefined => {
  const machine = parallel.lanes.get(asyncId)

  if (!machine) {
    return
  }

  const nextMachine = transitionAsync(machine, event)

  parallel.lanes.set(asyncId, nextMachine)

  return nextMachine
}

export const removeAsyncLane = (
  parallel: AsyncParallelMachine,
  asyncId: string,
): void => {
  parallel.lanes.delete(asyncId)
}

export const cancelAsync = <T>(
  machine: AsyncMachine,
  token: number,
  options: {
    cancelHandle: () => void
    onCancelled?: () => T
  },
): {
  cancelled: boolean
  machine: AsyncMachine
  result?: T
} => {
  const nextMachine = transitionAsync(machine, {
    token,
    type: "cancel",
  })

  if (nextMachine.status !== "cancelled") {
    return {
      cancelled: false,
      machine,
    }
  }

  options.cancelHandle()

  return {
    cancelled: true,
    machine: nextMachine,
    ...(options.onCancelled === undefined
      ? {}
      : { result: options.onCancelled() }),
  }
}

export const cancelAsyncLane = <T>(
  parallel: AsyncParallelMachine,
  asyncId: string,
  token: number,
  options: {
    cancelHandle: () => void
    onCancelled?: () => T
  },
): {
  cancelled: boolean
  machine?: AsyncMachine
  result?: T
} => {
  const machine = parallel.lanes.get(asyncId)

  if (!machine) {
    return {
      cancelled: false,
    }
  }

  const cancelled = cancelAsync(machine, token, options)

  parallel.lanes.set(asyncId, cancelled.machine)

  return cancelled
}
