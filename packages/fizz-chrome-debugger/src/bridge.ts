import type {
  Action,
  Runtime,
  RuntimeChromeDebuggerRegistryEntry,
  RuntimeDebugEvent,
  RuntimeMonitor,
} from "@tdreyno/fizz"
import { getRuntimeChromeDebuggerRegistry } from "@tdreyno/fizz"

import type { FizzDebuggerSerializedValue } from "./serialize.js"
import { serializeForDebugger } from "./serialize.js"

export const FIZZ_CHROME_DEBUGGER_EVENT_NAME = "fizz:chrome-debugger"
export const FIZZ_DEBUGGER_EVENT_NAME = FIZZ_CHROME_DEBUGGER_EVENT_NAME
export const DEFAULT_MAX_TIMELINE_ENTRIES = 1000
export const DEFAULT_ACTION_PULSE_DURATION_MS = 1000
export const FIZZ_CHROME_DEBUGGER_MACHINE_GRAPH_REGISTRY_KEY =
  "__FIZZ_CHROME_DEBUGGER_MACHINE_GRAPH_REGISTRY__" as const

export type FizzDebuggerMachineGraphNode = {
  id: string
  kind?: "nested-parent" | "nested-state" | "special" | "state"
  label?: string
  x?: number
  y?: number
}

export type FizzDebuggerMachineGraphTransition = {
  action: string
  from: string
  id?: string
  kind?: "normal" | "self" | "special"
  label?: string
  to: string
}

export type FizzDebuggerMachineGraph = {
  entryState?: string
  name: string
  nodes: FizzDebuggerMachineGraphNode[]
  transitions: FizzDebuggerMachineGraphTransition[]
}

export type FizzDebuggerActionPulse = {
  actionType: string
  at: number
  fromState?: string
}

export type FizzDebuggerScheduledItem = {
  delay?: number
  id: string
  kind: "async" | "frame" | "interval" | "timer"
}

export type FizzDebuggerStateSnapshot = {
  data: FizzDebuggerSerializedValue
  name: string
}

export type FizzDebuggerTimelineEntry = {
  at: number
  id: string
  payload: FizzDebuggerSerializedValue
  type: string
}

export type FizzDebuggerRuntimeSnapshot = {
  actionPulse?: FizzDebuggerActionPulse
  actionPulseDurationMs: number
  actionPulses?: FizzDebuggerActionPulse[]
  connectedAt: number
  currentState: FizzDebuggerStateSnapshot
  hasMonitor: boolean
  history: FizzDebuggerStateSnapshot[]
  label: string
  machineGraph?: FizzDebuggerMachineGraph
  runtimeId: string
  scheduled: FizzDebuggerScheduledItem[]
  timeline: FizzDebuggerTimelineEntry[]
  updatedAt: number
}

export type FizzDebuggerMessage =
  | {
      kind: "runtime-connected"
      snapshot: FizzDebuggerRuntimeSnapshot
      source: "@repo/fizz-chrome-debugger"
    }
  | {
      kind: "runtime-disconnected"
      runtimeId: string
      source: "@repo/fizz-chrome-debugger"
    }
  | {
      kind: "runtime-updated"
      snapshot: FizzDebuggerRuntimeSnapshot
      source: "@repo/fizz-chrome-debugger"
    }

export type FizzDebuggerTransport = {
  emit: (message: FizzDebuggerMessage) => void
}

export type RegisterRuntimeOptions = {
  label?: string
  runtime: Runtime<any, any>
  runtimeId?: string
}

export type CreateFizzChromeDebuggerOptions = {
  actionPulseDurationMs?: number
  maxTimelineEntries?: number
  now?: () => number
  transport?: FizzDebuggerTransport
}

export type RegisterMachineGraphOptions = {
  graph: FizzDebuggerMachineGraph
  label?: string
  runtimeId?: string
  target?: typeof globalThis
}

type FizzDebuggerMachineGraphRegistry = {
  byLabel: Map<string, FizzDebuggerMachineGraph>
  byRuntimeId: Map<string, FizzDebuggerMachineGraph>
}

type FizzDebuggerMachineGraphTarget = typeof globalThis & {
  [FIZZ_CHROME_DEBUGGER_MACHINE_GRAPH_REGISTRY_KEY]?: FizzDebuggerMachineGraphRegistry
}

export type InstallFizzChromeDebuggerOptions = {
  debuggerOptions?: CreateFizzChromeDebuggerOptions
  pollIntervalMs?: number
  target?: typeof globalThis
}

export type InstalledFizzChromeDebugger = {
  chromeDebugger: ReturnType<typeof createFizzChromeDebugger>
  uninstall: () => void
}

type RuntimeRecord = {
  actionPulse?: FizzDebuggerActionPulse
  actionPulses: FizzDebuggerActionPulse[]
  connectedAt: number
  eventCounter: number
  hasMonitor: boolean
  label: string
  runtime?: Runtime<any, any>
  runtimeId: string
  scheduled: Map<string, FizzDebuggerScheduledItem>
  stop: Array<() => void>
  timeline: FizzDebuggerTimelineEntry[]
}

const debuggerSource = "@repo/fizz-chrome-debugger" as const

const getOrCreateMachineGraphRegistry = (
  target: typeof globalThis = globalThis,
): FizzDebuggerMachineGraphRegistry => {
  const graphTarget = target as FizzDebuggerMachineGraphTarget
  const existing = graphTarget[FIZZ_CHROME_DEBUGGER_MACHINE_GRAPH_REGISTRY_KEY]

  if (existing) {
    return existing
  }

  const created: FizzDebuggerMachineGraphRegistry = {
    byLabel: new Map<string, FizzDebuggerMachineGraph>(),
    byRuntimeId: new Map<string, FizzDebuggerMachineGraph>(),
  }

  graphTarget[FIZZ_CHROME_DEBUGGER_MACHINE_GRAPH_REGISTRY_KEY] = created

  return created
}

const readMachineGraphRegistry = (
  target: typeof globalThis = globalThis,
): FizzDebuggerMachineGraphRegistry | undefined => {
  const graphTarget = target as FizzDebuggerMachineGraphTarget

  return graphTarget[FIZZ_CHROME_DEBUGGER_MACHINE_GRAPH_REGISTRY_KEY]
}

const resolveMachineGraph = (
  runtimeId: string,
  label: string,
): FizzDebuggerMachineGraph | undefined => {
  const registry = readMachineGraphRegistry()

  if (!registry) {
    return undefined
  }

  const byRuntimeId = registry.byRuntimeId.get(runtimeId)

  if (byRuntimeId !== undefined) {
    return byRuntimeId
  }

  return registry.byLabel.get(label)
}

export const registerFizzDebuggerMachineGraph = (
  options: RegisterMachineGraphOptions,
): (() => void) => {
  if (!options.label && !options.runtimeId) {
    throw new Error(
      "registerFizzDebuggerMachineGraph requires either label or runtimeId",
    )
  }

  const registry = getOrCreateMachineGraphRegistry(options.target)

  if (options.label) {
    registry.byLabel.set(options.label, options.graph)
  }

  if (options.runtimeId) {
    registry.byRuntimeId.set(options.runtimeId, options.graph)
  }

  return () => {
    const nextRegistry = readMachineGraphRegistry(options.target)

    if (!nextRegistry) {
      return
    }

    if (
      options.label &&
      nextRegistry.byLabel.get(options.label) === options.graph
    ) {
      nextRegistry.byLabel.delete(options.label)
    }

    if (
      options.runtimeId &&
      nextRegistry.byRuntimeId.get(options.runtimeId) === options.graph
    ) {
      nextRegistry.byRuntimeId.delete(options.runtimeId)
    }
  }
}

const createBrowserTransport = (): FizzDebuggerTransport => ({
  emit: message => {
    if (globalThis.window === undefined) {
      return
    }

    globalThis.window.dispatchEvent(
      new CustomEvent<FizzDebuggerMessage>(FIZZ_CHROME_DEBUGGER_EVENT_NAME, {
        detail: message,
      }),
    )
  },
})

const createStateSnapshot = (value: {
  data: unknown
  name: string
}): FizzDebuggerStateSnapshot => ({
  name: value.name,
  data: serializeForDebugger(value.data),
})

const updateScheduled = (
  scheduled: Map<string, FizzDebuggerScheduledItem>,
  event: RuntimeDebugEvent,
): void => {
  switch (event.type) {
    case "async-started": {
      scheduled.set(`async:${event.asyncId}`, {
        id: event.asyncId,
        kind: "async",
      })
      return
    }

    case "async-cancelled":
    case "async-rejected":
    case "async-resolved": {
      scheduled.delete(`async:${event.asyncId}`)
      return
    }

    case "timer-started": {
      scheduled.set(`timer:${event.timeoutId}`, {
        id: event.timeoutId,
        kind: "timer",
        delay: event.delay,
      })
      return
    }

    case "timer-cancelled":
    case "timer-completed": {
      scheduled.delete(`timer:${event.timeoutId}`)
      return
    }

    case "interval-started": {
      scheduled.set(`interval:${event.intervalId}`, {
        id: event.intervalId,
        kind: "interval",
        delay: event.delay,
      })
      return
    }

    case "interval-cancelled": {
      scheduled.delete(`interval:${event.intervalId}`)
      return
    }

    case "frame-started": {
      scheduled.set("frame:default", {
        id: "default",
        kind: "frame",
      })
      return
    }

    case "frame-cancelled": {
      scheduled.delete("frame:default")
      return
    }

    default: {
      return
    }
  }
}

export const createFizzChromeDebugger = (
  options: CreateFizzChromeDebuggerOptions = {},
) => {
  const now = options.now ?? (() => Date.now())
  const actionPulseDurationMs =
    options.actionPulseDurationMs ?? DEFAULT_ACTION_PULSE_DURATION_MS
  const maxTimelineEntries =
    options.maxTimelineEntries ?? DEFAULT_MAX_TIMELINE_ENTRIES
  const transport = options.transport ?? createBrowserTransport()
  const records = new Map<string, RuntimeRecord>()
  let runtimeCounter = 1

  const createSnapshot = (
    record: RuntimeRecord,
  ): FizzDebuggerRuntimeSnapshot => {
    const snapshotTime = now()
    const currentState = record.runtime?.currentState() ?? {
      data: undefined,
      name: "disconnected",
    }
    const machineGraph = resolveMachineGraph(record.runtimeId, record.label)
    const activeActionPulses = record.actionPulses.filter(
      pulse => snapshotTime - pulse.at <= actionPulseDurationMs,
    )

    record.actionPulses = activeActionPulses

    const actionPulse = activeActionPulses.at(-1)

    const history = record.runtime
      ? record.runtime.currentHistory().toArray().map(createStateSnapshot)
      : [createStateSnapshot(currentState)]

    return {
      ...(actionPulse === undefined ? {} : { actionPulse }),
      ...(activeActionPulses.length === 0
        ? {}
        : { actionPulses: activeActionPulses }),
      runtimeId: record.runtimeId,
      label: record.label,
      actionPulseDurationMs,
      connectedAt: record.connectedAt,
      currentState: createStateSnapshot(currentState),
      history,
      ...(machineGraph === undefined ? {} : { machineGraph }),
      scheduled: [...record.scheduled.values()],
      timeline: record.timeline,
      updatedAt: snapshotTime,
      hasMonitor: record.hasMonitor,
    }
  }

  const emitSnapshot = (
    kind: "runtime-connected" | "runtime-updated",
    record: RuntimeRecord,
  ) => {
    transport.emit({
      kind,
      snapshot: createSnapshot(record),
      source: debuggerSource,
    })
  }

  const getRecord = (runtimeId: string): RuntimeRecord => {
    const existing = records.get(runtimeId)

    if (existing) {
      return existing
    }

    const created: RuntimeRecord = {
      runtimeId,
      label: runtimeId,
      actionPulses: [],
      connectedAt: now(),
      eventCounter: 0,
      hasMonitor: false,
      scheduled: new Map<string, FizzDebuggerScheduledItem>(),
      stop: [],
      timeline: [],
    }

    records.set(runtimeId, created)

    return created
  }

  const appendTimeline = (
    record: RuntimeRecord,
    type: string,
    payload: unknown,
  ) => {
    const nextEntry: FizzDebuggerTimelineEntry = {
      id: `${record.runtimeId}:${++record.eventCounter}`,
      at: now(),
      type,
      payload: serializeForDebugger(payload),
    }

    record.timeline = [...record.timeline, nextEntry].slice(-maxTimelineEntries)
  }

  const toTimelinePayload = (
    record: RuntimeRecord,
    event: RuntimeDebugEvent,
  ): unknown => {
    switch (event.type) {
      case "action-enqueued": {
        return {
          action: event.action,
          currentState:
            record.runtime === undefined
              ? undefined
              : serializeForDebugger(record.runtime.currentState()),
          queueSize: event.queueSize,
          type: event.type,
        }
      }

      case "context-changed": {
        return {
          currentState: serializeForDebugger(event.currentState),
          previousState:
            event.previousState === undefined
              ? undefined
              : serializeForDebugger(event.previousState),
          type: event.type,
        }
      }

      default: {
        return event
      }
    }
  }

  const createMonitor = (runtimeId: string): RuntimeMonitor => {
    const record = getRecord(runtimeId)

    record.hasMonitor = true

    return event => {
      updateScheduled(record.scheduled, event)

      if (event.type === "action-enqueued") {
        const currentStateName = record.runtime?.currentState()?.name

        record.actionPulse = {
          actionType: event.action.type,
          at: now(),
          ...(currentStateName === undefined
            ? {}
            : { fromState: currentStateName }),
        }
        record.actionPulses = [...record.actionPulses, record.actionPulse]
      }

      appendTimeline(record, event.type, toTimelinePayload(record, event))

      if (event.type === "output-emitted") {
        emitSnapshot("runtime-updated", record)
        return
      }

      if (event.type === "context-changed") {
        emitSnapshot("runtime-updated", record)
        return
      }

      emitSnapshot("runtime-updated", record)
    }
  }

  const disconnectRuntime = (runtimeId: string) => {
    const record = records.get(runtimeId)

    if (!record) {
      return
    }

    record.stop.forEach(stop => {
      stop()
    })

    records.delete(runtimeId)
    transport.emit({
      kind: "runtime-disconnected",
      runtimeId,
      source: debuggerSource,
    })
  }

  const refreshRuntime = (runtimeId: string) => {
    const record = records.get(runtimeId)

    if (!record) {
      return false
    }

    emitSnapshot("runtime-updated", record)

    return true
  }

  const registerRuntime = ({
    label,
    runtime,
    runtimeId = `runtime-${runtimeCounter++}`,
  }: RegisterRuntimeOptions) => {
    const record = getRecord(runtimeId)
    const isSameRuntime = record.runtime === runtime && record.stop.length > 0

    if (isSameRuntime) {
      record.label = label ?? record.label

      return () => disconnectRuntime(runtimeId)
    }

    const isFirstConnection = record.runtime === undefined

    record.stop.forEach(stop => {
      stop()
    })

    record.runtime = runtime
    record.label = label ?? record.label
    record.connectedAt = now()

    record.stop = [
      runtime.onContextChange(() => {
        if (!record.hasMonitor) {
          appendTimeline(record, "context-changed", {
            currentState: runtime.currentState(),
            history: runtime.currentHistory().toArray(),
          })
        }

        emitSnapshot("runtime-updated", record)
      }),
      runtime.onOutput(output => {
        appendTimeline(record, "output-emitted", output)
        emitSnapshot("runtime-updated", record)
      }),
    ]

    emitSnapshot(
      isFirstConnection ? "runtime-connected" : "runtime-updated",
      record,
    )

    return () => disconnectRuntime(runtimeId)
  }

  const replay = async (
    runtimeId: string,
    actions: Array<Action<string, unknown>>,
  ) => {
    const record = records.get(runtimeId)

    if (!record?.runtime) {
      throw new Error(`Runtime ${runtimeId} is not registered`)
    }

    appendTimeline(record, "replay-started", {
      count: actions.length,
    })
    emitSnapshot("runtime-updated", record)

    await actions.reduce<Promise<void>>(async (promise, nextAction) => {
      await promise
      await record.runtime?.run(nextAction)
    }, Promise.resolve())

    appendTimeline(record, "replay-completed", {
      count: actions.length,
    })
    emitSnapshot("runtime-updated", record)
  }

  const snapshot = (runtimeId: string) => {
    const record = records.get(runtimeId)

    return record ? createSnapshot(record) : undefined
  }

  const nextRuntimeId = (label = "runtime") => {
    const normalizedLabel = label
      .trim()
      .toLowerCase()
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-|-$/g, "")

    return `${normalizedLabel || "runtime"}-${runtimeCounter++}`
  }

  return {
    createMonitor,
    disconnectRuntime,
    nextRuntimeId,
    refreshRuntime,
    registerRuntime,
    replay,
    snapshot,
  }
}

export const installFizzChromeDebugger = (
  options: InstallFizzChromeDebuggerOptions = {},
): InstalledFizzChromeDebugger => {
  const readRuntimeChromeDebuggerRegistry =
    getRuntimeChromeDebuggerRegistry as unknown as (
      target?: typeof globalThis,
    ) =>
      | {
          runtimes: Map<string, RuntimeChromeDebuggerRegistryEntry>
        }
      | undefined
  const chromeDebugger = createFizzChromeDebugger(options.debuggerOptions)
  const cleanupByRuntimeId = new Map<string, () => void>()
  const hasMachineGraphByRuntimeId = new Map<string, boolean>()
  const hookTarget = options.target ?? globalThis
  const pollIntervalMs = options.pollIntervalMs ?? 250

  const attachRuntime = (
    registration: RegisterRuntimeOptions,
  ): (() => void) => {
    const runtimeId =
      registration.runtimeId ??
      chromeDebugger.nextRuntimeId(
        registration.label ?? registration.runtime.currentState().name,
      )
    const existingCleanup = cleanupByRuntimeId.get(runtimeId)

    chromeDebugger.registerRuntime({
      ...registration,
      runtimeId,
    })

    if (existingCleanup) {
      return existingCleanup
    }

    const stopMonitor = registration.runtime.addMonitor(
      chromeDebugger.createMonitor(runtimeId),
    )

    let cleanedUp = false

    const cleanup = () => {
      if (cleanedUp) {
        return
      }

      cleanedUp = true
      cleanupByRuntimeId.delete(runtimeId)
      hasMachineGraphByRuntimeId.delete(runtimeId)
      stopMonitor()
      stopRuntime()
      stopDisconnect()
    }

    const stopRuntime = chromeDebugger.registerRuntime({
      ...registration,
      runtimeId,
    })
    const stopDisconnect = registration.runtime.onDisconnect(cleanup)

    cleanupByRuntimeId.set(runtimeId, cleanup)

    return cleanup
  }

  const syncRegistryRuntimes = () => {
    const registry = readRuntimeChromeDebuggerRegistry(hookTarget)
    const nextRegistryRuntimeIds = new Set<string>()
    const entries = registry ? [...registry.runtimes.values()] : []

    entries.forEach(entry => {
      const wasAttached = cleanupByRuntimeId.has(entry.runtimeId)
      const hadMachineGraph = hasMachineGraphByRuntimeId.get(entry.runtimeId)

      nextRegistryRuntimeIds.add(entry.runtimeId)
      attachRuntime({
        ...(entry.label === undefined ? {} : { label: entry.label }),
        runtime: entry.runtime,
        runtimeId: entry.runtimeId,
      })

      const hasMachineGraph =
        chromeDebugger.snapshot(entry.runtimeId)?.machineGraph !== undefined

      if (wasAttached && hadMachineGraph === false && hasMachineGraph) {
        chromeDebugger.refreshRuntime(entry.runtimeId)
      }

      hasMachineGraphByRuntimeId.set(entry.runtimeId, hasMachineGraph)
    })
    ;[...cleanupByRuntimeId.keys()]
      .filter(runtimeId => !nextRegistryRuntimeIds.has(runtimeId))
      .forEach(runtimeId => {
        hasMachineGraphByRuntimeId.delete(runtimeId)
        cleanupByRuntimeId.get(runtimeId)?.()
      })
  }

  syncRegistryRuntimes()

  const pollHandle = globalThis.setInterval(
    syncRegistryRuntimes,
    pollIntervalMs,
  )

  return {
    chromeDebugger,
    uninstall: () => {
      globalThis.clearInterval(pollHandle)
      ;[...cleanupByRuntimeId.values()].forEach(cleanup => {
        cleanup()
      })
    },
  }
}

export const createFizzDebuggerBridge = createFizzChromeDebugger
