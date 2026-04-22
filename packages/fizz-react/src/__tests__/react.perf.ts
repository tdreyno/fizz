/**
 * @jest-environment jsdom
 */

import { afterAll, describe, expect, jest, test } from "@jest/globals"
import { act, renderHook } from "@testing-library/react"

import { useMachine } from "../useMachine"
import { benchmark, writeBenchmarkSnapshot } from "./benchmarkHarness"
import { Machine } from "./machine"

const mountIterations = 15
const mountWarmupIterations = 4
const updateIterations = 6
const updateWarmupIterations = 2

jest.setTimeout(120_000)

afterAll(() => {
  writeBenchmarkSnapshot("fizz-react")
})

describe("react integration performance baselines", () => {
  test("hook mount and initial state resolution", async () => {
    const result = await benchmark(
      "useMachine mount + initial render",
      () => {
        const view = renderHook(() =>
          useMachine(Machine, Machine.states.Initializing({ didWorld: false })),
        )

        view.unmount()
      },
      {
        iterations: mountIterations,
        warmupIterations: mountWarmupIterations,
      },
    )

    expect(Number.isFinite(result.meanMs)).toBe(true)
    expect(result.maxMs).toBeGreaterThan(0)
  })

  test("hook update path under repeated actions", async () => {
    const result = await benchmark(
      "useMachine update cycle x12",
      async () => {
        for (let index = 0; index < 12; index += 1) {
          const { result: view, unmount } = renderHook(() =>
            useMachine(
              Machine,
              Machine.states.Initializing({ didWorld: false }),
            ),
          )

          await act(async () => {
            await view.current.actions.world().asPromise()
          })

          unmount()
        }
      },
      {
        iterations: updateIterations,
        warmupIterations: updateWarmupIterations,
      },
    )

    expect(Number.isFinite(result.p95)).toBe(true)
    expect(result.maxMs).toBeGreaterThan(0)
  })
})
