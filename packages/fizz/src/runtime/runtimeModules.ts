import type { Context } from "../context.js"
import type { Runtime } from "../runtime.js"
import type { RuntimeAsyncDriver } from "./asyncDriver.js"
import type { RuntimeBrowserDriver } from "./browserDriver.js"
import { registerRuntimeInChromeDebuggerRegistry } from "./debugHook.js"
import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import {
  createEffectHandlerRegistry,
  registerEffectHandlers,
} from "./effectDispatcher.js"
import { createRuntimeAsyncModule } from "./runtimeAsyncModule.js"
import { createRuntimeBrowserModule } from "./runtimeBrowserModule.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeDebugEvent,
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
  emitMonitor: (event: RuntimeDebugEvent) => void
  emitOutput: (output: OutputAction) => void
  getContext: () => Context
  handleGoBack: () => RuntimeDebugCommand[]
  runAction: (action: RuntimeAction) => Promise<void>
  runtime: Runtime<any, any>
  timerDriver: RuntimeTimerDriver
}

export type RuntimeModuleSet = {
  disconnect: () => void
  effectHandlers: RuntimeEffectHandlerRegistry<RuntimeDebugCommand>
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
  })
  const browserModule = createRuntimeBrowserModule({
    browserDriver: options.browserDriver,
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
  registerEffectHandlers(effectHandlers, schedulingModule.effectHandlers)

  return {
    disconnect: () => {
      asyncModule.clear()
      resourceModule.clear()
      browserModule.clear()
      schedulingModule.clear()
      registryRegistration.unregister()
    },
    effectHandlers,
    prepareForGoBack: () => {
      asyncModule.clearForGoBack()
      resourceModule.clearForGoBack()
      browserModule.clearForGoBack()
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
      schedulingModule.clearForTransition({
        currentState,
        targetState,
      })
    },
  }
}
