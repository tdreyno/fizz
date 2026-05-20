import { afterAll, describe, expect, jest, test } from "@jest/globals"

import type { ActionCreatorType } from "../action"
import { action, enter } from "../action"
import { History } from "../context"
import { createMachine } from "../createMachine"
import { effect } from "../effect"
import { createParallelMachine } from "../parallelMachine"
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

  test("burst dispatch (100 fire-and-forget)", async () => {
    const result = await benchmark(
      "runtime.run x100 (no await per call)",
      async () => {
        const { runtime, tick } = createCounterRuntime()

        const pending = new Array<Promise<void>>(100)

        for (let index = 0; index < 100; index += 1) {
          pending[index] = runtime.run(tick())
        }

        await Promise.all(pending)
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

  test("concurrent runtimes per frame", async () => {
    const sizes = [10, 50] as const

    const results = await Promise.all(
      sizes.map(size =>
        benchmark(
          `runtimes=${size} x 1 tick each (frame budget)`,
          async () => {
            const runtimes = Array.from({ length: size }, () =>
              createCounterRuntime(),
            )

            await Promise.all(
              runtimes.map(({ runtime, tick }) => runtime.run(tick())),
            )

            runtimes.forEach(({ runtime }) => runtime.disconnect())
          },
          {
            iterations: runtimeIterations,
            warmupIterations: runtimeWarmupIterations,
          },
        ),
      ),
    )

    expect(results.every(result => Number.isFinite(result.meanMs))).toBe(true)
    // Frame budget assertion: 50 runtimes dispatching one action should fit
    // comfortably inside a 16ms frame on the perf host.
    const fifty = results.find(result => result.name.includes("runtimes=50"))

    expect(fifty?.p95).toBeLessThan(16)
  })

  test("parallel machine dispatch (k lanes x 40 ticks)", async () => {
    const sizes = [1, 4, 16] as const

    const results = await Promise.all(
      sizes.map(async size => {
        const tick = action("Tick")
        type Tick = ActionCreatorType<typeof tick>

        const branches = Object.fromEntries(
          Array.from({ length: size }, (_, index) => {
            const Counting = state<Tick, { count: number }>(
              {
                Tick: (data, _payload, { update }) =>
                  update({ count: data.count + 1 }),
              },
              { name: `Counting${index}` },
            )

            const machine = createMachine({
              actions: { tick },
              states: { Counting },
            })

            return [
              `lane${index}`,
              Object.assign(machine, {
                initialState: Counting({ count: 0 }),
              }),
            ] as const
          }),
        )

        const parallel = createParallelMachine(branches, {
          name: `Parallel${size}`,
        })

        return benchmark(
          `parallel(${size} lanes).run x40 ticks`,
          async () => {
            const runtime = createRuntime(
              parallel.machine,
              parallel.initialState,
            )

            await runtime.run(enter())

            for (let index = 0; index < 40; index += 1) {
              await runtime.run(parallel.actions.tick!())
            }

            runtime.disconnect()
          },
          {
            iterations: runtimeIterations,
            warmupIterations: runtimeWarmupIterations,
          },
        )
      }),
    )

    expect(results.every(result => Number.isFinite(result.meanMs))).toBe(true)
  })
})
