import { afterAll, describe, expect, jest, test } from "@jest/globals"

import type { ActionCreatorType } from "../action"
import { action, enter } from "../action"
import { History } from "../context"
import { createMachine } from "../createMachine"
import { effect } from "../effect"
import { createRuntime } from "../runtime"
import {
  actionCommand,
  commandsFromStateReturns,
} from "../runtime/runtimeCommandFactory"
import { queueItemsFromCommands } from "../runtime/runtimeQueue"
import { buildStateTransitionCommands } from "../runtime/transitions"
import { state } from "../state"
import { benchmark, writeBenchmarkSnapshot } from "./benchmarkHarness"

const historyIterations = 20
const historyWarmupIterations = 5
const runtimeIterations = 6
const runtimeWarmupIterations = 2
const microIterations = 12
const microWarmupIterations = 3

jest.setTimeout(120_000)

const createCounterRuntime = (monitorCount = 0) => {
  const tick = action("Tick")
  type Tick = ActionCreatorType<typeof tick>

  const Counting = state<Tick, { count: number }>(
    {
      Tick: (data, _, { update }) =>
        update({
          count: data.count + 1,
        }),
    },
    { name: "Counting" },
  )

  const machine = createMachine({
    actions: { tick },
    states: { Counting },
  })
  const runtime = createRuntime(machine, Counting({ count: 0 }))

  for (let index = 0; index < monitorCount; index += 1) {
    runtime.addMonitor(() => undefined)
  }

  return {
    runtime,
    tick,
  }
}

afterAll(() => {
  writeBenchmarkSnapshot("fizz-runtime")
})

describe("runtime performance baselines", () => {
  test("history push scaling", async () => {
    const sizes = [10, 100, 500] as const

    const results = await Promise.all(
      sizes.map(size =>
        benchmark(
          `history.push(maxHistory=${size})`,
          () => {
            const history = new History([enter()], size)

            for (let index = 0; index < 1000; index += 1) {
              history.push(enter())
            }
          },
          {
            iterations: historyIterations,
            warmupIterations: historyWarmupIterations,
          },
        ),
      ),
    )

    expect(results.every(result => Number.isFinite(result.meanMs))).toBe(true)
    expect(results.every(result => result.maxMs > 0)).toBe(true)
  })

  test("runtime dispatch throughput", async () => {
    const result = await benchmark(
      "runtime.run(80 ticks)",
      async () => {
        const { runtime, tick } = createCounterRuntime()

        for (let index = 0; index < 80; index += 1) {
          await runtime.run(tick())
        }

        runtime.disconnect()
      },
      {
        iterations: runtimeIterations,
        warmupIterations: runtimeWarmupIterations,
      },
    )

    expect(Number.isFinite(result.meanMs)).toBe(true)
    expect(result.maxMs).toBeGreaterThan(0)
  })

  test("queueItemsFromCommands allocation", async () => {
    const tick = action("Tick")
    const commands = Array.from({ length: 500 }, () => actionCommand(tick()))

    const result = await benchmark(
      "queueItemsFromCommands(500 commands)",
      () => {
        const queued = queueItemsFromCommands(commands)

        void queued.promise
      },
      {
        iterations: microIterations,
        warmupIterations: microWarmupIterations,
      },
    )

    expect(result.maxMs).toBeGreaterThan(0)
  })

  test("commandsFromStateReturns transition allocation", async () => {
    const tick = action("Tick")
    type Tick = ActionCreatorType<typeof tick>
    const A = state<Tick, { value: number }>(
      {
        Tick: (data, _, { update }) =>
          update({
            value: data.value + 1,
          }),
      },
      { name: "A" },
    )

    const stateReturns = Array.from({ length: 600 }, (_, index) => {
      if (index % 3 === 0) {
        return tick()
      }

      if (index % 3 === 1) {
        return effect("noop", undefined, () => undefined)
      }

      return A({ value: index })
    })

    const result = await benchmark(
      "commandsFromStateReturns(600 returns)",
      () => {
        void commandsFromStateReturns(stateReturns)
      },
      {
        iterations: microIterations,
        warmupIterations: microWarmupIterations,
      },
    )

    expect(result.maxMs).toBeGreaterThan(0)
  })

  test("buildStateTransitionCommands enter allocation", async () => {
    const tick = action("Tick")
    type Tick = ActionCreatorType<typeof tick>
    const A = state<Tick, undefined>(
      {
        Tick: () => undefined,
      },
      { name: "A" },
    )
    const B = state<Tick, undefined>(
      {
        Tick: () => undefined,
      },
      { name: "B" },
    )

    const machine = createMachine({
      actions: { tick },
      states: { A, B },
    })
    const runtime = createRuntime(machine, A(undefined))

    const result = await benchmark(
      "buildStateTransitionCommands(enter B)",
      () => {
        void buildStateTransitionCommands({
          actionCommand,
          context: runtime.context,
          effectCommand: effectValue => ({
            effect: effectValue,
            kind: "effect" as const,
          }),
          notifyContextDidChange: () => undefined,
          prepareForTransition: () => undefined,
          runtime,
          targetState: B(undefined),
        })
      },
      {
        iterations: microIterations,
        warmupIterations: microWarmupIterations,
      },
    )

    expect(result.maxMs).toBeGreaterThan(0)
    runtime.disconnect()
  })

  test("monitor fanout overhead", async () => {
    const baseline = await benchmark(
      "runtime.run(60 ticks) monitors=0",
      async () => {
        const { runtime, tick } = createCounterRuntime(0)

        for (let index = 0; index < 60; index += 1) {
          await runtime.run(tick())
        }

        runtime.disconnect()
      },
      {
        iterations: runtimeIterations,
        warmupIterations: runtimeWarmupIterations,
      },
    )

    const withMonitors = await benchmark(
      "runtime.run(60 ticks) monitors=25",
      async () => {
        const { runtime, tick } = createCounterRuntime(25)

        for (let index = 0; index < 60; index += 1) {
          await runtime.run(tick())
        }

        runtime.disconnect()
      },
      {
        iterations: runtimeIterations,
        warmupIterations: runtimeWarmupIterations,
      },
    )

    expect(Number.isFinite(baseline.meanMs)).toBe(true)
    expect(Number.isFinite(withMonitors.meanMs)).toBe(true)
    expect(withMonitors.maxMs).toBeGreaterThan(0)
  })
})
