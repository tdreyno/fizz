import type { Context } from "../context.js"
import type { ResourceEffectData, SubscriptionEffectData } from "../effect.js"
import {
  disposeStateResources,
  hasStateResource,
  releaseStateResource,
  setStateResource,
  transferStateResources,
} from "../stateResources.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type {
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeState,
} from "./runtimeContracts.js"

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
}): RuntimeResourceModule => {
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

    setStateResource({
      key: data.key,
      state,
      ...(data.teardown === undefined
        ? {}
        : { teardown: data.teardown as (value: unknown) => void }),
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
