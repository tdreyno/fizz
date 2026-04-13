import type { Action } from "./action.js"
import type { Context } from "./context.js"

export class Effect<T = unknown> {
  constructor(
    public label: string,
    public data: T | undefined,
    public executor: (context: Context) => void,
  ) {}
}

export const isEffect = (e: unknown): e is Effect => e instanceof Effect

export const effect = <D>(
  label: string,
  data?: D,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  executor: (context: Context) => void = (_context: Context) => void 0,
) => new Effect(label, data, executor)

export const goBack = (): Effect<void> => effect("goBack")

export const output = <A extends Action<string, unknown>>(
  action: A,
): Effect<A> => effect("output", action)

const handleLog =
  <T extends unknown[]>(
    msgs: T,
    type: "log" | "error" | "warn",
    logger: (...args: T) => void,
  ) =>
  (context: Context) => {
    if (context.customLogger) {
      context.customLogger(msgs, type)
    } else if (context.enableLogging) {
      logger(...msgs)
    }
  }

export const log = <T extends unknown[]>(...msgs: T): Effect<T> =>
  effect("log", msgs, handleLog(msgs, "log", console.log))

export const error = <T extends unknown[]>(...msgs: T): Effect<T> =>
  effect("error", msgs, handleLog(msgs, "error", console.error))

export const warn = <T extends unknown[]>(...msgs: T): Effect<T> =>
  effect("warn", msgs, handleLog(msgs, "warn", console.warn))

export const noop = (): Effect<void> => effect("noop")

export type StartTimerEffectData<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
  delay: number
}

export type CancelTimerEffectData<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
}

export type RestartTimerEffectData<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
  delay: number
}

export type StartIntervalEffectData<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
  delay: number
}

export type CancelIntervalEffectData<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
}

export type RestartIntervalEffectData<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
  delay: number
}

export const startTimer = <TimeoutId extends string = string>(
  timeoutId: TimeoutId,
  delay: number,
): Effect<StartTimerEffectData<TimeoutId>> =>
  effect("startTimer", { timeoutId, delay })

export const cancelTimer = <TimeoutId extends string = string>(
  timeoutId: TimeoutId,
): Effect<CancelTimerEffectData<TimeoutId>> =>
  effect("cancelTimer", { timeoutId })

export const restartTimer = <TimeoutId extends string = string>(
  timeoutId: TimeoutId,
  delay: number,
): Effect<RestartTimerEffectData<TimeoutId>> =>
  effect("restartTimer", { timeoutId, delay })

export const startInterval = <TimeoutId extends string = string>(
  timeoutId: TimeoutId,
  delay: number,
): Effect<StartIntervalEffectData<TimeoutId>> =>
  effect("startInterval", { timeoutId, delay })

export const cancelInterval = <TimeoutId extends string = string>(
  timeoutId: TimeoutId,
): Effect<CancelIntervalEffectData<TimeoutId>> =>
  effect("cancelInterval", { timeoutId })

export const restartInterval = <TimeoutId extends string = string>(
  timeoutId: TimeoutId,
  delay: number,
): Effect<RestartIntervalEffectData<TimeoutId>> =>
  effect("restartInterval", { timeoutId, delay })

export const timeout = <A extends Action<string, unknown>>(
  ms: number,
  action: A,
): Promise<A> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(action)
    }, ms)
  })
