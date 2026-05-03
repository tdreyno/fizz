import { describe, expect, test } from "@jest/globals"

import {
  cancelAsync,
  cancelAsyncLane,
  canHandleAsyncLaneTokenEvent,
  canHandleAsyncTokenEvent,
  createAsyncMachine,
  createAsyncParallelMachine,
  removeAsyncLane,
  startAsyncLane,
  transitionAsync,
  transitionAsyncLane,
} from "../runtime/asyncMachine.js"

describe("asyncMachine", () => {
  test("transitions through start, resolve, reject, and cancel branches", () => {
    const idle = createAsyncMachine("profile")

    const active = transitionAsync(idle, {
      token: 1,
      type: "start",
    })
    const resolved = transitionAsync(active, {
      token: 1,
      type: "resolve",
    })
    const rejected = transitionAsync(active, {
      token: 1,
      type: "reject",
    })
    const cancelled = transitionAsync(active, {
      token: 1,
      type: "cancel",
    })

    expect(idle).toEqual({
      asyncId: "profile",
      status: "idle",
      token: 0,
    })
    expect(active.status).toBe("active")
    expect(resolved.status).toBe("resolved")
    expect(rejected.status).toBe("rejected")
    expect(cancelled.status).toBe("cancelled")
  })

  test("ignores token events when machine is not active or token is stale", () => {
    const idle = createAsyncMachine("profile")
    const active = transitionAsync(idle, {
      token: 2,
      type: "start",
    })
    const staleResolve = transitionAsync(active, {
      token: 1,
      type: "resolve",
    })
    const staleReject = transitionAsync(active, {
      token: 1,
      type: "reject",
    })
    const staleCancel = transitionAsync(active, {
      token: 1,
      type: "cancel",
    })

    expect(transitionAsync(idle, { token: 1, type: "resolve" })).toBe(idle)
    expect(staleResolve).toBe(active)
    expect(staleReject).toBe(active)
    expect(staleCancel).toBe(active)
  })

  test("checks token handlers for single machine and lanes", () => {
    const idle = createAsyncMachine("profile")
    const active = transitionAsync(idle, {
      token: 7,
      type: "start",
    })

    expect(canHandleAsyncTokenEvent(idle, 7)).toBe(false)
    expect(canHandleAsyncTokenEvent(active, 8)).toBe(false)
    expect(canHandleAsyncTokenEvent(active, 7)).toBe(true)

    const parallel = createAsyncParallelMachine()
    expect(canHandleAsyncLaneTokenEvent(parallel, "profile", 7)).toBe(false)

    startAsyncLane(parallel, "profile", 7)

    expect(canHandleAsyncLaneTokenEvent(parallel, "profile", 8)).toBe(false)
    expect(canHandleAsyncLaneTokenEvent(parallel, "profile", 7)).toBe(true)
  })

  test("supports lane transitions, lane removal, and missing-lane transition", () => {
    const lanes = new Map<string, ReturnType<typeof createAsyncMachine>>()
    const parallel = createAsyncParallelMachine(lanes)

    expect(parallel.lanes).toBe(lanes)

    expect(
      transitionAsyncLane(parallel, "missing", {
        token: 1,
        type: "resolve",
      }),
    ).toBeUndefined()

    const started = startAsyncLane(parallel, "profile", 3)
    expect(started.status).toBe("active")

    const resolved = transitionAsyncLane(parallel, "profile", {
      token: 3,
      type: "resolve",
    })
    expect(resolved?.status).toBe("resolved")

    removeAsyncLane(parallel, "profile")
    expect(parallel.lanes.has("profile")).toBe(false)
  })

  test("cancelAsync returns cancelled false for stale token", () => {
    const active = transitionAsync(createAsyncMachine("profile"), {
      token: 4,
      type: "start",
    })

    const result = cancelAsync(active, 5, {
      cancelHandle: () => {
        throw new Error("cancelHandle should not run")
      },
    })

    expect(result).toEqual({
      cancelled: false,
      machine: active,
    })
  })

  test("cancelAsync returns cancelled true and optional result when token matches", () => {
    const active = transitionAsync(createAsyncMachine("profile"), {
      token: 9,
      type: "start",
    })
    let cancelled = false

    const withoutResult = cancelAsync(active, 9, {
      cancelHandle: () => {
        cancelled = true
      },
    })

    expect(cancelled).toBe(true)
    expect(withoutResult.cancelled).toBe(true)
    expect(withoutResult.machine.status).toBe("cancelled")
    expect(withoutResult).not.toHaveProperty("result")

    const withResult = cancelAsync(active, 9, {
      cancelHandle: () => undefined,
      onCancelled: () => "done",
    })

    expect(withResult).toEqual({
      cancelled: true,
      machine: expect.objectContaining({
        asyncId: "profile",
        status: "cancelled",
        token: 9,
      }),
      result: "done",
    })
  })

  test("cancelAsyncLane handles missing lane and successful cancellation", () => {
    const parallel = createAsyncParallelMachine()

    expect(
      cancelAsyncLane(parallel, "missing", 1, {
        cancelHandle: () => {
          throw new Error("cancelHandle should not run")
        },
      }),
    ).toEqual({
      cancelled: false,
    })

    startAsyncLane(parallel, "profile", 11)

    const cancelled = cancelAsyncLane(parallel, "profile", 11, {
      cancelHandle: () => undefined,
      onCancelled: () => "cancelled",
    })

    expect(cancelled.cancelled).toBe(true)
    expect(cancelled.machine?.status).toBe("cancelled")
    expect(cancelled.result).toBe("cancelled")
    expect(parallel.lanes.get("profile")?.status).toBe("cancelled")
  })
})
