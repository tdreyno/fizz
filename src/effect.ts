import type { Action } from "./action.js"
import type { Context } from "./context.js"

export interface Effect<T = any> {
  label: string
  data: T
  isEffect: true
  executor: (context: Context) => void
}

export const isEffect = (e: unknown): e is Effect =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
  (e as any)?.isEffect

export const isEffects = (effects: unknown): effects is Array<Effect> =>
  Array.isArray(effects) && effects.every(isEffect)

const RESERVED_EFFECTS = ["goBack", "log", "error", "warn", "noop", "timeout"]

export const __internalEffect = <D, F extends (context: Context) => void>(
  label: string,
  data: D,
  executor: F,
): Effect<D> => ({
  label,
  data,
  executor,
  isEffect: true,
})

export const effect = <D, F extends (context: Context) => void>(
  label: string,
  data: D,
  executor?: F,
): Effect<D> => {
  if (RESERVED_EFFECTS.includes(label)) {
    throw new Error(
      `${label} is a reserved effect label, please change the label of your custom effect`,
    )
  }

  return __internalEffect(label, data, executor || (() => void 0))
}

export const goBack = (): Effect<void> =>
  __internalEffect("goBack", undefined, () => void 0)

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
  __internalEffect("log", msgs, handleLog(msgs, "log", console.log))

export const error = <T extends Array<any>>(...msgs: T): Effect<T> =>
  __internalEffect("error", msgs, handleLog(msgs, "error", console.error))

export const warn = <T extends Array<any>>(...msgs: T): Effect<T> =>
  __internalEffect("warn", msgs, handleLog(msgs, "warn", console.warn))

export const noop = (): Effect<void> =>
  __internalEffect("noop", undefined, () => void 0)

export const timeout = <A extends Action<any, any>>(
  ms: number,
  action: A,
): Promise<A> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(action)
    }, ms)
  })
