import type { RuntimeBrowserDriver } from "../browser/runtimeBrowserDriver.js"
import type { RuntimeBrowserModule } from "../browser/runtimeBrowserModule.js"
import type { RuntimeAction, RuntimeState } from "./runtimeContracts.js"
import type { RuntimeTimerDriver } from "./timerDriver.js"

type RuntimeBrowserModuleFactoryOptions = {
  browserDriver?: RuntimeBrowserDriver
  getCurrentState: () => RuntimeState | undefined
  runAction: (action: RuntimeAction) => Promise<void>
  timerDriver: RuntimeTimerDriver
}

export type RuntimeBrowserModuleFactory = (
  options: RuntimeBrowserModuleFactoryOptions,
) => RuntimeBrowserModule

let runtimeBrowserModuleFactory: RuntimeBrowserModuleFactory | undefined

export const registerRuntimeBrowserModuleFactory = (
  factory: RuntimeBrowserModuleFactory,
): void => {
  runtimeBrowserModuleFactory = factory
}

export const getRuntimeBrowserModuleFactory = ():
  | RuntimeBrowserModuleFactory
  | undefined => runtimeBrowserModuleFactory
