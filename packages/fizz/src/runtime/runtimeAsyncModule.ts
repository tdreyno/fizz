import type { Action } from "../action.js"
import { asyncCancelled } from "../action.js"
import type { CancelAsyncEffectData, StartAsyncEffectData } from "../effect.js"
import type { RuntimeAsyncDriver } from "./asyncDriver.js"
import type { ActiveAsync } from "./asyncScheduler.js"
import {
  cancelActiveAsyncOperation,
  clearAsyncOperations,
  isAbortError,
  runAsyncOperation,
  startAsyncOperation,
} from "./asyncScheduler.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeState,
} from "./runtimeContracts.js"

export type RuntimeAsyncModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
}

export const createRuntimeAsyncModule = (options: {
  actionCommand: (command: Action<string, unknown>) => RuntimeDebugCommand
  asyncDriver: RuntimeAsyncDriver
  emitMonitor: (event: RuntimeDebugEvent) => void
  getContext: () => Parameters<typeof runAsyncOperation>[0]
  runAction: (action: Action<string, unknown>) => Promise<void>
}): RuntimeAsyncModule => {
  const asyncOperations = new Map<string, ActiveAsync>()
  let asyncCounter = 1
  let asyncIdCounter = 1

  const clearOperations = () => {
    clearAsyncOperations({
      asyncDriver: options.asyncDriver,
      asyncOperations,
    })
  }

  const emitCleanupEvents = () => {
    asyncOperations.forEach((_activeAsync, asyncId) => {
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
      },
      onResolve: (eventAsyncId: string, value: Resolved) => {
        options.emitMonitor({
          asyncId: eventAsyncId,
          type: "async-resolved",
          value,
        })
      },
      run: action => options.runAction(action),
      runAsyncOperation: (run, signal) =>
        runAsyncOperation(options.getContext(), run, signal),
    })

    return []
  }

  const handleCancelAsync = <AsyncId extends string>(
    data: CancelAsyncEffectData<AsyncId>,
  ): RuntimeDebugCommand[] => {
    const cancelled = cancelActiveAsyncOperation({
      asyncDriver: options.asyncDriver,
      asyncId: data.asyncId,
      asyncOperations,
    })

    if (cancelled) {
      options.emitMonitor({
        asyncId: data.asyncId,
        reason: "effect",
        type: "async-cancelled",
      })
    }

    return cancelled
      ? [options.actionCommand(asyncCancelled({ asyncId: data.asyncId }))]
      : []
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
        "cancelAsync",
        item => handleCancelAsync(item.data as CancelAsyncEffectData<string>),
      ],
    ]),
  }
}
