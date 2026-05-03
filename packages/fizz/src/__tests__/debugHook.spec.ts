import { describe, expect, test } from "@jest/globals"

import {
  FIZZ_CHROME_DEBUGGER_REGISTRY_KEY,
  getOrCreateRuntimeChromeDebuggerRegistry,
  getRuntimeChromeDebuggerRegistry,
  listRuntimeChromeDebuggerRegistrations,
  registerRuntimeInChromeDebuggerRegistry,
} from "../runtime/debugHook.js"

type RuntimeStub = {
  currentState: () => {
    name: string
  }
}

const createRuntime = (name: string): RuntimeStub => ({
  currentState: () => ({ name }),
})

describe("debugHook", () => {
  test("getOrCreate returns existing registry and increments generated ids", () => {
    const target = {} as typeof globalThis

    const firstRegistry = getOrCreateRuntimeChromeDebuggerRegistry(target)
    const secondRegistry = getOrCreateRuntimeChromeDebuggerRegistry(target)

    expect(secondRegistry).toBe(firstRegistry)
    expect(firstRegistry.nextRuntimeId()).toBe("runtime-1")
    expect(firstRegistry.nextRuntimeId("  My Runtime  ")).toBe("my-runtime-2")
    expect(firstRegistry.nextRuntimeId("!!!")).toBe("runtime-3")
    expect(getRuntimeChromeDebuggerRegistry(target)).toBe(firstRegistry)
  })

  test("list returns empty array without a registry", () => {
    const target = {} as typeof globalThis

    expect(getRuntimeChromeDebuggerRegistry(target)).toBeUndefined()
    expect(listRuntimeChromeDebuggerRegistrations(target)).toEqual([])
  })

  test("register includes optional label and unregister removes matching runtime", () => {
    const target = {} as typeof globalThis
    const runtime = createRuntime("InitialState")

    const { runtimeId, unregister } = registerRuntimeInChromeDebuggerRegistry(
      {
        label: "  Runtime Label  ",
        runtime: runtime as never,
      },
      target,
    )

    const registrations = listRuntimeChromeDebuggerRegistrations(target)

    expect(registrations).toHaveLength(1)
    expect(registrations[0]?.runtimeId).toBe(runtimeId)
    expect(registrations[0]?.label).toBe("  Runtime Label  ")

    unregister()

    expect(listRuntimeChromeDebuggerRegistrations(target)).toEqual([])
  })

  test("register falls back to current state name when label is omitted", () => {
    const target = {} as typeof globalThis
    const runtime = createRuntime("  Fallback State  ")

    const { runtimeId } = registerRuntimeInChromeDebuggerRegistry(
      {
        runtime: runtime as never,
      },
      target,
    )

    expect(runtimeId).toBe("fallback-state-1")

    const registrations = listRuntimeChromeDebuggerRegistrations(target)
    expect(registrations[0]?.label).toBeUndefined()
  })

  test("unregister is a no-op when runtime instance no longer matches", () => {
    const target = {} as typeof globalThis
    const originalRuntime = createRuntime("Original")

    const { runtimeId, unregister } = registerRuntimeInChromeDebuggerRegistry(
      {
        runtime: originalRuntime as never,
      },
      target,
    )

    const registry = getOrCreateRuntimeChromeDebuggerRegistry(target)
    registry.runtimes.set(runtimeId, {
      connectedAt: Date.now(),
      runtime: createRuntime("Replacement") as never,
      runtimeId,
    })

    unregister()

    expect(registry.runtimes.has(runtimeId)).toBe(true)
  })

  test("registry is stored under the debugger global key", () => {
    const target = {} as typeof globalThis

    expect(
      (target as Record<string, unknown>)[FIZZ_CHROME_DEBUGGER_REGISTRY_KEY],
    ).toBeUndefined()

    const registry = getOrCreateRuntimeChromeDebuggerRegistry(target)

    expect(
      (target as Record<string, unknown>)[FIZZ_CHROME_DEBUGGER_REGISTRY_KEY],
    ).toBe(registry)
  })
})
