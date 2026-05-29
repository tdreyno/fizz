import type { Action } from "../action.js"
import { asyncCancelled } from "../action.js"
import type {
  CancelAsyncEffectData,
  DebounceAsyncEffectData,
  StartAsyncEffectData,
} from "../effect.js"
import type { RuntimeAsyncDriver } from "./asyncDriver.js"
import {
  cancelActiveAsyncOperation,
  clearAsyncOperations,
  createAsyncState,
  isAbortError,
  runAsyncOperation,
  startAsyncOperation,
} from "./asyncScheduler.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  FlushAsyncOptions,
  FlushAsyncOutcome,
  PendingAsyncSnapshot,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeState,
} from "./runtimeContracts.js"
import type { RuntimeTimerDriver } from "./timerDriver.js"
import type { ActiveTimer } from "./timerScheduler.js"
import {
  cancelActiveTimerOperation,
  canHandleTimerElapsed,
  startTimerOperation,
} from "./timerScheduler.js"

export type RuntimeAsyncModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
  getDiagnostics: () => Array<{ id: string; status: string }>
  flushAsync: (
    asyncId: string,
    options?: FlushAsyncOptions,
  ) => Promise<FlushAsyncOutcome>
  getPendingAsync: (asyncId: string) => PendingAsyncSnapshot | undefined
  getPendingAsyncCount: () => number
  hasPendingAsync: (asyncId: string) => boolean
}

export const createRuntimeAsyncModule = (options: {
  actionCommand: (command: Action<string, unknown>) => RuntimeDebugCommand
  asyncDriver: RuntimeAsyncDriver
  emitMonitor: (event: RuntimeDebugEvent) => void
  getContext: () => Parameters<typeof runAsyncOperation>[0]
  runAction: (action: Action<string, unknown>) => Promise<void>
  timerDriver: RuntimeTimerDriver
}): RuntimeAsyncModule => {
  const { asyncOperations, parallel } = createAsyncState()
  let asyncCounter = 1
  let asyncIdCounter = 1
  let debounceTimerCounter = 1
  const debounceTimers = new Map<string, ActiveTimer>()
  const debouncedData = new Map<
    string,
    DebounceAsyncEffectData<
      unknown,
      string,
      Action<string, unknown> | void,
      Action<string, unknown> | void
    >
  >()

  const flushWaiters = new Map<
    string,
    Array<(outcome: FlushAsyncOutcome) => void>
  >()

  const notifyFlushWaiters = (asyncId: string, outcome: FlushAsyncOutcome) => {
    const waiters = flushWaiters.get(asyncId)
    if (waiters) {
      flushWaiters.delete(asyncId)
      waiters.forEach(notify => notify(outcome))
    }
  }

  const clearFlushWaiters = (outcome: FlushAsyncOutcome) => {
    flushWaiters.forEach(waiters => {
      waiters.forEach(notify => notify(outcome))
    })
    flushWaiters.clear()
  }

  const ignoreAsyncResult = () => undefined

  const clearDebouncedMetadataIfIdle = (asyncId: string) => {
    if (!asyncOperations.has(asyncId) && !debounceTimers.has(asyncId)) {
      debouncedData.delete(asyncId)
    }
  }

  const cancelPendingDebounce = (asyncId: string) =>
    cancelActiveTimerOperation({
      timeoutId: asyncId,
      timerDriver: options.timerDriver,
      timers: debounceTimers,
    })

  const clearOperations = () => {
    clearFlushWaiters({ type: "aborted" })

    clearAsyncOperations({
      asyncDriver: options.asyncDriver,
      asyncOperations,
      parallel,
    })

    debounceTimers.forEach(activeTimer => {
      options.timerDriver.cancel(activeTimer.handle)
    })
    debounceTimers.clear()
    debouncedData.clear()
  }

  const emitCleanupEvents = () => {
    const seenAsyncIds = new Set<string>()

    asyncOperations.forEach((_activeAsync, asyncId) => {
      seenAsyncIds.add(asyncId)

      options.emitMonitor({
        asyncId,
        reason: "cleanup",
        type: "async-cancelled",
      })
    })

    debounceTimers.forEach((_activeTimer, asyncId) => {
      if (seenAsyncIds.has(asyncId)) {
        return
      }

      options.emitMonitor({
        asyncId,
        reason: "cleanup",
        type: "async-cancelled",
      })
    })
  }

  const handleStartAsync = <Resolved>(
    data: StartAsyncEffectData<Resolved, string>,
  ): RuntimeDebugCommand[] => {
    const asyncId = data.asyncId ?? `__fizz_async__${asyncIdCounter++}`

    // Enforce asyncId exclusivity: cancel any pending debounce for the same id
    if (data.asyncId !== undefined) {
      const cancelledDebounce = cancelPendingDebounce(data.asyncId)
      if (cancelledDebounce) {
        options.emitMonitor({
          asyncId: data.asyncId,
          reason: "restart",
          type: "async-cancelled",
        })
        clearDebouncedMetadataIfIdle(data.asyncId)
      }
    }

    if (asyncOperations.has(asyncId)) {
      options.emitMonitor({
        asyncId,
        reason: "restart",
        type: "async-cancelled",
      })
    }

    options.emitMonitor({
      asyncId,
      type: "async-started",
    })

    startAsyncOperation({
      asyncDriver: options.asyncDriver,
      asyncId,
      asyncOperations,
      createController: () => new AbortController(),
      data,
      isAbortError,
      nextToken: () => asyncCounter++,
      onReject: (eventAsyncId: string, error: unknown) => {
        options.emitMonitor({
          asyncId: eventAsyncId,
          error,
          type: "async-rejected",
        })
        notifyFlushWaiters(eventAsyncId, { type: "failed", error })
      },
      onResolve: (eventAsyncId: string, value: Resolved) => {
        options.emitMonitor({
          asyncId: eventAsyncId,
          type: "async-resolved",
          value,
        })
        notifyFlushWaiters(eventAsyncId, { type: "succeeded", value })
      },
      parallel,
      run: action => options.runAction(action),
      runAsyncOperation: (run, signal) =>
        runAsyncOperation(options.getContext(), run, signal),
    })

    return []
  }

  const handleDebounceAsync = <Resolved>(
    data: DebounceAsyncEffectData<Resolved, string>,
  ): RuntimeDebugCommand[] => {
    const previousData = debouncedData.get(data.asyncId)

    debouncedData.set(
      data.asyncId,
      data as DebounceAsyncEffectData<
        unknown,
        string,
        Action<string, unknown> | void,
        Action<string, unknown> | void
      >,
    )

    cancelPendingDebounce(data.asyncId)

    const cancelled = cancelActiveAsyncOperation({
      asyncDriver: options.asyncDriver,
      asyncId: data.asyncId,
      asyncOperations,
      parallel,
    })

    if (cancelled.cancelled) {
      options.emitMonitor({
        asyncId: data.asyncId,
        reason: "restart",
        type: "async-cancelled",
      })
    }

    startTimerOperation({
      delay: data.delayMs,
      nextToken: () => debounceTimerCounter++,
      onElapsed: async token => {
        const activeTimer = debounceTimers.get(data.asyncId)

        if (!activeTimer || !canHandleTimerElapsed(activeTimer, token)) {
          return
        }

        debounceTimers.delete(data.asyncId)

        const latestData = debouncedData.get(data.asyncId)

        if (!latestData) {
          return
        }

        options.emitMonitor({
          asyncId: latestData.asyncId,
          type: "async-started",
        })

        const startData: StartAsyncEffectData<
          unknown,
          string,
          Action<string, unknown> | void,
          Action<string, unknown> | void
        > = {
          asyncId: latestData.asyncId,
          handlers: {
            reject: latestData.handlers.reject ?? ignoreAsyncResult,
            resolve: latestData.handlers.resolve,
          },
          run: latestData.run,
        }

        startAsyncOperation({
          asyncDriver: options.asyncDriver,
          asyncId: latestData.asyncId,
          asyncOperations,
          createController: () => new AbortController(),
          data: startData,
          isAbortError: (error, signal) =>
            latestData.classifyAbort?.(error, signal) ??
            isAbortError(error, signal),
          nextToken: () => asyncCounter++,
          onReject: (eventAsyncId: string, error: unknown) => {
            options.emitMonitor({
              asyncId: eventAsyncId,
              error,
              type: "async-rejected",
            })
            clearDebouncedMetadataIfIdle(eventAsyncId)
            notifyFlushWaiters(eventAsyncId, { type: "failed", error })
          },
          onResolve: (eventAsyncId: string, value: unknown) => {
            options.emitMonitor({
              asyncId: eventAsyncId,
              type: "async-resolved",
              value,
            })
            clearDebouncedMetadataIfIdle(eventAsyncId)
            notifyFlushWaiters(eventAsyncId, { type: "succeeded", value })
          },
          parallel,
          run: action => options.runAction(action),
          runAsyncOperation: (run, signal) =>
            runAsyncOperation(options.getContext(), run, signal),
        })
      },
      timeoutId: data.asyncId,
      timerDriver: options.timerDriver,
      timers: debounceTimers,
    })

    const commands: RuntimeDebugCommand[] = []

    if (cancelled.cancelledAction !== undefined) {
      commands.push(options.actionCommand(cancelled.cancelledAction))
    }

    if (cancelled.cancelled && previousData?.emitCancelled) {
      commands.push(
        options.actionCommand(asyncCancelled({ asyncId: data.asyncId })),
      )
    }

    return commands
  }

  const handleCancelAsync = <AsyncId extends string>(
    data: CancelAsyncEffectData<AsyncId>,
  ): RuntimeDebugCommand[] => {
    const cancelledDebounce = cancelPendingDebounce(data.asyncId)
    const cancelled = cancelActiveAsyncOperation({
      asyncDriver: options.asyncDriver,
      asyncId: data.asyncId,
      asyncOperations,
      parallel,
    })

    clearDebouncedMetadataIfIdle(data.asyncId)

    if (cancelled.cancelled || cancelledDebounce) {
      notifyFlushWaiters(data.asyncId, { type: "aborted" })
      options.emitMonitor({
        asyncId: data.asyncId,
        reason: "effect",
        type: "async-cancelled",
      })
    }

    const commands: RuntimeDebugCommand[] = []

    if (cancelled.cancelledAction !== undefined) {
      commands.push(options.actionCommand(cancelled.cancelledAction))
    }

    if (cancelled.cancelled || cancelledDebounce) {
      commands.push(
        options.actionCommand(asyncCancelled({ asyncId: data.asyncId })),
      )
    }

    return commands
  }

  return {
    clear: () => {
      emitCleanupEvents()
      clearOperations()
    },
    clearForGoBack: () => {
      emitCleanupEvents()
      clearOperations()
    },
    clearForTransition: ({ currentState, targetState }) => {
      if (!currentState) {
        return
      }

      if (currentState.name === targetState.name) {
        return
      }

      emitCleanupEvents()
      clearOperations()
    },
    effectHandlers: new Map([
      [
        "startAsync",
        item =>
          handleStartAsync(item.data as StartAsyncEffectData<unknown, string>),
      ],
      [
        "debounceAsync",
        item =>
          handleDebounceAsync(
            item.data as DebounceAsyncEffectData<unknown, string>,
          ),
      ],
      [
        "cancelAsync",
        item => handleCancelAsync(item.data as CancelAsyncEffectData<string>),
      ],
    ]),
    getDiagnostics: () => {
      const operations = [...asyncOperations.keys()].map(id => ({
        id,
        status: "running",
      }))
      const debounced = [...debounceTimers.keys()].map(id => ({
        id,
        status: "debouncing",
      }))

      return [...operations, ...debounced]
    },
    flushAsync: (asyncId, flushOptions) => {
      if (!debounceTimers.has(asyncId) && !asyncOperations.has(asyncId)) {
        return Promise.resolve({ type: "nothing" } as const)
      }

      return new Promise<FlushAsyncOutcome>(resolve => {
        let settled = false
        let timeoutHandle: ReturnType<typeof setTimeout> | undefined

        const settle = (outcome: FlushAsyncOutcome) => {
          if (settled) {
            return
          }
          settled = true
          if (timeoutHandle !== undefined) {
            clearTimeout(timeoutHandle)
          }
          resolve(outcome)
        }

        if (flushOptions?.timeoutMs !== undefined) {
          timeoutHandle = setTimeout(() => {
            cancelPendingDebounce(asyncId)
            cancelActiveAsyncOperation({
              asyncDriver: options.asyncDriver,
              asyncId,
              asyncOperations,
              parallel,
            })
            clearDebouncedMetadataIfIdle(asyncId)
            options.emitMonitor({
              asyncId,
              reason: "effect",
              type: "async-cancelled",
            })
            notifyFlushWaiters(asyncId, { type: "aborted" })
          }, flushOptions.timeoutMs)
        }

        const existing = flushWaiters.get(asyncId) ?? []
        existing.push(settle)
        flushWaiters.set(asyncId, existing)

        if (debounceTimers.has(asyncId)) {
          const activeTimer = debounceTimers.get(asyncId)

          if (activeTimer) {
            options.timerDriver.cancel(activeTimer.handle)
            debounceTimers.delete(asyncId)

            const latestData = debouncedData.get(asyncId)

            if (latestData) {
              options.emitMonitor({
                asyncId: latestData.asyncId,
                type: "async-started",
              })

              const startData: StartAsyncEffectData<
                unknown,
                string,
                Action<string, unknown> | void,
                Action<string, unknown> | void
              > = {
                asyncId: latestData.asyncId,
                handlers: {
                  reject: latestData.handlers.reject ?? ignoreAsyncResult,
                  resolve: latestData.handlers.resolve,
                },
                run: latestData.run,
              }

              startAsyncOperation({
                asyncDriver: options.asyncDriver,
                asyncId: latestData.asyncId,
                asyncOperations,
                createController: () => new AbortController(),
                data: startData,
                isAbortError: (error, signal) =>
                  latestData.classifyAbort?.(error, signal) ??
                  isAbortError(error, signal),
                nextToken: () => asyncCounter++,
                onReject: (eventAsyncId, error) => {
                  options.emitMonitor({
                    asyncId: eventAsyncId,
                    error,
                    type: "async-rejected",
                  })
                  clearDebouncedMetadataIfIdle(eventAsyncId)
                  notifyFlushWaiters(eventAsyncId, { type: "failed", error })
                },
                onResolve: (eventAsyncId, value) => {
                  options.emitMonitor({
                    asyncId: eventAsyncId,
                    type: "async-resolved",
                    value,
                  })
                  clearDebouncedMetadataIfIdle(eventAsyncId)
                  notifyFlushWaiters(eventAsyncId, {
                    type: "succeeded",
                    value,
                  })
                },
                parallel,
                run: action => options.runAction(action),
                runAsyncOperation: (run, signal) =>
                  runAsyncOperation(options.getContext(), run, signal),
              })
            } else {
              notifyFlushWaiters(asyncId, { type: "nothing" })
            }
          }
        }
      })
    },
    getPendingAsync: asyncId => {
      if (debounceTimers.has(asyncId)) {
        return { asyncId, phase: "debouncing" }
      }
      if (asyncOperations.has(asyncId)) {
        return { asyncId, phase: "in-flight" }
      }
      return undefined
    },
    getPendingAsyncCount: () => asyncOperations.size + debounceTimers.size,
    hasPendingAsync: asyncId =>
      debounceTimers.has(asyncId) || asyncOperations.has(asyncId),
  }
}
