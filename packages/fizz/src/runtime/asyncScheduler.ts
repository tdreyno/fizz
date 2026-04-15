import type { Action } from "../action.js"
import type { Context } from "../context.js"
import type { StartAsyncEffectData } from "../effect.js"
import type { RuntimeAsyncDriver } from "./asyncDriver.js"

export type ActiveAsync = {
  controller: AbortController
  handle: unknown
  token: number
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
  cancelActiveAsyncOperation({
    asyncDriver,
    asyncId,
    asyncOperations,
  })

  const controller = createController()
  const token = nextToken()
  const handle = asyncDriver.start({
    onReject: async error => {
      const activeAsync = asyncOperations.get(asyncId)

      if (activeAsync?.token !== token) {
        return
      }

      asyncOperations.delete(asyncId)

      onReject?.(asyncId, error)

      if (isAbortError(error, controller.signal)) {
        return
      }

      const action = data.handlers.reject?.(error)

      if (action) {
        await run(action)
      }
    },
    onResolve: async value => {
      const activeAsync = asyncOperations.get(asyncId)

      if (activeAsync?.token !== token) {
        return
      }

      asyncOperations.delete(asyncId)

      onResolve?.(asyncId, value)

      const action = data.handlers.resolve?.(value)

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
  const activeAsync = asyncOperations.get(asyncId)

  if (!activeAsync) {
    return false
  }

  activeAsync.controller.abort()
  asyncDriver.cancel(activeAsync.handle)
  asyncOperations.delete(asyncId)

  return true
}

export const clearAsyncOperations = ({
  asyncDriver,
  asyncOperations,
}: ClearAsyncOperationsOptions): void => {
  asyncOperations.forEach(activeAsync => {
    activeAsync.controller.abort()
    asyncDriver.cancel(activeAsync.handle)
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
