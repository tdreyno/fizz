import { describe, expect, jest, test } from "@jest/globals"

import { createRuntimeRegistry } from "../runtimeRegistry"

describe("runtime registry", () => {
  test("should create and reuse primitive keys", () => {
    const init = jest.fn(() => ({ id: "runtime-1" }))
    const registry = createRuntimeRegistry<string, { id: string }>()

    const first = registry.getOrCreate("notes:1", init)
    const second = registry.getOrCreate("notes:1", init)

    expect(first).toBe(second)
    expect(init).toHaveBeenCalledTimes(1)
    expect(registry.has("notes:1")).toBeTruthy()
    expect(registry.get("notes:1")).toEqual({ id: "runtime-1" })
  })

  test("should create and reuse object keys", () => {
    const key = { id: "root" }
    const init = jest.fn(() => ({ id: "runtime-object" }))
    const registry = createRuntimeRegistry<object, { id: string }>()

    const first = registry.getOrCreate(key, init)
    const second = registry.getOrCreate(key, init)

    expect(first).toBe(second)
    expect(init).toHaveBeenCalledTimes(1)
    expect(registry.has(key)).toBeTruthy()
    expect(registry.get(key)).toEqual({ id: "runtime-object" })
  })

  test("should call default disconnect on dispose", () => {
    const disconnect = jest.fn()
    const key = "notes:disconnect"
    const registry = createRuntimeRegistry<string, { disconnect: () => void }>()

    registry.getOrCreate(key, () => ({ disconnect }))

    const result = registry.dispose(key)

    expect(result).toEqual({ disposed: true })
    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(registry.has(key)).toBeFalsy()
  })

  test("should keep entries when removeOnFailure is false", () => {
    const key = "notes:retry"
    const failure = new Error("dispose failed")
    const disposeRuntime = jest.fn(() => {
      throw failure
    })
    const registry = createRuntimeRegistry<string, { id: string }>({
      disposeRuntime,
      removeOnFailure: false,
    })

    registry.getOrCreate(key, () => ({ id: "runtime" }))

    const result = registry.dispose(key)

    expect(result).toEqual({
      disposed: true,
      error: failure,
    })
    expect(registry.has(key)).toBeTruthy()
  })

  test("should remove entries when dispose fails by default", () => {
    const key = "notes:remove-on-failure"
    const failure = new Error("dispose failed")
    const disposeRuntime = jest.fn(() => {
      throw failure
    })
    const registry = createRuntimeRegistry<string, { id: string }>({
      disposeRuntime,
    })

    registry.getOrCreate(key, () => ({ id: "runtime" }))

    const result = registry.dispose(key)

    expect(result).toEqual({
      disposed: true,
      error: failure,
    })
    expect(registry.has(key)).toBeFalsy()
  })

  test("should dispose all entries in deterministic order", () => {
    const objectKey = { id: "object" }
    const disposedKeys: Array<string> = []
    const registry = createRuntimeRegistry<string | object, { id: string }>({
      disposeRuntime: (_value, key) => {
        disposedKeys.push(
          typeof key === "string" ? key : (key as { id: string }).id,
        )
      },
    })

    registry.getOrCreate("primitive:1", () => ({ id: "p1" }))
    registry.getOrCreate("primitive:2", () => ({ id: "p2" }))
    registry.getOrCreate(objectKey, () => ({ id: "o1" }))

    const result = registry.disposeAll()

    expect(disposedKeys).toEqual(["primitive:1", "primitive:2", "object"])
    expect(result).toEqual({
      disposed: 3,
      errors: [],
      failed: 0,
    })
  })

  test("should emit lifecycle events when configured", () => {
    const events: string[] = []
    const registry = createRuntimeRegistry<string, { id: string }>({
      onLifecycleEvent: event => {
        events.push(event.type)
      },
    })

    registry.getOrCreate("notes:1", () => ({ id: "r1" }))
    registry.getOrCreate("notes:1", () => ({ id: "r1" }))
    registry.dispose("notes:1")

    expect(events).toEqual(["created", "reused", "disposed"])
  })

  test("should expose active values for diagnostics", () => {
    const objectKey = { id: "obj" }
    const registry = createRuntimeRegistry<string | object, { id: string }>()

    registry.getOrCreate("notes:1", () => ({ id: "p1" }))
    registry.getOrCreate(objectKey, () => ({ id: "o1" }))

    const values = [...registry.values()].map(value => value.id)

    expect(values).toEqual(["p1", "o1"])

    registry.dispose("notes:1")

    expect([...registry.values()].map(value => value.id)).toEqual(["o1"])
  })
})
