import type { RuntimeBrowserDriver } from "../browser/runtimeBrowserDriver.js"
import type { Context } from "../context.js"
import type { Runtime } from "../runtime.js"
import type { RuntimeAsyncDriver } from "./asyncDriver.js"
import { registerRuntimeInChromeDebuggerRegistry } from "./debugHook.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import {
  createEffectHandlerRegistry,
  registerEffectHandlers,
} from "./effectDispatcher.js"
import { createRuntimeAsyncModule } from "./runtimeAsyncModule.js"
import { createRuntimeBrowserGuardModule } from "./runtimeBrowserGuardModule.js"
import { getRuntimeBrowserModuleFactory } from "./runtimeBrowserModuleRegistry.js"
import type { RuntimeCommandHandlers } from "./runtimeCommandModule.js"
import { createRuntimeCommandModule } from "./runtimeCommandModule.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeDiagnosticsSnapshot,
  RuntimeMissingCommandHandlerPolicy,
  RuntimeState,
} from "./runtimeContracts.js"
import { createRuntimeResourceModule } from "./runtimeResourceModule.js"
import { createRuntimeSchedulingModule } from "./runtimeSchedulingModule.js"
import type { RuntimeTimerDriver } from "./timerDriver.js"

type RuntimeModulesOptions<OutputAction> = {
  actionCommand: (action: RuntimeAction) => RuntimeDebugCommand
  asyncDriver: RuntimeAsyncDriver
  browserDriver?: RuntimeBrowserDriver
  currentState: () => RuntimeState | undefined
  debugLabel?: string
  commandHandlers: RuntimeCommandHandlers
  emitMonitor: (event: RuntimeDebugEvent) => void
  emitOutput: (output: OutputAction) => void
  getContext: () => Context
  handleGoBack: () => RuntimeDebugCommand[]
  missingCommandHandlerPolicy: RuntimeMissingCommandHandlerPolicy
  runAction: (action: RuntimeAction) => Promise<void>
  runtime: Runtime<any, any>
  timerDriver: RuntimeTimerDriver
}

export type RuntimeModuleSet = {
  disconnect: () => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
  getDiagnostics: () => RuntimeDiagnosticsSnapshot
  prepareForGoBack: () => void
  prepareForTransition: (targetState: RuntimeState) => void
}

type RuntimeResourceDiagnosticsEntry = {
  key: string
  stateName: string
}

type RuntimeListenerDiagnosticsEntry = {
  count: number
  target: string
  type: string
}

const startsWithListenerPrefix = (key: string): boolean =>
  key.startsWith("dom:listen:")

const parseListenerResource = (
  resourceKey: string,
): { target: string; type: string } | undefined => {
  if (!startsWithListenerPrefix(resourceKey)) {
    return undefined
  }

  const segments = resourceKey.split(":")

  if (segments.length < 5) {
    return {
      target: "unknown",
      type: "unknown",
    }
  }

  if (segments[2] === "group") {
    return {
      target: "group",
      type: segments[3] ?? "unknown",
    }
  }

  const type = segments.at(-2) ?? "unknown"
  const target = segments.slice(2, -2).join(":") || "unknown"

  return {
    target,
    type,
  }
}

const toListenerDiagnostics = (
  resources: RuntimeResourceDiagnosticsEntry[],
): RuntimeListenerDiagnosticsEntry[] => {
  const counts = new Map<string, number>()

  resources.forEach(resource => {
    const parsed = parseListenerResource(resource.key)

    if (!parsed) {
      return
    }

    const key = `${parsed.target}:${parsed.type}`

    counts.set(key, (counts.get(key) ?? 0) + 1)
  })

  return [...counts.entries()]
    .map(([key, count]) => {
      const separator = key.lastIndexOf(":")

      if (separator < 0) {
        return {
          count,
          target: key,
          type: "unknown",
        }
      }

      return {
        count,
        target: key.slice(0, separator),
        type: key.slice(separator + 1),
      }
    })
    .sort((a, b) => {
      if (a.target === b.target) {
        return a.type.localeCompare(b.type)
      }

      return a.target.localeCompare(b.target)
    })
}

export const createRuntimeModules = <OutputAction>(
  options: RuntimeModulesOptions<OutputAction>,
): RuntimeModuleSet => {
  const asyncModule = createRuntimeAsyncModule({
    actionCommand: options.actionCommand,
    asyncDriver: options.asyncDriver,
    emitMonitor: options.emitMonitor,
    getContext: options.getContext,
    runAction: options.runAction,
    timerDriver: options.timerDriver,
  })
  const schedulingModule = createRuntimeSchedulingModule({
    actionCommand: options.actionCommand,
    emitMonitor: options.emitMonitor,
    runAction: options.runAction,
    timerDriver: options.timerDriver,
  })
  const resourceModule = createRuntimeResourceModule({
    emitMonitor: options.emitMonitor,
    getContext: options.getContext,
    runAction: options.runAction,
    timerDriver: options.timerDriver,
  })
  const browserModuleFactory = getRuntimeBrowserModuleFactory()
  const browserModule =
    browserModuleFactory === undefined
      ? createRuntimeBrowserGuardModule()
      : browserModuleFactory({
          ...(options.browserDriver === undefined
            ? {}
            : { browserDriver: options.browserDriver }),
          getCurrentState: options.currentState,
          runAction: options.runAction,
          timerDriver: options.timerDriver,
        })
  const commandModule = createRuntimeCommandModule({
    actionCommand: options.actionCommand,
    commandHandlers: options.commandHandlers,
    emitOutput: output => {
      options.emitOutput(output as OutputAction)
    },
    emitMonitor: options.emitMonitor,
    missingHandlerPolicy: options.missingCommandHandlerPolicy,
    runAction: options.runAction,
  })
  const effectHandlers = createEffectHandlerRegistry<
    RuntimeDebugCommand,
    OutputAction
  >({
    emitOutput: output => {
      options.emitOutput(output)
    },
    handleGoBack: () => options.handleGoBack(),
  })
  const registryRegistration = registerRuntimeInChromeDebuggerRegistry(
    options.debugLabel === undefined
      ? {
          runtime: options.runtime,
        }
      : {
          label: options.debugLabel,
          runtime: options.runtime,
        },
  )

  registerEffectHandlers(effectHandlers, asyncModule.effectHandlers)
  registerEffectHandlers(effectHandlers, resourceModule.effectHandlers)
  registerEffectHandlers(effectHandlers, browserModule.effectHandlers)
  registerEffectHandlers(effectHandlers, commandModule.effectHandlers)
  registerEffectHandlers(effectHandlers, schedulingModule.effectHandlers)

  return {
    disconnect: () => {
      asyncModule.clear()
      resourceModule.clear()
      browserModule.clear()
      commandModule.clear()
      schedulingModule.clear()
      registryRegistration.unregister()
    },
    effectHandlers,
    getDiagnostics: () => {
      const resources = resourceModule.getDiagnostics()

      return {
        asyncOps: asyncModule.getDiagnostics(),
        channelQueues: commandModule.getDiagnostics(),
        listeners: toListenerDiagnostics(resources),
        resources,
        timers: schedulingModule.getDiagnostics(),
      }
    },
    prepareForGoBack: () => {
      asyncModule.clearForGoBack()
      resourceModule.clearForGoBack()
      browserModule.clearForGoBack()
      commandModule.clearForGoBack()
      schedulingModule.clearForGoBack()
    },
    prepareForTransition: targetState => {
      const currentState = options.currentState()

      asyncModule.clearForTransition({
        currentState,
        targetState,
      })
      resourceModule.clearForTransition({
        currentState,
        targetState,
      })
      browserModule.clearForTransition({
        currentState,
        targetState,
      })
      commandModule.clearForTransition({
        currentState,
        targetState,
      })
      schedulingModule.clearForTransition({
        currentState,
        targetState,
      })
    },
  }
}
