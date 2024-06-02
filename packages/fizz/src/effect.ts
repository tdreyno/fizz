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

export const output = <A extends Action<any, any>>(action: A): Effect<A> =>
  effect("output", action)

const handleLog =
  <T extends Array<any>>(
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

export const log = <T extends Array<any>>(...msgs: T): Effect<T> =>
  effect("log", msgs, handleLog(msgs, "log", console.log))

export const error = <T extends Array<any>>(...msgs: T): Effect<T> =>
  effect("error", msgs, handleLog(msgs, "error", console.error))

export const warn = <T extends Array<any>>(...msgs: T): Effect<T> =>
  effect("warn", msgs, handleLog(msgs, "warn", console.warn))

export const noop = (): Effect<void> => effect("noop")

export const timeout = <A extends Action<any, any>>(
  ms: number,
  action: A,
): Promise<A> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(action)
    }, ms)
  })
