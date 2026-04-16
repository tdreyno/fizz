import type {
  RuntimeDebugCommand,
  RuntimeDebugEvent,
  RuntimeMonitor,
} from "./runtime.js"

export type RuntimeDebugConsoleLevel = "error" | "log" | "warn"

export type RuntimeDebugConsoleEntry = {
  args: readonly unknown[]
  level: RuntimeDebugConsoleLevel
}

export type RuntimeDebugConsole = Pick<Console, RuntimeDebugConsoleLevel>

export type RuntimeDebugConsoleOptions = {
  console?: RuntimeDebugConsole
  prefix?: string
}

type RuntimeDebugEventByType<T extends RuntimeDebugEvent["type"]> = Extract<
  RuntimeDebugEvent,
  { type: T }
>

const defaultPrefix = "[Fizz]"

const withPrefix = (prefix: string, message: string): string =>
  `${prefix} ${message}`

const commandLabel = (command: RuntimeDebugCommand): string => {
  if (command.kind === "action") {
    return `action ${command.action.type}`
  }

  if (command.kind === "state") {
    return `state ${command.state.name}`
  }

  return `effect ${command.effect.label}`
}

const toSerializableValue = (
  value: unknown,
  seen: WeakSet<object>,
): unknown => {
  if (value instanceof Error) {
    return {
      ...Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          toSerializableValue(entry, seen),
        ]),
      ),
      message: value.message,
      name: value.name,
      stack: value.stack,
    }
  }

  if (typeof value !== "object" || value === null) {
    return value
  }

  if (seen.has(value)) {
    return "[Circular]"
  }

  seen.add(value)

  if (Array.isArray(value)) {
    return value.map(entry => toSerializableValue(entry, seen))
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      toSerializableValue(entry, seen),
    ]),
  )
}

const toDefaultConsoleArg = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) {
    return value
  }

  return JSON.stringify(toSerializableValue(value, new WeakSet()), null, 2)
}

const toLoggedState = (
  state: RuntimeDebugEventByType<"context-changed">["currentState"] | undefined,
): { data: unknown; name: string } | undefined =>
  state === undefined
    ? undefined
    : {
        data: state.data,
        name: state.name,
      }

const eventFormatters = {
  "action-enqueued": (
    event: RuntimeDebugEventByType<"action-enqueued">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Enqueue action ${event.action.type}`),
      {
        payload: event.action.payload,
        queueSize: event.queueSize,
      },
    ],
    level: "log",
  }),
  "async-cancelled": (
    event: RuntimeDebugEventByType<"async-cancelled">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Async cancelled ${event.asyncId}`),
      { reason: event.reason },
    ],
    level: "log",
  }),
  "async-rejected": (
    event: RuntimeDebugEventByType<"async-rejected">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [withPrefix(prefix, `Async rejected ${event.asyncId}`), event.error],
    level: "error",
  }),
  "async-resolved": (
    event: RuntimeDebugEventByType<"async-resolved">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [withPrefix(prefix, `Async resolved ${event.asyncId}`), event.value],
    level: "log",
  }),
  "async-started": (
    event: RuntimeDebugEventByType<"async-started">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [withPrefix(prefix, `Async started ${event.asyncId}`)],
    level: "log",
  }),
  "command-completed": (
    event: RuntimeDebugEventByType<"command-completed">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Complete ${commandLabel(event.command)}`),
      {
        generatedCommands: event.generatedCommands.map(commandLabel),
      },
    ],
    level: "log",
  }),
  "command-started": (
    event: RuntimeDebugEventByType<"command-started">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Start ${commandLabel(event.command)}`),
      {
        queueSize: event.queueSize,
      },
    ],
    level: "log",
  }),
  "context-changed": (
    event: RuntimeDebugEventByType<"context-changed">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(
        prefix,
        `Context ${event.previousState?.name ?? "none"} -> ${event.currentState.name}`,
      ),
      {
        currentState: toLoggedState(event.currentState),
        previousState: toLoggedState(event.previousState),
      },
    ],
    level: "log",
  }),
  "frame-cancelled": (
    event: RuntimeDebugEventByType<"frame-cancelled">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [withPrefix(prefix, "Frame cancelled"), { reason: event.reason }],
    level: "log",
  }),
  "frame-started": (
    _event: RuntimeDebugEventByType<"frame-started">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [withPrefix(prefix, "Frame started")],
    level: "log",
  }),
  "frame-triggered": (
    event: RuntimeDebugEventByType<"frame-triggered">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, "Frame triggered"),
      { timestamp: event.timestamp },
    ],
    level: "log",
  }),
  "interval-cancelled": (
    event: RuntimeDebugEventByType<"interval-cancelled">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Interval cancelled ${event.intervalId}`),
      { delay: event.delay, reason: event.reason },
    ],
    level: "log",
  }),
  "interval-started": (
    event: RuntimeDebugEventByType<"interval-started">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Interval started ${event.intervalId}`),
      { delay: event.delay },
    ],
    level: "log",
  }),
  "interval-triggered": (
    event: RuntimeDebugEventByType<"interval-triggered">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Interval triggered ${event.intervalId}`),
      { delay: event.delay },
    ],
    level: "log",
  }),
  "output-emitted": (
    event: RuntimeDebugEventByType<"output-emitted">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [withPrefix(prefix, `Output ${event.output.type}`), event.output],
    level: "log",
  }),
  "runtime-error": (
    event: RuntimeDebugEventByType<"runtime-error">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Runtime error in ${commandLabel(event.command)}`),
      event.error,
    ],
    level: "error",
  }),
  "timer-cancelled": (event, prefix: string): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Timer cancelled ${event.timeoutId}`),
      { delay: event.delay, reason: event.reason },
    ],
    level: "log",
  }),
  "timer-completed": (
    event: RuntimeDebugEventByType<"timer-completed">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Timer completed ${event.timeoutId}`),
      { delay: event.delay },
    ],
    level: "log",
  }),
  "timer-started": (
    event: RuntimeDebugEventByType<"timer-started">,
    prefix: string,
  ): RuntimeDebugConsoleEntry => ({
    args: [
      withPrefix(prefix, `Timer started ${event.timeoutId}`),
      { delay: event.delay },
    ],
    level: "log",
  }),
} satisfies {
  [T in RuntimeDebugEvent["type"]]: (
    event: RuntimeDebugEventByType<T>,
    prefix: string,
  ) => RuntimeDebugConsoleEntry
}

export const formatRuntimeDebugEvent = (
  event: RuntimeDebugEvent,
  options: Pick<RuntimeDebugConsoleOptions, "prefix"> = {},
): RuntimeDebugConsoleEntry => {
  const prefix = options.prefix ?? defaultPrefix

  return eventFormatters[event.type](event as never, prefix)
}

export const createRuntimeConsoleMonitor = (
  options: RuntimeDebugConsoleOptions = {},
): RuntimeMonitor => {
  const runtimeConsole = options.console ?? console
  const useDefaultConsole = options.console === undefined

  return event => {
    const entry = formatRuntimeDebugEvent(event, options)

    if (useDefaultConsole) {
      runtimeConsole[entry.level](
        ...entry.args.map(arg => toDefaultConsoleArg(arg)),
      )

      return
    }

    runtimeConsole[entry.level](...entry.args)
  }
}
