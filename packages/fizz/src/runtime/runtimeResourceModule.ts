import type { Context } from "../context.js"
import type {
  ResourceBridgeData,
  ResourceEffectData,
  SubscriptionEffectData,
} from "../effect.js"
import {
  disposeStateResources,
  hasStateResource,
  releaseStateResource,
  setStateResource,
  transferStateResources,
} from "../stateResources.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeState,
} from "./runtimeContracts.js"
import type { RuntimeTimerDriver } from "./timerDriver.js"

export type RuntimeResourceModule = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: {
    currentState: RuntimeState | undefined
    targetState: RuntimeState
  }) => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
}

export const createRuntimeResourceModule = (options: {
  emitMonitor: (event: RuntimeDebugEvent) => void
  getContext: () => Context
  runAction: (action: RuntimeAction) => Promise<void>
  timerDriver: RuntimeTimerDriver
}): RuntimeResourceModule => {
  const runMappedAction = async (action: RuntimeAction | void) => {
    if (action === undefined) {
      return
    }

    await options.runAction(action)
  }

  const toSubscribedResource = <Event>(value: unknown) => {
    if (typeof value !== "object" || value === null) {
      return undefined
    }

    const withSubscribe = value as {
      subscribe?: (onEvent: (event: Event) => void) => () => void
    }

    if (typeof withSubscribe.subscribe === "function") {
      return withSubscribe.subscribe.bind(value)
    }

    const withOnDidChange = value as {
      onDidChange?: (onEvent: (event: Event) => void) => () => void
    }

    if (typeof withOnDidChange.onDidChange === "function") {
      return withOnDidChange.onDidChange.bind(value)
    }

    return undefined
  }

  const createBridgeTeardown = <Event>(optionsWithBridge: {
    bridge: ResourceBridgeData<unknown, Event>
    value: unknown
  }): (() => void) | undefined => {
    const subscribe =
      optionsWithBridge.bridge.subscribe === undefined
        ? toSubscribedResource<Event>(optionsWithBridge.value)
        : (onEvent: (event: Event) => void) =>
            optionsWithBridge.bridge.subscribe!(
              optionsWithBridge.value,
              onEvent,
            )

    if (!subscribe || !optionsWithBridge.bridge.handlers) {
      return undefined
    }

    let active = true
    let debounceHandle: unknown = undefined
    let hasDebounceHandle = false
    let latestHandle: unknown = undefined
    let hasLatestHandle = false
    let latestEvent: Event | undefined

    const dispatchValue = async (event: Event) => {
      if (!active) {
        return
      }

      try {
        if (optionsWithBridge.bridge.filter?.(event) === false) {
          return
        }

        await runMappedAction(optionsWithBridge.bridge.handlers?.resolve(event))
      } catch (error) {
        await runMappedAction(
          optionsWithBridge.bridge.handlers?.reject?.(error),
        )
      }
    }

    const queueLatest = () => {
      if (hasLatestHandle) {
        return
      }

      latestHandle = options.timerDriver.start(0, () => {
        hasLatestHandle = false

        if (!active || latestEvent === undefined) {
          return
        }

        const event = latestEvent

        latestEvent = undefined
        return dispatchValue(event)
      })
      hasLatestHandle = true
    }

    const onEvent = (event: Event) => {
      if (!active) {
        return
      }

      const pace = optionsWithBridge.bridge.pace

      if (!pace) {
        void dispatchValue(event)
        return
      }

      if (pace === "latest") {
        latestEvent = event
        queueLatest()
        return
      }

      latestEvent = event

      if (hasDebounceHandle) {
        options.timerDriver.cancel(debounceHandle)
      }

      debounceHandle = options.timerDriver.start(pace.debounceMs, () => {
        if (!active || latestEvent === undefined) {
          return
        }

        const pending = latestEvent

        latestEvent = undefined
        return dispatchValue(pending)
      })
      hasDebounceHandle = true
    }

    let teardown: (() => void) | undefined

    try {
      teardown = subscribe(onEvent)
    } catch (error) {
      void runMappedAction(optionsWithBridge.bridge.handlers.reject?.(error))
    }

    return () => {
      active = false

      if (hasDebounceHandle) {
        options.timerDriver.cancel(debounceHandle)
        hasDebounceHandle = false
      }

      if (hasLatestHandle) {
        options.timerDriver.cancel(latestHandle)
        hasLatestHandle = false
      }

      teardown?.()
    }
  }

  const emitRelease = (result: {
    error?: unknown
    key: string
    reason: "cleanup" | "effect"
    released: boolean
  }) => {
    if (!result.released) {
      return
    }

    const stateName = options.getContext().currentState?.name

    if (!stateName) {
      return
    }

    options.emitMonitor({
      reason: result.reason,
      resourceKey: result.key,
      stateName,
      type: "resource-released",
    })

    if (result.error !== undefined) {
      options.emitMonitor({
        error: result.error,
        reason: result.reason,
        resourceKey: result.key,
        stateName,
        type: "resource-release-failed",
      })
    }
  }

  const clearForState = (state: RuntimeState | undefined) => {
    if (!state) {
      return
    }

    disposeStateResources(state).forEach(result => {
      options.emitMonitor({
        reason: result.reason,
        resourceKey: result.key,
        stateName: state.name,
        type: "resource-released",
      })

      if (result.error !== undefined) {
        options.emitMonitor({
          error: result.error,
          reason: result.reason,
          resourceKey: result.key,
          stateName: state.name,
          type: "resource-release-failed",
        })
      }
    })
  }

  const handleResource = (
    data: ResourceEffectData<string, unknown>,
  ): RuntimeDebugCommand[] => {
    const state = options.getContext().currentState as RuntimeState | undefined

    if (!state) {
      return []
    }

    if (hasStateResource(state, data.key)) {
      emitRelease(
        releaseStateResource({
          key: data.key,
          reason: "effect",
          state,
        }),
      )
    }

    const bridgeTeardown =
      data.bridge === undefined
        ? undefined
        : createBridgeTeardown({
            bridge: data.bridge,
            value: data.value,
          })

    const combinedTeardown =
      data.teardown === undefined && bridgeTeardown === undefined
        ? undefined
        : (value: unknown) => {
            bridgeTeardown?.()

            if (data.teardown !== undefined) {
              data.teardown(value)
            }
          }

    setStateResource({
      key: data.key,
      state,
      ...(combinedTeardown === undefined ? {} : { teardown: combinedTeardown }),
      value: data.value,
    })

    options.emitMonitor({
      resourceKey: data.key,
      stateName: state.name,
      type: "resource-registered",
    })

    return []
  }

  const handleSubscription = (
    data: SubscriptionEffectData<string>,
  ): RuntimeDebugCommand[] => {
    const teardown = data.subscribe()

    return handleResource({
      key: data.key,
      teardown,
      value: teardown,
    })
  }

  return {
    clear: () => {
      clearForState(
        options.getContext().currentState as RuntimeState | undefined,
      )
    },
    clearForGoBack: () => {
      clearForState(
        options.getContext().currentState as RuntimeState | undefined,
      )
    },
    clearForTransition: ({ currentState, targetState }) => {
      if (!currentState) {
        return
      }

      if (
        currentState.name === targetState.name &&
        targetState.mode === "update"
      ) {
        transferStateResources({ from: currentState, to: targetState })

        return
      }

      clearForState(currentState)
    },
    effectHandlers: new Map([
      [
        "resource",
        item =>
          handleResource(item.data as ResourceEffectData<string, unknown>),
      ],
      [
        "subscription",
        item => handleSubscription(item.data as SubscriptionEffectData<string>),
      ],
    ]),
  }
}
