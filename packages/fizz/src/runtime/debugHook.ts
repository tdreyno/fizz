import type { Runtime } from "../runtime.js"

export const FIZZ_CHROME_DEBUGGER_REGISTRY_KEY =
  "__FIZZ_CHROME_DEBUGGER_REGISTRY__" as const

export type RuntimeChromeDebuggerRegistryEntry = {
  connectedAt: number
  label?: string
  runtime: Runtime<any, any>
  runtimeId: string
}

export type RuntimeChromeDebuggerRegistry = {
  nextRuntimeId: (label?: string) => string
  runtimes: Map<string, RuntimeChromeDebuggerRegistryEntry>
}

type RuntimeChromeDebuggerTarget = typeof globalThis & {
  [FIZZ_CHROME_DEBUGGER_REGISTRY_KEY]?: RuntimeChromeDebuggerRegistry
}

const normalizeRuntimeLabel = (label?: string): string =>
  label
    ?.trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "") ?? ""

export const getRuntimeChromeDebuggerRegistry = (
  target: typeof globalThis = globalThis,
): RuntimeChromeDebuggerRegistry | undefined => {
  const hookTarget = target as RuntimeChromeDebuggerTarget

  return hookTarget[FIZZ_CHROME_DEBUGGER_REGISTRY_KEY]
}

export const getOrCreateRuntimeChromeDebuggerRegistry = (
  target: typeof globalThis = globalThis,
): RuntimeChromeDebuggerRegistry => {
  const hookTarget = target as RuntimeChromeDebuggerTarget
  const existingRegistry = getRuntimeChromeDebuggerRegistry(target)

  if (existingRegistry) {
    return existingRegistry
  }

  let runtimeCounter = 1

  const registry: RuntimeChromeDebuggerRegistry = {
    nextRuntimeId: (label?: string) => {
      const normalizedLabel = normalizeRuntimeLabel(label)

      return `${normalizedLabel || "runtime"}-${runtimeCounter++}`
    },
    runtimes: new Map<string, RuntimeChromeDebuggerRegistryEntry>(),
  }

  hookTarget[FIZZ_CHROME_DEBUGGER_REGISTRY_KEY] = registry

  return registry
}

export const listRuntimeChromeDebuggerRegistrations = (
  target: typeof globalThis = globalThis,
): RuntimeChromeDebuggerRegistryEntry[] => {
  const registry = getRuntimeChromeDebuggerRegistry(target)

  return registry ? [...registry.runtimes.values()] : []
}

export const registerRuntimeInChromeDebuggerRegistry = (
  options: {
    label?: string
    runtime: Runtime<any, any>
  },
  target: typeof globalThis = globalThis,
): {
  runtimeId: string
  unregister: () => void
} => {
  const registry = getOrCreateRuntimeChromeDebuggerRegistry(target)
  const runtimeId = registry.nextRuntimeId(
    options.label ?? options.runtime.currentState().name,
  )
  const entry: RuntimeChromeDebuggerRegistryEntry = {
    connectedAt: Date.now(),
    runtime: options.runtime,
    runtimeId,
    ...(options.label === undefined ? {} : { label: options.label }),
  }

  registry.runtimes.set(runtimeId, entry)

  return {
    runtimeId,
    unregister: () => {
      const currentEntry = registry.runtimes.get(runtimeId)

      if (currentEntry?.runtime === options.runtime) {
        registry.runtimes.delete(runtimeId)
      }
    },
  }
}
