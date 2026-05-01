type RuntimeRegistryObjectKey = object

export type RuntimeRegistryPrimitiveKey =
  | bigint
  | boolean
  | null
  | number
  | string
  | symbol
  | undefined

export type RuntimeRegistryKey =
  | RuntimeRegistryObjectKey
  | RuntimeRegistryPrimitiveKey

export type RuntimeRegistryLifecycleEvent<K extends RuntimeRegistryKey, V> =
  | {
      key: K
      type: "created"
      value: V
    }
  | {
      key: K
      type: "dispose-error"
      value: V
      error: unknown
    }
  | {
      key: K
      type: "disposed"
      value: V
    }
  | {
      key: K
      type: "reused"
      value: V
    }

export type RuntimeRegistryDisposeResult = {
  disposed: boolean
  error?: unknown
}

export type RuntimeRegistryDisposeAllResult<K extends RuntimeRegistryKey> = {
  disposed: number
  errors: Array<{
    error: unknown
    key: K
  }>
  failed: number
}

export type RuntimeRegistryOptions<K extends RuntimeRegistryKey, V> = {
  disposeRuntime?: (value: V, key: K) => void
  onLifecycleEvent?: (event: RuntimeRegistryLifecycleEvent<K, V>) => void
  removeOnFailure?: boolean
}

type RuntimeRegistryPrimitiveEntry<K extends RuntimeRegistryPrimitiveKey, V> = {
  active: boolean
  id: number
  key: K
  value: V
}

type RuntimeRegistryObjectEntry<V> = {
  active: boolean
  id: number
  value: V
}

type RuntimeRegistryObjectOrderEntry = {
  id: number
  keyRef: WeakRef<object>
}

type DefaultDisconnectable = {
  disconnect?: () => void
}

const isObjectKey = (
  key: RuntimeRegistryKey,
): key is RuntimeRegistryObjectKey => typeof key === "object" && key !== null

const defaultDisposeRuntime = <V>(value: V): void => {
  const maybeDisconnectable = value as DefaultDisconnectable

  if (typeof maybeDisconnectable.disconnect === "function") {
    maybeDisconnectable.disconnect()
  }
}

export type RuntimeRegistry<K extends RuntimeRegistryKey, V> = {
  dispose: (key: K) => RuntimeRegistryDisposeResult
  disposeAll: () => RuntimeRegistryDisposeAllResult<K>
  get: (key: K) => V | undefined
  getOrCreate: (key: K, init: () => V) => V
  has: (key: K) => boolean
  values: () => IterableIterator<V>
}

export const createRuntimeRegistry = <K extends RuntimeRegistryKey, V>(
  options: RuntimeRegistryOptions<K, V> = {},
): RuntimeRegistry<K, V> => {
  let entryId = 1

  const primitiveStore = new Map<
    RuntimeRegistryPrimitiveKey,
    RuntimeRegistryPrimitiveEntry<RuntimeRegistryPrimitiveKey, V>
  >()
  const objectStore = new WeakMap<object, RuntimeRegistryObjectEntry<V>>()
  const objectOrder: RuntimeRegistryObjectOrderEntry[] = []
  const removeOnFailure = options.removeOnFailure ?? true
  const disposeRuntime =
    options.disposeRuntime ?? ((value: V) => defaultDisposeRuntime(value))

  const emit = (event: RuntimeRegistryLifecycleEvent<K, V>) => {
    options.onLifecycleEvent?.(event)
  }

  const createPrimitiveEntry = (
    key: RuntimeRegistryPrimitiveKey,
    value: V,
  ): RuntimeRegistryPrimitiveEntry<RuntimeRegistryPrimitiveKey, V> => ({
    active: true,
    id: entryId++,
    key,
    value,
  })

  const createObjectEntry = (value: V): RuntimeRegistryObjectEntry<V> => ({
    active: true,
    id: entryId++,
    value,
  })

  const getPrimitiveEntry = (key: RuntimeRegistryPrimitiveKey) => {
    const entry = primitiveStore.get(key)

    if (!entry?.active) {
      return undefined
    }

    return entry
  }

  const getObjectEntry = (key: object) => {
    const entry = objectStore.get(key)

    if (!entry?.active) {
      return undefined
    }

    return entry
  }

  const getEntry = (key: K) =>
    isObjectKey(key) ? getObjectEntry(key) : getPrimitiveEntry(key)

  const markDisposedPrimitive = (key: RuntimeRegistryPrimitiveKey) => {
    const entry = primitiveStore.get(key)

    if (!entry) {
      return
    }

    entry.active = false
    primitiveStore.delete(key)
  }

  const markDisposedObject = (key: object) => {
    const entry = objectStore.get(key)

    if (!entry) {
      return
    }

    entry.active = false
    objectStore.delete(key)
  }

  const markDisposed = (key: K) => {
    if (isObjectKey(key)) {
      markDisposedObject(key)
      return
    }

    markDisposedPrimitive(key)
  }

  const cleanupObjectOrder = () => {
    const activeEntries = objectOrder.reduce<RuntimeRegistryObjectOrderEntry[]>(
      (sum, item) => {
        const key = item.keyRef.deref()

        if (!key) {
          return sum
        }

        const entry = objectStore.get(key)

        if (!entry || !entry.active || entry.id !== item.id) {
          return sum
        }

        return [...sum, item]
      },
      [],
    )

    objectOrder.length = 0
    objectOrder.push(...activeEntries)
  }

  const get = (key: K): V | undefined => getEntry(key)?.value

  const has = (key: K): boolean => getEntry(key) !== undefined

  const getOrCreate = (key: K, init: () => V): V => {
    const existingEntry = getEntry(key)

    if (existingEntry) {
      emit({
        key,
        type: "reused",
        value: existingEntry.value,
      })

      return existingEntry.value
    }

    const value = init()

    if (isObjectKey(key)) {
      const entry = createObjectEntry(value)

      objectStore.set(key, entry)
      objectOrder.push({
        id: entry.id,
        keyRef: new WeakRef(key),
      })
    } else {
      primitiveStore.set(key, createPrimitiveEntry(key, value))
    }

    emit({
      key,
      type: "created",
      value,
    })

    return value
  }

  const dispose = (key: K): RuntimeRegistryDisposeResult => {
    const entry = getEntry(key)

    if (!entry) {
      return {
        disposed: false,
      }
    }

    try {
      disposeRuntime(entry.value, key)

      markDisposed(key)
      emit({
        key,
        type: "disposed",
        value: entry.value,
      })

      cleanupObjectOrder()

      return {
        disposed: true,
      }
    } catch (error) {
      emit({
        error,
        key,
        type: "dispose-error",
        value: entry.value,
      })

      if (removeOnFailure) {
        markDisposed(key)
        cleanupObjectOrder()
      }

      return {
        disposed: true,
        error,
      }
    }
  }

  const disposeAll = (): RuntimeRegistryDisposeAllResult<K> => {
    const primitiveResults = [...primitiveStore.keys()].map(key => ({
      key: key as K,
      result: dispose(key as K),
    }))
    const objectResults = objectOrder.reduce<
      Array<{ key: K; result: RuntimeRegistryDisposeResult }>
    >((sum, item) => {
      const key = item.keyRef.deref()

      if (!key) {
        return sum
      }

      const entry = objectStore.get(key)

      if (!entry || !entry.active || entry.id !== item.id) {
        return sum
      }

      return [
        ...sum,
        {
          key: key as K,
          result: dispose(key as K),
        },
      ]
    }, [])
    const allResults = [...primitiveResults, ...objectResults]
    const errors = allResults.reduce<Array<{ error: unknown; key: K }>>(
      (sum, result) => {
        if (!result.result.error) {
          return sum
        }

        return [
          ...sum,
          {
            error: result.result.error,
            key: result.key,
          },
        ]
      },
      [],
    )

    cleanupObjectOrder()

    return {
      disposed: allResults.filter(result => result.result.disposed).length,
      errors,
      failed: errors.length,
    }
  }

  const values = function* (): IterableIterator<V> {
    const primitiveValues = [...primitiveStore.values()]
      .filter(entry => entry.active)
      .map(entry => entry.value)
    const objectValues = objectOrder.reduce<V[]>((sum, item) => {
      const key = item.keyRef.deref()

      if (!key) {
        return sum
      }

      const entry = objectStore.get(key)

      if (!entry || !entry.active || entry.id !== item.id) {
        return sum
      }

      return [...sum, entry.value]
    }, [])

    for (const value of [...primitiveValues, ...objectValues]) {
      yield value
    }
  }

  return {
    dispose,
    disposeAll,
    get,
    getOrCreate,
    has,
    values,
  }
}
