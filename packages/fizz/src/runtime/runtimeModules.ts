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
import { buildRuntimeDiagnosticsSnapshot } from "./runtimeDiagnosticsAggregator.js"
import type { RuntimeModuleContract } from "./runtimeModuleContract.js"
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

export type RuntimeLifecycleModule = RuntimeModuleContract<
  RuntimeDebugCommand,
  unknown
>

export type RuntimeModuleSet = {
  addModule: (module: RuntimeLifecycleModule) => () => void
  disconnect: () => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
  getDiagnostics: () => RuntimeDiagnosticsSnapshot
  prepareForGoBack: () => void
  prepareForTransition: (targetState: RuntimeState) => void
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

  const lifecycleModules: RuntimeLifecycleModule[] = [
    asyncModule,
    resourceModule,
    browserModule,
    commandModule,
    schedulingModule,
  ]

  lifecycleModules.forEach(module => {
    registerEffectHandlers(effectHandlers, module.effectHandlers)
  })

  return {
    addModule: (module: RuntimeLifecycleModule) => {
      const registeredKeys: string[] = []

      module.effectHandlers.forEach((handler, key) => {
        if (!effectHandlers.has(key)) {
          effectHandlers.set(key, handler)
          registeredKeys.push(key)
        }
      })

      lifecycleModules.push(module)

      return () => {
        const idx = lifecycleModules.indexOf(module)

        if (idx !== -1) lifecycleModules.splice(idx, 1)

        registeredKeys.forEach(key => effectHandlers.delete(key))
      }
    },
    disconnect: () => {
      lifecycleModules.forEach(module => {
        module.clear()
      })
      registryRegistration.unregister()
    },
    effectHandlers,
    getDiagnostics: () =>
      buildRuntimeDiagnosticsSnapshot({
        asyncOps: () => asyncModule.getDiagnostics(),
        channelQueues: () => commandModule.getDiagnostics(),
        resources: () => resourceModule.getDiagnostics(),
        timers: () => schedulingModule.getDiagnostics(),
      }),
    prepareForGoBack: () => {
      lifecycleModules.forEach(module => {
        module.clearForGoBack()
      })
    },
    prepareForTransition: targetState => {
      const currentState = options.currentState()

      lifecycleModules.forEach(module => {
        module.clearForTransition({
          currentState,
          targetState,
        })
      })
    },
  }
}
