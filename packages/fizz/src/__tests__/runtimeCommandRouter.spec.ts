import { describe, expect, test } from "@jest/globals"

import { action } from "../action"
import { effect } from "../effect"
import { executeRuntimeCommand } from "../runtime/runtimeCommandRouter"

describe("runtimeCommandRouter", () => {
  test("routes action commands", async () => {
    const runAction = action("Run")
    const seen: string[] = []

    const result = await executeRuntimeCommand(
      {
        action: runAction(),
        kind: "action",
      },
      {
        handleAction: async item => {
          seen.push(item.type)
          return ["handled-action"]
        },
        handleEffect: async () => ["handled-effect"],
        handleState: async () => ["handled-state"],
      },
    )

    expect(seen).toEqual(["Run"])
    expect(result).toEqual(["handled-action"])
  })

  test("routes state commands", async () => {
    const state = {
      data: {},
      executor: () => [],
      is: () => false,
      isNamed: (name: string) => name === "Idle",
      isStateTransition: true,
      mode: "append" as const,
      name: "Idle",
      state: undefined as never,
    }

    const result = await executeRuntimeCommand(
      {
        kind: "state",
        state,
      },
      {
        handleAction: async () => ["handled-action"],
        handleEffect: async () => ["handled-effect"],
        handleState: async item => [item.name],
      },
    )

    expect(result).toEqual(["Idle"])
  })

  test("routes effect commands", async () => {
    const result = await executeRuntimeCommand(
      {
        effect: effect("noop"),
        kind: "effect",
      },
      {
        handleAction: async () => ["handled-action"],
        handleEffect: async item => [item.label],
        handleState: async () => ["handled-state"],
      },
    )

    expect(result).toEqual(["noop"])
  })

  test("throws for unknown command kind", async () => {
    await expect(
      executeRuntimeCommand(
        {
          kind: "invalid",
        } as never,
        {
          handleAction: async () => [],
          handleEffect: async () => [],
          handleState: async () => [],
        },
      ),
    ).rejects.toThrow("Returned an known effect type")
  })
})
