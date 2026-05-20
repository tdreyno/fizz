import type { Context } from "../context.js"
import type {
  RuntimeAction,
  RuntimeDebugEvent,
  RuntimeState,
} from "../runtime/runtimeContracts.js"
import {
  RuntimeDisconnectedError,
  WaitUntilAbortError,
  WaitUntilTimeoutError,
} from "./errors.js"
import type { Matcher } from "./matcher.js"

export type WaitUntilOptions = {
  signal?: AbortSignal
  timeout?: number
  includeCurrent?: boolean
}

export type WaitUntilHost = {
  currentState: () => RuntimeState | undefined
  onContextChange: (fn: (context: Context) => void) => () => void
  onOutput: (fn: (output: RuntimeAction) => void | Promise<void>) => () => void
  onDisconnect: (fn: () => void) => () => void
  emitMonitor: (event: RuntimeDebugEvent) => void
}

type Settler<T> = {
  resolve: (value: T) => void
  reject: (error: Error) => void
}

let nextWaitUntilId = 0

const createWaitUntilId = (): string => {
  nextWaitUntilId += 1
  return `wait-until-${nextWaitUntilId}`
}

export const waitUntil = <T>(
  host: WaitUntilHost,
  matcher: Matcher<T>,
  options: WaitUntilOptions = {},
): Promise<T> => {
  const id = createWaitUntilId()
  const startedAt = Date.now()
  const includeCurrent = options.includeCurrent ?? true

  host.emitMonitor({
    channels: [...matcher.channels],
    hasAbortSignal: options.signal !== undefined,
    hasTimeout: typeof options.timeout === "number",
    type: "wait-until-registered",
    waitUntilId: id,
  })

  return new Promise<T>((resolve, reject) => {
    let settled = false
    const teardowns: Array<() => void> = []

    const teardown = () => {
      settled = true
      teardowns.forEach(off => {
        try {
          off()
        } catch {
          // ignore teardown errors
        }
      })
      teardowns.length = 0
    }

    const settler: Settler<T> = {
      resolve: value => {
        if (settled) return
        teardown()
        host.emitMonitor({
          channel: lastChannel,
          durationMs: Date.now() - startedAt,
          type: "wait-until-resolved",
          waitUntilId: id,
        })
        resolve(value)
      },
      reject: error => {
        if (settled) return
        teardown()
        host.emitMonitor({
          durationMs: Date.now() - startedAt,
          reason: classifyReason(error),
          type: "wait-until-rejected",
          waitUntilId: id,
        })
        reject(error)
      },
    }

    let lastChannel: "state" | "output" = matcher.channels[0] ?? "state"

    if (matcher.channels.includes("state")) {
      teardowns.push(
        host.onContextChange(context => {
          const state = context.currentState as RuntimeState | undefined
          const result = matcher.evalState(state)

          if (result !== undefined) {
            lastChannel = "state"
            settler.resolve(result)
          }
        }),
      )
    }

    if (matcher.channels.includes("output")) {
      teardowns.push(
        host.onOutput(output => {
          const result = matcher.evalOutput(output)

          if (result !== undefined) {
            lastChannel = "output"
            settler.resolve(result)
          }
        }),
      )
    }

    teardowns.push(
      host.onDisconnect(() => {
        settler.reject(new RuntimeDisconnectedError())
      }),
    )

    if (options.signal) {
      const signal = options.signal

      if (signal.aborted) {
        queueMicrotask(() =>
          settler.reject(new WaitUntilAbortError(reasonMessage(signal.reason))),
        )
        return
      }

      const onAbort = () => {
        settler.reject(new WaitUntilAbortError(reasonMessage(signal.reason)))
      }
      signal.addEventListener("abort", onAbort, { once: true })
      teardowns.push(() => signal.removeEventListener("abort", onAbort))
    }

    if (typeof options.timeout === "number") {
      const timeoutMs = options.timeout
      const timerId = setTimeout(() => {
        settler.reject(new WaitUntilTimeoutError(timeoutMs))
      }, timeoutMs)
      teardowns.push(() => clearTimeout(timerId))
    }

    if (includeCurrent && matcher.channels.includes("state")) {
      const result = matcher.evalState(host.currentState())

      if (result !== undefined) {
        queueMicrotask(() => {
          lastChannel = "state"
          settler.resolve(result)
        })
      }
    }
  })
}

const reasonMessage = (reason: unknown): string | undefined => {
  if (reason === undefined || reason === null) return undefined
  if (reason instanceof Error) return reason.message
  if (typeof reason === "string") return reason
  return undefined
}

const classifyReason = (
  error: unknown,
): "abort" | "timeout" | "disconnect" | "other" => {
  if (error instanceof WaitUntilAbortError) return "abort"
  if (error instanceof WaitUntilTimeoutError) return "timeout"
  if (error instanceof RuntimeDisconnectedError) return "disconnect"
  return "other"
}
