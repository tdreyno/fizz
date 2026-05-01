import type { StateTransition } from "./state.js"

type RuntimeState = StateTransition<string, any, any>

type ResourceEntry = {
  teardown?: (value: unknown) => void
  value: unknown
}

const stateResources = new WeakMap<RuntimeState, Map<string, ResourceEntry>>()

const getOrCreateStateResourcesMap = (state: RuntimeState) => {
  const existing = stateResources.get(state)

  if (existing) {
    return existing
  }

  const created = new Map<string, ResourceEntry>()

  stateResources.set(state, created)

  return created
}

const toResourcesRecord = (
  resourcesMap: Map<string, ResourceEntry> | undefined,
): Record<string, unknown> => {
  if (!resourcesMap || resourcesMap.size === 0) {
    return {}
  }

  return [...resourcesMap.entries()].reduce<Record<string, unknown>>(
    (sum, [key, entry]) => ({
      ...sum,
      [key]: entry.value,
    }),
    {},
  )
}

export const getStateResources = (
  state: RuntimeState,
): Record<string, unknown> => toResourcesRecord(stateResources.get(state))

export const listStateResourceKeys = (state: RuntimeState): string[] => {
  const resourcesMap = stateResources.get(state)

  if (!resourcesMap) {
    return []
  }

  return [...resourcesMap.keys()]
}

export const hasStateResource = (state: RuntimeState, key: string): boolean => {
  const resourcesMap = stateResources.get(state)

  return resourcesMap?.has(key) ?? false
}

export const setStateResource = (options: {
  key: string
  state: RuntimeState
  teardown?: (value: unknown) => void
  value: unknown
}) => {
  const resourcesMap = getOrCreateStateResourcesMap(options.state)

  resourcesMap.set(options.key, {
    ...(options.teardown === undefined ? {} : { teardown: options.teardown }),
    value: options.value,
  })
}

export const releaseStateResource = <
  Reason extends "cleanup" | "effect",
>(options: {
  key: string
  reason: Reason
  state: RuntimeState
}): {
  error?: unknown
  key: string
  released: boolean
  reason: Reason
} => {
  const resourcesMap = stateResources.get(options.state)

  if (!resourcesMap) {
    return {
      key: options.key,
      reason: options.reason,
      released: false,
    }
  }

  const entry = resourcesMap.get(options.key)

  if (!entry) {
    return {
      key: options.key,
      reason: options.reason,
      released: false,
    }
  }

  resourcesMap.delete(options.key)

  if (resourcesMap.size === 0) {
    stateResources.delete(options.state)
  }

  if (!entry.teardown) {
    return {
      key: options.key,
      reason: options.reason,
      released: true,
    }
  }

  try {
    entry.teardown(entry.value)

    return {
      key: options.key,
      reason: options.reason,
      released: true,
    }
  } catch (error) {
    return {
      error,
      key: options.key,
      reason: options.reason,
      released: true,
    }
  }
}

export const disposeStateResources = (
  state: RuntimeState,
): Array<{
  error?: unknown
  key: string
  reason: "cleanup"
  released: boolean
}> => {
  const resourcesMap = stateResources.get(state)

  if (!resourcesMap || resourcesMap.size === 0) {
    return []
  }

  const keys = [...resourcesMap.keys()].reverse()

  return keys.map(key =>
    releaseStateResource({
      key,
      reason: "cleanup",
      state,
    }),
  )
}

export const transferStateResources = (options: {
  from: RuntimeState
  to: RuntimeState
}) => {
  const existing = stateResources.get(options.from)

  if (!existing || existing.size === 0) {
    return
  }

  stateResources.set(options.to, existing)
  stateResources.delete(options.from)
}
