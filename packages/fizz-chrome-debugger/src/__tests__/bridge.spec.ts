import { describe, expect, test } from "@jest/globals"
import {
  action,
  createControlledTimerDriver,
  createMachine,
  createRuntime,
  enter,
  FIZZ_CHROME_DEBUGGER_REGISTRY_KEY,
  output,
  state,
} from "@tdreyno/fizz"

import type {
  FizzDebuggerMachineGraph,
  FizzDebuggerMessage,
  FizzDebuggerTimelineEntry,
} from "../index.js"
import {
  createFizzChromeDebugger,
  installFizzChromeDebugger,
  registerFizzDebuggerMachineGraph,
  serializeForDebugger,
} from "../index.js"

const registryKey = FIZZ_CHROME_DEBUGGER_REGISTRY_KEY as string

describe("fizz chrome debugger", () => {
  test("serializes circular values, errors, and functions safely", () => {
    const circular: { self?: unknown } = {}
    circular.self = circular

    const value = serializeForDebugger({
      circular,
      error: new Error("boom"),
      fn: function sample() {
        return "ok"
      },
      missing: undefined,
      symbol: Symbol("machine"),
    })

    expect(value).toEqual({
      circular: {
        self: "[Circular]",
      },
      error: expect.objectContaining({
        message: "boom",
        name: "Error",
      }),
      fn: "[Function sample]",
      missing: "[Undefined]",
      symbol: "Symbol(machine)",
    })
  })

  test("registers runtimes, records timeline updates, and tracks scheduled work", async () => {
    const trigger = action("Trigger")
    const notice = action("Notice").withPayload<string>()

    type Trigger = ReturnType<typeof trigger>

    const Ready = state<Trigger, { count: number }, "toast">(
      {
        Trigger: (data, _, { startTimer, update }) => [
          update({
            count: data.count + 1,
          }),
          output(notice("updated")),
          startTimer("toast", 25),
        ],
        TimerCompleted: (data, _, { update }) =>
          update({
            count: data.count + 10,
          }),
      },
      { name: "Ready" },
    )

    const messages: FizzDebuggerMessage[] = []
    const chromeDebugger = createFizzChromeDebugger({
      now: (() => {
        let counter = 100

        return () => counter++
      })(),
      transport: {
        emit: message => {
          messages.push(message)
        },
      },
    })
    const runtimeId = chromeDebugger.nextRuntimeId("Timeout Demo")
    const machine = createMachine({
      actions: { trigger },
      outputActions: { notice },
      states: { Ready },
    })
    const timerDriver = createControlledTimerDriver()
    const runtime = createRuntime(machine, Ready({ count: 0 }), {
      monitor: chromeDebugger.createMonitor(runtimeId),
      timerDriver,
    })

    const stop = chromeDebugger.registerRuntime({
      label: "Timeout Demo",
      runtime,
      runtimeId,
    })

    await runtime.run(trigger())

    const snapshotAfterTrigger = chromeDebugger.snapshot(runtimeId)

    expect(snapshotAfterTrigger).toMatchObject({
      currentState: {
        data: {
          count: 1,
        },
        name: "Ready",
      },
      hasMonitor: true,
      label: "Timeout Demo",
      runtimeId,
      scheduled: [
        {
          delay: 25,
          id: "toast",
          kind: "timer",
        },
      ],
    })

    expect(snapshotAfterTrigger?.timeline.map(entry => entry.type)).toEqual(
      expect.arrayContaining([
        "action-enqueued",
        "command-started",
        "command-completed",
        "output-emitted",
        "timer-started",
      ]),
    )

    const latestActionEnqueued = snapshotAfterTrigger?.timeline.reduce<
      FizzDebuggerTimelineEntry | undefined
    >(
      (latest, entry) => (entry.type === "action-enqueued" ? entry : latest),
      undefined,
    )

    expect(latestActionEnqueued).toMatchObject({
      payload: {
        action: {
          type: "Trigger",
        },
        currentState: {
          name: "Ready",
        },
        type: "action-enqueued",
      },
      type: "action-enqueued",
    })

    const latestContextChanged = snapshotAfterTrigger?.timeline.reduce<
      FizzDebuggerTimelineEntry | undefined
    >(
      (latest, entry) => (entry.type === "context-changed" ? entry : latest),
      undefined,
    )

    expect(latestContextChanged).toMatchObject({
      payload: {
        currentState: {
          name: "Ready",
        },
        previousState: {
          name: "Ready",
        },
        type: "context-changed",
      },
      type: "context-changed",
    })

    await timerDriver.advanceBy(25)

    const snapshotAfterTimer = chromeDebugger.snapshot(runtimeId)

    expect(snapshotAfterTimer).toMatchObject({
      currentState: {
        data: {
          count: 11,
        },
      },
      scheduled: [],
    })

    expect(messages[0]).toMatchObject({
      kind: "runtime-connected",
      snapshot: {
        runtimeId,
      },
    })

    stop()

    expect(messages.at(-1)).toEqual({
      kind: "runtime-disconnected",
      runtimeId,
      source: "@repo/fizz-chrome-debugger",
    })
  })

  test("includes registered machine graph metadata in runtime snapshots", async () => {
    const trigger = action("Trigger")
    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )
    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "GraphMachine",
    )
    const graph: FizzDebuggerMachineGraph = {
      entryState: "Ready",
      name: "GraphMachine",
      nodes: [{ id: "Ready" }],
      transitions: [
        {
          action: "Trigger",
          from: "Ready",
          to: "Ready",
        },
      ],
    }
    const unregisterGraph = registerFizzDebuggerMachineGraph({
      graph,
      label: "GraphMachine",
    })
    const chromeDebugger = createFizzChromeDebugger()
    const runtimeId = chromeDebugger.nextRuntimeId("GraphMachine")
    const runtime = createRuntime(machine, Ready({ count: 0 }), {
      monitor: chromeDebugger.createMonitor(runtimeId),
    })
    const stop = chromeDebugger.registerRuntime({
      label: "GraphMachine",
      runtime,
      runtimeId,
    })

    const initialSnapshot = chromeDebugger.snapshot(runtimeId)

    expect(initialSnapshot?.machineGraph).toEqual(graph)

    await runtime.run(trigger())

    const updatedSnapshot = chromeDebugger.snapshot(runtimeId)

    expect(updatedSnapshot?.machineGraph).toEqual(graph)

    stop()
    unregisterGraph()
  })

  test("tracks short-lived action pulses in snapshots", async () => {
    let nowValue = 100
    const trigger = action("Trigger")
    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )
    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "PulseMachine",
    )
    const chromeDebugger = createFizzChromeDebugger({
      actionPulseDurationMs: 300,
      now: () => nowValue,
    })
    const runtimeId = chromeDebugger.nextRuntimeId("PulseMachine")
    const runtime = createRuntime(machine, Ready({ count: 0 }), {
      monitor: chromeDebugger.createMonitor(runtimeId),
    })
    const stop = chromeDebugger.registerRuntime({
      label: "PulseMachine",
      runtime,
      runtimeId,
    })

    await runtime.run(trigger())

    const activePulseSnapshot = chromeDebugger.snapshot(runtimeId)

    expect(activePulseSnapshot?.actionPulseDurationMs).toBe(300)
    expect(activePulseSnapshot?.actionPulse).toEqual({
      actionType: "Trigger",
      at: 100,
      fromState: "Ready",
    })
    expect(activePulseSnapshot?.actionPulses).toEqual([
      {
        actionType: "Trigger",
        at: 100,
        fromState: "Ready",
      },
    ])

    nowValue = 220
    await runtime.run(trigger())

    const overlapSnapshot = chromeDebugger.snapshot(runtimeId)

    expect(overlapSnapshot?.actionPulses).toEqual([
      {
        actionType: "Trigger",
        at: 100,
        fromState: "Ready",
      },
      {
        actionType: "Trigger",
        at: 220,
        fromState: "Ready",
      },
    ])
    expect(overlapSnapshot?.actionPulse).toEqual({
      actionType: "Trigger",
      at: 220,
      fromState: "Ready",
    })

    nowValue = 450

    const partialPulseSnapshot = chromeDebugger.snapshot(runtimeId)

    expect(partialPulseSnapshot?.actionPulses).toEqual([
      {
        actionType: "Trigger",
        at: 220,
        fromState: "Ready",
      },
    ])

    nowValue = 560

    const expiredPulseSnapshot = chromeDebugger.snapshot(runtimeId)

    expect(expiredPulseSnapshot?.actionPulse).toBeUndefined()
    expect(expiredPulseSnapshot?.actionPulses).toBeUndefined()

    stop()
  })

  test("registers machine graph metadata on custom global target", async () => {
    const trigger = action("Trigger")
    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )
    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "TargetedGraphMachine",
    )
    const graph: FizzDebuggerMachineGraph = {
      entryState: "Ready",
      name: "TargetedGraphMachine",
      nodes: [{ id: "Ready" }],
      transitions: [
        {
          action: "Trigger",
          from: "Ready",
          to: "Ready",
        },
      ],
    }
    const customTarget = {} as typeof globalThis
    const unregisterGraph = registerFizzDebuggerMachineGraph({
      graph,
      label: "TargetedGraphMachine",
      target: customTarget,
    })
    const chromeDebugger = createFizzChromeDebugger()
    const runtimeId = chromeDebugger.nextRuntimeId("TargetedGraphMachine")
    const runtime = createRuntime(machine, Ready({ count: 0 }), {
      monitor: chromeDebugger.createMonitor(runtimeId),
    })
    const stop = chromeDebugger.registerRuntime({
      label: "TargetedGraphMachine",
      runtime,
      runtimeId,
    })

    expect(chromeDebugger.snapshot(runtimeId)?.machineGraph).toBeUndefined()

    const unregisterGlobalGraph = registerFizzDebuggerMachineGraph({
      graph,
      label: "TargetedGraphMachine",
    })

    expect(chromeDebugger.snapshot(runtimeId)?.machineGraph).toEqual(graph)

    stop()
    unregisterGraph()
    unregisterGlobalGraph()
  })

  test("installs registry polling that auto-registers createRuntime runtimes", async () => {
    const trigger = action("Trigger")
    const messages: FizzDebuggerMessage[] = []

    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )

    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "AutoMachine",
    )

    const hookTarget = globalThis as typeof globalThis & Record<string, unknown>

    delete hookTarget[registryKey]

    const runtime = createRuntime(machine, Ready({ count: 0 }))

    const { chromeDebugger, uninstall } = installFizzChromeDebugger({
      debuggerOptions: {
        now: (() => {
          let counter = 500

          return () => counter++
        })(),
        transport: {
          emit: message => {
            messages.push(message)
          },
        },
      },
      pollIntervalMs: 25,
      target: hookTarget,
    })

    await runtime.run(enter())
    await runtime.run(trigger())

    const connected = messages.find(
      message => message.kind === "runtime-connected",
    )

    expect(connected).toMatchObject({
      kind: "runtime-connected",
      snapshot: {
        label: "AutoMachine",
      },
    })

    const runtimeId =
      connected?.kind === "runtime-connected"
        ? connected.snapshot.runtimeId
        : undefined

    expect(runtimeId).toBeDefined()
    expect(
      runtimeId ? chromeDebugger.snapshot(runtimeId) : undefined,
    ).toMatchObject({
      currentState: {
        data: {
          count: 1,
        },
      },
      hasMonitor: true,
      label: "AutoMachine",
    })

    runtime.disconnect()
    uninstall()
  })

  test("does not duplicate runtime subscriptions across poll cycles", async () => {
    const trigger = action("Trigger")
    const messages: FizzDebuggerMessage[] = []

    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )

    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "PollingMachine",
    )
    const hookTarget = globalThis as typeof globalThis & Record<string, unknown>

    delete hookTarget[registryKey]

    const runtime = createRuntime(machine, Ready({ count: 0 }))
    const { chromeDebugger, uninstall } = installFizzChromeDebugger({
      debuggerOptions: {
        transport: {
          emit: message => {
            messages.push(message)
          },
        },
      },
      pollIntervalMs: 25,
      target: hookTarget,
    })

    await new Promise(resolve => {
      globalThis.setTimeout(resolve, 125)
    })

    const connected = messages.find(
      message => message.kind === "runtime-connected",
    )
    const runtimeId =
      connected?.kind === "runtime-connected"
        ? connected.snapshot.runtimeId
        : undefined

    expect(runtimeId).toBeDefined()

    await runtime.run(trigger())

    const snapshot = runtimeId ? chromeDebugger.snapshot(runtimeId) : undefined
    const actionEnqueuedEvents =
      snapshot?.timeline.filter(entry => entry.type === "action-enqueued") ?? []

    expect(actionEnqueuedEvents).toHaveLength(1)

    runtime.disconnect()
    uninstall()
  })

  test("disconnects installed runtimes when the bridge is uninstalled", async () => {
    const messages: FizzDebuggerMessage[] = []
    const Ready = state<ReturnType<typeof enter>, { count: number }>(
      {
        Enter: (data, _, { update }) => update(data),
      },
      { name: "Ready" },
    )
    const machine = createMachine(
      {
        states: { Ready },
      },
      "UnloadMachine",
    )
    const hookTarget = globalThis as typeof globalThis & Record<string, unknown>

    delete hookTarget[registryKey]

    createRuntime(machine, Ready({ count: 0 }))

    const { uninstall } = installFizzChromeDebugger({
      debuggerOptions: {
        transport: {
          emit: message => {
            messages.push(message)
          },
        },
      },
      pollIntervalMs: 25,
      target: hookTarget,
    })

    await new Promise(resolve => {
      globalThis.setTimeout(resolve, 75)
    })

    uninstall()

    expect(messages.some(message => message.kind === "runtime-connected")).toBe(
      true,
    )
    expect(
      messages.some(message => message.kind === "runtime-disconnected"),
    ).toBe(true)
  })

  test("rediscovers runtimes after the registry is recreated", async () => {
    const trigger = action("Trigger")
    const messages: FizzDebuggerMessage[] = []

    const Ready = state<ReturnType<typeof trigger>, { count: number }>(
      {
        Trigger: (data, _, { update }) =>
          update({
            count: data.count + 1,
          }),
      },
      { name: "Ready" },
    )

    const machine = createMachine(
      {
        actions: { trigger },
        states: { Ready },
      },
      "ReconnectMachine",
    )
    const hookTarget = globalThis as typeof globalThis & Record<string, unknown>

    delete hookTarget[registryKey]

    const firstRuntime = createRuntime(machine, Ready({ count: 0 }))
    const { uninstall } = installFizzChromeDebugger({
      debuggerOptions: {
        transport: {
          emit: message => {
            messages.push(message)
          },
        },
      },
      pollIntervalMs: 25,
      target: hookTarget,
    })

    await new Promise(resolve => {
      globalThis.setTimeout(resolve, 75)
    })

    uninstall()
    firstRuntime.disconnect()
    delete hookTarget[registryKey]

    const secondRuntime = createRuntime(machine, Ready({ count: 0 }))
    const reinstalled = installFizzChromeDebugger({
      debuggerOptions: {
        transport: {
          emit: message => {
            messages.push(message)
          },
        },
      },
      pollIntervalMs: 25,
      target: hookTarget,
    })

    await secondRuntime.run(trigger())
    await new Promise(resolve => {
      globalThis.setTimeout(resolve, 75)
    })

    const connectedMessages = messages.filter(
      message => message.kind === "runtime-connected",
    )
    const reconnectUpdates = messages.filter(
      message =>
        message.kind === "runtime-updated" &&
        message.snapshot.label === "ReconnectMachine",
    )

    expect(connectedMessages).toHaveLength(2)
    expect(connectedMessages.at(-1)).toMatchObject({
      kind: "runtime-connected",
      snapshot: {
        currentState: {
          data: {
            count: 0,
          },
        },
        label: "ReconnectMachine",
      },
    })
    expect(reconnectUpdates.at(-1)).toMatchObject({
      kind: "runtime-updated",
      snapshot: {
        currentState: {
          data: {
            count: 1,
          },
        },
        label: "ReconnectMachine",
      },
    })

    secondRuntime.disconnect()
    reinstalled.uninstall()
  })
})
