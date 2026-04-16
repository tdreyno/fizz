import type { Action } from "../action.js"
import type { Context } from "../context.js"
import type { Effect } from "../effect.js"
import type { StateTransition } from "../state.js"

export type RuntimeAction = Action<string, unknown>

export type RuntimeState = StateTransition<
  string,
  Action<string, unknown>,
  unknown
>

export type RuntimeDebugCommand =
  | {
      kind: "action"
      action: RuntimeAction
    }
  | {
      kind: "state"
      state: RuntimeState
    }
  | {
      kind: "effect"
      effect: Effect<unknown>
    }

export type RuntimeDebugCancellationReason = "cleanup" | "effect" | "restart"

export type RuntimeDebugEvent =
  | {
      action: RuntimeAction
      queueSize: number
      type: "action-enqueued"
    }
  | {
      command: RuntimeDebugCommand
      queueSize: number
      type: "command-started"
    }
  | {
      command: RuntimeDebugCommand
      generatedCommands: RuntimeDebugCommand[]
      type: "command-completed"
    }
  | {
      output: RuntimeAction
      type: "output-emitted"
    }
  | {
      context: Context
      currentState: RuntimeState
      previousState: RuntimeState | undefined
      type: "context-changed"
    }
  | {
      command: RuntimeDebugCommand
      error: unknown
      type: "runtime-error"
    }
  | {
      asyncId: string
      type: "async-started"
    }
  | {
      asyncId: string
      value: unknown
      type: "async-resolved"
    }
  | {
      asyncId: string
      error: unknown
      type: "async-rejected"
    }
  | {
      asyncId: string
      reason: RuntimeDebugCancellationReason
      type: "async-cancelled"
    }
  | {
      delay: number
      timeoutId: string
      type: "timer-started"
    }
  | {
      delay: number
      timeoutId: string
      type: "timer-completed"
    }
  | {
      delay: number
      reason: RuntimeDebugCancellationReason
      timeoutId: string
      type: "timer-cancelled"
    }
  | {
      delay: number
      intervalId: string
      type: "interval-started"
    }
  | {
      delay: number
      intervalId: string
      type: "interval-triggered"
    }
  | {
      delay: number
      intervalId: string
      reason: RuntimeDebugCancellationReason
      type: "interval-cancelled"
    }
  | {
      type: "frame-started"
    }
  | {
      timestamp: number
      type: "frame-triggered"
    }
  | {
      reason: RuntimeDebugCancellationReason
      type: "frame-cancelled"
    }

export type RuntimeMonitor = (event: RuntimeDebugEvent) => void
