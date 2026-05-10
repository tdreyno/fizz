import type { RuntimeEffectHandlerRegistry } from "./effectDispatcher.js"
import type { RuntimeState } from "./runtimeContracts.js"

export type RuntimeModuleTransitionOptions = {
  currentState: RuntimeState | undefined
  targetState: RuntimeState
}

export type RuntimeModuleContract<Command, Diagnostics = never> = {
  clear: () => void
  clearForGoBack: () => void
  clearForTransition: (options: RuntimeModuleTransitionOptions) => void
  effectHandlers: RuntimeEffectHandlerRegistry<Command>
} & (Diagnostics extends never
  ? Record<string, never>
  : { getDiagnostics: () => Diagnostics })
