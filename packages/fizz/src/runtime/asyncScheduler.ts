import type { Action } from "../action.js"
import type { Context } from "../context.js"
import type { StartAsyncEffectData } from "../effect.js"
import type { RuntimeAsyncDriver } from "./asyncDriver.js"
import {
  cancelAsyncLane,
  canHandleAsyncLaneTokenEvent,
  createAsyncParallelMachine,
  removeAsyncLane,
  startAsyncLane,
  transitionAsyncLane,
} from "./asyncMachine.js"

export type ActiveAsync = {
  controller: AbortController
  handle: unknown
  token: number
}

const asyncParallelByOperations = new WeakMap<
  Map<string, ActiveAsync>,
  ReturnType<typeof createAsyncParallelMachine>
>()

const getAsyncParallelMachine = (
  asyncOperations: Map<string, ActiveAsync>,
): ReturnType<typeof createAsyncParallelMachine> => {
  const existing = asyncParallelByOperations.get(asyncOperations)

  if (existing) {
    return existing
  }

  const created = createAsyncParallelMachine()

  asyncParallelByOperations.set(asyncOperations, created)

  return created
}

type StartAsyncOperationOptions<Resolved> = {
  asyncDriver: RuntimeAsyncDriver
  asyncId: string
  asyncOperations: Map<string, ActiveAsync>
  createController: () => AbortController
  data: StartAsyncEffectData<Resolved, string>
  isAbortError: (error: unknown, signal: AbortSignal) => boolean
  nextToken: () => number
  onReject?: (asyncId: string, error: unknown) => void
  onResolve?: (asyncId: string, value: Resolved) => void
  run: (action: Action<string, unknown>) => Promise<void>
  runAsyncOperation: (
    run: StartAsyncEffectData<Resolved, string>["run"],
    signal: AbortSignal,
  ) => Promise<Resolved>
}

type CancelAsyncOperationOptions = {
  asyncDriver: RuntimeAsyncDriver
  asyncId: string
  asyncOperations: Map<string, ActiveAsync>
}

type ClearAsyncOperationsOptions = {
  asyncDriver: RuntimeAsyncDriver
  asyncOperations: Map<string, ActiveAsync>
}

export const startAsyncOperation = <Resolved>({
  asyncDriver,
  asyncId,
  asyncOperations,
  createController,
  data,
  isAbortError,
  nextToken,
  onReject,
  onResolve,
  run,
  runAsyncOperation,
}: StartAsyncOperationOptions<Resolved>): void => {
  const parallel = getAsyncParallelMachine(asyncOperations)
  const previousAsync = asyncOperations.get(asyncId)

  if (previousAsync) {
    cancelAsyncLane(parallel, asyncId, previousAsync.token, {
      cancelHandle: () => {
        previousAsync.controller.abort()
        asyncDriver.cancel(previousAsync.handle)
      },
    })

    removeAsyncLane(parallel, asyncId)
    asyncOperations.delete(asyncId)
  }

  const controller = createController()
  const token = nextToken()

  startAsyncLane(parallel, asyncId, token)

  const handle = asyncDriver.start({
    onReject: async error => {
      const activeAsync = asyncOperations.get(asyncId)

      if (
        !activeAsync ||
        !canHandleAsyncLaneTokenEvent(parallel, asyncId, token)
      ) {
        return
      }

      transitionAsyncLane(parallel, asyncId, {
        token,
        type: "reject",
      })

      removeAsyncLane(parallel, asyncId)
      asyncOperations.delete(asyncId)

      onReject?.(asyncId, error)

      if (isAbortError(error, controller.signal)) {
        return
      }

      const action = data.handlers.reject(error)

      if (action) {
        await run(action)
      }
    },
    onResolve: async value => {
      const activeAsync = asyncOperations.get(asyncId)

      if (
        !activeAsync ||
        !canHandleAsyncLaneTokenEvent(parallel, asyncId, token)
      ) {
        return
      }

      transitionAsyncLane(parallel, asyncId, {
        token,
        type: "resolve",
      })

      removeAsyncLane(parallel, asyncId)
      asyncOperations.delete(asyncId)

      onResolve?.(asyncId, value)

      const action = data.handlers.resolve(value)

      if (action) {
        await run(action)
      }
    },
    run: () => runAsyncOperation(data.run, controller.signal),
  })

  asyncOperations.set(asyncId, {
    controller,
    handle,
    token,
  })
}

export const cancelActiveAsyncOperation = ({
  asyncDriver,
  asyncId,
  asyncOperations,
}: CancelAsyncOperationOptions): boolean => {
  const parallel = getAsyncParallelMachine(asyncOperations)
  const activeAsync = asyncOperations.get(asyncId)

  if (!activeAsync) {
    return false
  }

  const cancelled = cancelAsyncLane(parallel, asyncId, activeAsync.token, {
    cancelHandle: () => {
      activeAsync.controller.abort()
      asyncDriver.cancel(activeAsync.handle)
    },
  })

  if (!cancelled.cancelled) {
    return false
  }

  removeAsyncLane(parallel, asyncId)
  asyncOperations.delete(asyncId)

  return true
}

export const clearAsyncOperations = ({
  asyncDriver,
  asyncOperations,
}: ClearAsyncOperationsOptions): void => {
  const parallel = getAsyncParallelMachine(asyncOperations)

  asyncOperations.forEach((activeAsync, asyncId) => {
    cancelAsyncLane(parallel, asyncId, activeAsync.token, {
      cancelHandle: () => {
        activeAsync.controller.abort()
        asyncDriver.cancel(activeAsync.handle)
      },
    })

    removeAsyncLane(parallel, asyncId)
  })

  asyncOperations.clear()
}

export const isAbortError = (error: unknown, signal: AbortSignal): boolean => {
  if (signal.aborted) {
    return true
  }

  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    (error as { name?: unknown }).name === "AbortError"
  )
}

export const runAsyncOperation = async <Resolved>(
  context: Context,
  run: StartAsyncEffectData<Resolved, string>["run"],
  signal: AbortSignal,
): Promise<Resolved> => {
  try {
    return typeof run === "function" ? await run(signal, context) : await run
  } catch (error) {
    throw error instanceof Error ? error : new Error(String(error))
  }
}
