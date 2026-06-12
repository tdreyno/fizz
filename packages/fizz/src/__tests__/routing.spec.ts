import { describe, expect, jest, test } from "@jest/globals"

import type { Enter } from "../action"
import { action, enter } from "../action"
import { createMachine } from "../createMachine"
import { log, noop } from "../effect"
import type { RouteUnmatchedContext } from "../routing"
import { getRouteMetadata, route, RouteUnmatchedError } from "../routing"
import { createRuntime } from "../runtime"
import type { StateTransition } from "../state"
import { isStateTransition, state } from "../state"

type Data = { count: number; coupon?: string }

const TooHigh = state<Enter, Data>({ Enter: noop }, { name: "TooHigh" })
const Negative = state<Enter, Data>({ Enter: noop }, { name: "Negative" })
const Normal = state<Enter, Data>({ Enter: noop }, { name: "Normal" })

const asTransition = (result: unknown): StateTransition<string, any, Data> => {
  if (!isStateTransition(result)) {
    throw new Error("Expected a state transition")
  }

  return result as StateTransition<string, any, Data>
}

describe("route()", () => {
  describe("evaluation semantics", () => {
    test("returns the first matching branch's transition", () => {
      const handler = route<Data>()
        .when(d => d.count > 10, TooHigh)
        .when(d => d.count < 0, Negative)
        .otherwise(Normal)

      const result = asTransition(handler({ count: 50 }, undefined))

      expect(result.name).toBe("TooHigh")
    })

    test("does not evaluate later predicates after a match", () => {
      const later = jest.fn(() => true)

      const handler = route<Data>()
        .when(() => true, Normal)
        .when(later, TooHigh)

      void handler({ count: 1 }, undefined)

      expect(later).not.toHaveBeenCalled()
    })

    test("uses otherwise when no when-branch matches", () => {
      const handler = route<Data>()
        .when(d => d.count > 100, TooHigh)
        .otherwise(Normal)

      const result = asTransition(handler({ count: 1 }, undefined))

      expect(result.name).toBe("Normal")
    })

    test("stays put (returns undefined) when nothing matches and there is no otherwise", () => {
      const handler = route<Data>().when(d => d.count > 100, TooHigh)

      expect(handler({ count: 1 }, undefined)).toBeUndefined()
    })

    test("an empty route always stays put", () => {
      expect(route<Data>()({ count: 1 }, undefined)).toBeUndefined()
    })
  })

  describe("targets", () => {
    test("a bare state target receives the current data unchanged", () => {
      const handler = route<Data>().otherwise(Normal)

      const result = asTransition(handler({ count: 7 }, undefined))

      expect(result.name).toBe("Normal")
      expect(result.data).toEqual({ count: 7 })
    })

    test("a thunk target can transform data", () => {
      const handler = route<Data>().otherwise(d =>
        Normal({ count: d.count + 1 }),
      )

      const result = asTransition(handler({ count: 7 }, undefined))

      expect(result.data).toEqual({ count: 8 })
    })

    test("a thunk target can return an array of effects and a transition", () => {
      const handler = route<Data>().otherwise(d => [log("routing"), Normal(d)])

      const result = handler({ count: 1 }, undefined)

      expect(Array.isArray(result)).toBe(true)
    })

    test("a thunk target can return bare data as an in-place update", () => {
      const handler = route<Data>().when(
        d => d.count < 0,
        d => ({
          ...d,
          count: 0,
        }),
      )

      expect(handler({ count: -5 }, undefined)).toEqual({ count: 0 })
    })

    test("an async target propagates its promise", async () => {
      const handler = route<Data>().when(
        () => true,
        async () => Normal({ count: 0 }),
      )

      const result = handler({ count: 1 }, undefined)

      expect(result).toBeInstanceOf(Promise)

      const resolved = asTransition(await result)

      expect(resolved.name).toBe("Normal")
    })

    test("a type-guard predicate narrows the data passed to its target", () => {
      type Shape =
        | { kind: "circle"; radius: number }
        | { kind: "square"; side: number }

      const Round = state<Enter, Shape>({ Enter: noop }, { name: "Round" })
      const Boxy = state<Enter, Shape>({ Enter: noop }, { name: "Boxy" })

      const handler = route<Shape>()
        .when(
          (d): d is Extract<Shape, { kind: "circle" }> => d.kind === "circle",
          d => Round({ kind: "circle", radius: d.radius }),
        )
        .otherwise(Boxy)

      const result = asTransition(
        handler({ kind: "circle", radius: 3 }, undefined),
      )

      expect(result.name).toBe("Round")
    })
  })

  describe("as a runtime handler", () => {
    test("a transient Enter route lands on the routed state", async () => {
      const Triage = state<Enter, Data>(
        {
          Enter: route<Data>()
            .when(d => d.count === 0, Normal)
            .otherwise(TooHigh),
        },
        { name: "Triage" },
      )

      const machine = createMachine({
        states: { Normal, Triage, TooHigh },
      })

      const runtime = createRuntime(machine, Triage({ count: 0 }))

      await runtime.run(enter())

      expect(runtime.currentState().is(Normal)).toBe(true)
    })

    test("routes a guarded transition on a non-Enter action using the payload", async () => {
      const submit = action("Submit").withPayload<{ amount: number }>()

      const AwaitingPayment = state<Enter | ReturnType<typeof submit>, Data>(
        {
          Enter: noop,
          Submit: route<Data, { amount: number }>()
            .when((d, p) => p.amount < d.count, TooHigh)
            .otherwise(Normal),
        },
        { name: "AwaitingPayment" },
      )

      const machine = createMachine({
        actions: { submit },
        states: { AwaitingPayment, Normal, TooHigh },
      })

      const runtime = createRuntime(machine, AwaitingPayment({ count: 100 }))

      await runtime.run(enter())
      await runtime.run(submit({ amount: 10 }))

      expect(runtime.currentState().is(TooHigh)).toBe(true)
    })
  })

  describe("introspection", () => {
    test("exposes ordered branch metadata with resolved labels", () => {
      const handler = route<Data>()
        .when(d => d.count === 0, Normal)
        .when(
          d => d.count < 0,
          d => Negative(d),
        )
        .otherwise(TooHigh)

      const meta = getRouteMetadata(handler)

      expect(meta?.branches.map(branch => branch.label)).toEqual([
        "Normal",
        "branch 2",
        "TooHigh",
      ])
      expect(meta?.branches.map(branch => branch.otherwise)).toEqual([
        false,
        false,
        true,
      ])
    })

    test("an explicit label overrides the auto-generated one", () => {
      const handler = route<Data>().when(d => d.count === 0, Normal, {
        label: "zero",
      })

      expect(getRouteMetadata(handler)?.branches[0].label).toBe("zero")
    })

    test("returns undefined for handlers that are not routes", () => {
      expect(getRouteMetadata(noop)).toBeUndefined()
      expect(getRouteMetadata(undefined)).toBeUndefined()
    })

    test("exposes a 0-based index per branch in declaration order", () => {
      const handler = route<Data>()
        .when(d => d.count === 0, Normal)
        .when(d => d.count < 0, Negative)
        .otherwise(TooHigh)

      expect(getRouteMetadata(handler)?.branches.map(b => b.index)).toEqual([
        0, 1, 2,
      ])
    })

    test("uses an explicit id when provided", () => {
      const handler = route<Data>()
        .when(d => d.count === 0, Normal, {
          id: "zero",
          label: "Zero count",
        })
        .otherwise(TooHigh, { id: "fallback" })

      expect(getRouteMetadata(handler)?.branches.map(b => b.id)).toEqual([
        "zero",
        "fallback",
      ])
    })

    test("defaults id to the resolved label when not provided", () => {
      const handler = route<Data>()
        .when(d => d.count === 0, Normal)
        .otherwise(TooHigh)

      expect(getRouteMetadata(handler)?.branches.map(b => b.id)).toEqual([
        "Normal",
        "TooHigh",
      ])
    })
  })

  describe("strict mode", () => {
    test("default route() stays silent on unmatched (no throw, no warn)", () => {
      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined)

      try {
        const handler = route<Data>().when(d => d.count > 100, TooHigh)

        expect(handler({ count: 1 }, undefined)).toBeUndefined()
        expect(warn).not.toHaveBeenCalled()
      } finally {
        warn.mockRestore()
      }
    })

    test("throws on unmatched when onUnmatched is 'throw'", () => {
      const handler = route<Data>({ onUnmatched: "throw" }).when(
        d => d.count > 100,
        TooHigh,
      )

      expect(() => handler({ count: 1 }, undefined)).toThrow(
        RouteUnmatchedError,
      )
    })

    test("does not throw when an otherwise branch matches in throw mode", () => {
      const handler = route<Data>({ onUnmatched: "throw" })
        .when(d => d.count > 100, TooHigh)
        .otherwise(Normal)

      const result = asTransition(handler({ count: 1 }, undefined))

      expect(result.name).toBe("Normal")
    })

    test("strict: true defaults to throwing on unmatched", () => {
      const handler = route<Data>({ strict: true }).when(
        d => d.count > 100,
        TooHigh,
      )

      expect(() => handler({ count: 1 }, undefined)).toThrow(
        RouteUnmatchedError,
      )
    })

    test("warns via console.warn when onUnmatched is 'warn'", () => {
      const warn = jest
        .spyOn(console, "warn")
        .mockImplementation(() => undefined)

      try {
        const handler = route<Data>({ onUnmatched: "warn" }).when(
          d => d.count > 100,
          TooHigh,
        )

        expect(handler({ count: 1 }, undefined)).toBeUndefined()
        expect(warn).toHaveBeenCalledTimes(1)
      } finally {
        warn.mockRestore()
      }
    })

    test("calls a custom onUnmatched function with route context on unmatched", () => {
      const onUnmatched =
        jest.fn<(context: RouteUnmatchedContext<Data, undefined>) => void>()

      const handler = route<Data>({ onUnmatched }).when(
        d => d.count > 100,
        TooHigh,
        { id: "too-high" },
      )

      const result = handler({ count: 1 }, undefined)

      expect(result).toBeUndefined()
      expect(onUnmatched).toHaveBeenCalledTimes(1)

      const context = onUnmatched.mock.calls[0]![0]

      expect(context.data).toEqual({ count: 1 })
      expect(context.payload).toBeUndefined()
      expect(context.branches.map(b => b.id)).toEqual(["too-high"])
    })
  })

  describe("immutability", () => {
    test("each chained call returns a new builder so a base can branch independently", () => {
      const base = route<Data>().when(d => d.count === 0, Normal)
      const a = base.otherwise(TooHigh)
      const b = base.otherwise(Negative)

      expect(getRouteMetadata(base)?.branches).toHaveLength(1)
      expect(getRouteMetadata(a)?.branches).toHaveLength(2)
      expect(getRouteMetadata(b)?.branches).toHaveLength(2)
      expect(getRouteMetadata(a)?.branches[1].label).toBe("TooHigh")
      expect(getRouteMetadata(b)?.branches[1].label).toBe("Negative")
    })
  })
})
