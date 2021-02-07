/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-explicit-any */
import { Subscription, Task } from "@tdreyno/pretty-please"
import { Action } from "./action"
import { Context } from "./context"

export interface Effect {
  label: string
  data: any
  isEffect: true
  executor: (context: Context) => void
}

export const isEffect = (e: Effect | unknown): e is Effect =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  e && (e as any).isEffect

export const isEffects = (effects: unknown): effects is Effect[] =>
  Array.isArray(effects) && effects.every(isEffect)

const RESERVED_EFFECTS = [
  "exited",
  "entered",
  "goBack",
  "log",
  "error",
  "warn",
  "noop",
  "task",
  "timeout",
  "subscribe",
  "unsubscribe",
]

export const __internalEffect = <
  D extends any,
  F extends (context: Context) => void
>(
  label: string,
  data: D,
  executor: F,
): Effect => ({
  label,
  data,
  executor,
  isEffect: true,
})

export const effect = <D extends any, F extends (context: Context) => void>(
  label: string,
  data: D,
  executor?: F,
): Effect => {
  if (RESERVED_EFFECTS.includes(label)) {
    throw new Error(
      `${label} is a reserved effect label, please change the label of your custom effect`,
    )
  }

  return __internalEffect(label, data, executor || (() => void 0))
}

export const subscribe = (
  key: string,
  subscription: Subscription<Action<any>>,
): Effect => __internalEffect("subscribe", [key, subscription], Task.empty)

export const unsubscribe = (key: string): Effect =>
  __internalEffect("unsubscribe", key, Task.empty)

export const goBack = (): Effect =>
  __internalEffect("goBack", undefined, Task.empty)

export const log = (...msgs: any[]) =>
  __internalEffect("log", msgs, context => {
    if (context.customLogger) {
      context.customLogger(msgs, "log")
    } else if (!context.disableLogging) {
      console.log(...msgs)
    }

    return Task.empty()
  })

export const error = (...msgs: any[]) =>
  __internalEffect("error", msgs, context => {
    if (context.customLogger) {
      context.customLogger(msgs, "error")
    } else if (!context.disableLogging) {
      console.error(...msgs)
    }

    return Task.empty()
  })

export const warn = (...msgs: any[]) =>
  __internalEffect("warn", msgs, context => {
    if (context.customLogger) {
      context.customLogger(msgs, "warn")
    } else if (!context.disableLogging) {
      console.warn(...msgs)
    }

    return Task.empty()
  })

export const noop = () => __internalEffect("noop", undefined, Task.empty)

export const timeout = <A extends Action<any>>(
  ms: number,
  action: A,
): Task<any, A> => Task.of(action).wait(ms)
