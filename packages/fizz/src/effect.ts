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

type RequestJSONRejectHandler<
  RejectedAction extends Action<string, unknown> | void,
> = (reason: unknown) => RejectedAction

type RequestJSONResolveHandler<
  Resolved,
  ResolvedAction extends Action<string, unknown>,
> = (value: Resolved) => ResolvedAction

export type RequestJSONInit<AsyncId extends string = string> = RequestInit & {
  asyncId?: AsyncId
}

export type CustomJSONInit<AsyncId extends string = string> = {
  asyncId?: AsyncId
}

type RequestJSONChainToActionBuilder<
  Resolved,
  AsyncId extends string = string,
> = Effect<StartAsyncEffectData<Resolved, AsyncId>> & {
  chainToAction: <
    ResolvedAction extends Action<string, unknown>,
    RejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: RequestJSONResolveHandler<Resolved, ResolvedAction>,
    reject?: RequestJSONRejectHandler<RejectedAction>,
  ) => Effect<
    StartAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
  >
}

type RequestJSONAssertHandler<Input, Output extends Input> = (
  value: Input,
) => asserts value is Output

export type RequestJSONBuilder<
  Resolved = unknown,
  AsyncId extends string = string,
> = RequestJSONChainToActionBuilder<Resolved, AsyncId> & {
  validate: <Narrowed extends Resolved>(
    validator: RequestJSONAssertHandler<Resolved, Narrowed>,
  ) => RequestJSONChainToActionBuilder<Narrowed, AsyncId>
}

type RequestJSONValidator<
  Input,
  Output extends Input,
> = RequestJSONAssertHandler<Input, Output>

const createJSONRequestInit = <AsyncId extends string = string>(
  signal: AbortSignal,
  init?: RequestJSONInit<AsyncId>,
): RequestInit => {
  const requestInit = init ? { ...init } : {}

  delete requestInit.asyncId

  const headers = new Headers(init?.headers)

  headers.set("Accept", "application/json")

  return {
    ...requestInit,
    headers,
    signal: mergeAbortSignals(signal, init?.signal),
  }
}

const mergeAbortSignals = (
  signal: AbortSignal,
  secondarySignal?: AbortSignal | null,
): AbortSignal => {
  if (!secondarySignal) {
    return signal
  }

  const controller = new AbortController()

  if (signal.aborted || secondarySignal.aborted) {
    controller.abort()

    return controller.signal
  }

  const onAbort = () => controller.abort()

  signal.addEventListener("abort", onAbort, { once: true })
  secondarySignal.addEventListener("abort", onAbort, { once: true })

  return controller.signal
}

const validateRequestJSONValue = <Input, Output extends Input>(
  value: Input,
  validator: RequestJSONValidator<Input, Output>,
): Output => {
  validator(value)

  return value
}

const createRequestJSONRun =
  <Resolved, AsyncId extends string = string>(options: {
    init?: RequestJSONInit<AsyncId>
    input: RequestInfo | URL
    validator?: RequestJSONValidator<unknown, Resolved>
  }) =>
  async (signal: AbortSignal): Promise<Resolved> => {
    const response = await fetch(
      options.input,
      createJSONRequestInit(signal, options.init),
    )

    if (!response.ok) {
      throw new Error(`Request failed with ${response.status}`)
    }

    const value = (await response.json()) as unknown

    return options.validator
      ? validateRequestJSONValue(value, options.validator)
      : (value as Resolved)
  }

const createCustomJSONRun = <Resolved>(options: {
  run: (signal: AbortSignal, context: Context) => Promise<unknown>
  validator?: RequestJSONValidator<unknown, Resolved>
}): AsyncRun<Resolved> => {
  const run: AsyncRun<Resolved> = async (signal, context) => {
    const value = await options.run(signal, context)

    return options.validator
      ? validateRequestJSONValue(value, options.validator)
      : (value as Resolved)
  }

  return run
}

const createJSONChainToActionBuilder = <
  Resolved,
  AsyncId extends string = string,
>(options: {
  asyncId?: AsyncId
  run: AsyncRun<Resolved>
}): RequestJSONChainToActionBuilder<Resolved, AsyncId> => {
  const requestEffect = effect(
    "startAsync",
    options.asyncId === undefined
      ? { handlers: {}, run: options.run }
      : { asyncId: options.asyncId, handlers: {}, run: options.run },
  ) as RequestJSONChainToActionBuilder<Resolved, AsyncId>

  requestEffect.chainToAction = (resolve, reject) =>
    startAsync(
      options.run,
      reject ? { reject, resolve } : { resolve },
      options.asyncId,
    )

  return requestEffect
}

const createJSONBuilder = <AsyncId extends string = string>(options: {
  asyncId?: AsyncId
  createRun: <Resolved>(
    validator?: RequestJSONValidator<unknown, Resolved>,
  ) => AsyncRun<Resolved>
}): RequestJSONBuilder<unknown, AsyncId> => {
  const createChainToActionBuilder = <Resolved>(
    validator?: RequestJSONValidator<unknown, Resolved>,
  ) =>
    createJSONChainToActionBuilder<Resolved, AsyncId>(
      options.asyncId === undefined
        ? { run: options.createRun<Resolved>(validator) }
        : {
            asyncId: options.asyncId,
            run: options.createRun<Resolved>(validator),
          },
    )

  const chainToActionBuilder = createChainToActionBuilder<unknown>()

  return Object.assign(chainToActionBuilder, {
    validate: <Narrowed>(
      validator: RequestJSONAssertHandler<unknown, Narrowed>,
    ) => createChainToActionBuilder<Narrowed>(validator),
  })
}

export const requestJSONAsync = <AsyncId extends string = string>(
  input: RequestInfo | URL,
  init?: RequestJSONInit<AsyncId>,
): RequestJSONBuilder<unknown, AsyncId> =>
  createJSONBuilder<AsyncId>({
    ...(init?.asyncId === undefined ? {} : { asyncId: init.asyncId }),
    createRun: <Resolved>(
      validator?: RequestJSONValidator<unknown, Resolved>,
    ) => {
      if (init === undefined) {
        return createRequestJSONRun<Resolved, AsyncId>(
          validator ? { input, validator } : { input },
        )
      }

      return createRequestJSONRun<Resolved, AsyncId>(
        validator ? { input, init, validator } : { input, init },
      )
    },
  })

export const customJSONAsync = <AsyncId extends string = string>(
  run: (signal: AbortSignal, context: Context) => Promise<unknown>,
  init?: CustomJSONInit<AsyncId>,
): RequestJSONBuilder<unknown, AsyncId> =>
  createJSONBuilder<AsyncId>({
    ...(init?.asyncId === undefined ? {} : { asyncId: init.asyncId }),
    createRun: <Resolved>(
      validator?: RequestJSONValidator<unknown, Resolved>,
    ) =>
      createCustomJSONRun<Resolved>(validator ? { run, validator } : { run }),
  })

export type AsyncRun<Resolved> =
  | Promise<Resolved>
  | ((signal: AbortSignal, context: Context) => Promise<Resolved>)

export type AsyncHandlers<
  Resolved,
  ResolvedAction extends Action<string, unknown>,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  reject?: (reason: unknown) => RejectedAction
  resolve?: (value: Resolved) => ResolvedAction
}

export type StartAsyncEffectData<
  Resolved = unknown,
  AsyncId extends string = string,
  ResolvedAction extends Action<string, unknown> = Action<string, unknown>,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  asyncId?: AsyncId
  handlers: AsyncHandlers<Resolved, ResolvedAction, RejectedAction>
  run: AsyncRun<Resolved>
}

export type CancelAsyncEffectData<AsyncId extends string = string> = {
  asyncId: AsyncId
}

export type StartAsyncEffectCreator<AsyncId extends string = string> = <
  Resolved,
  ResolvedAction extends Action<string, unknown>,
  RejectedAction extends Action<string, unknown> | void = void,
>(
  run: AsyncRun<Resolved>,
  handlers: AsyncHandlers<Resolved, ResolvedAction, RejectedAction>,
  asyncId?: AsyncId,
) => Effect<
  StartAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
>

export const startAsync = <
  Resolved,
  ResolvedAction extends Action<string, unknown>,
  RejectedAction extends Action<string, unknown> | void = void,
  AsyncId extends string = string,
>(
  run: AsyncRun<Resolved>,
  handlers: AsyncHandlers<Resolved, ResolvedAction, RejectedAction>,
  asyncId?: AsyncId,
): Effect<
  StartAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
> =>
  effect(
    "startAsync",
    asyncId === undefined ? { handlers, run } : { asyncId, handlers, run },
  )

export const cancelAsync = <AsyncId extends string = string>(
  asyncId: AsyncId,
): Effect<CancelAsyncEffectData<AsyncId>> => effect("cancelAsync", { asyncId })

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

export type StartIntervalEffectData<IntervalId extends string = string> = {
  intervalId: IntervalId
  delay: number
}

export type CancelIntervalEffectData<IntervalId extends string = string> = {
  intervalId: IntervalId
}

export type RestartIntervalEffectData<IntervalId extends string = string> = {
  intervalId: IntervalId
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

export const startInterval = <IntervalId extends string = string>(
  intervalId: IntervalId,
  delay: number,
): Effect<StartIntervalEffectData<IntervalId>> =>
  effect("startInterval", { intervalId, delay })

export const cancelInterval = <IntervalId extends string = string>(
  intervalId: IntervalId,
): Effect<CancelIntervalEffectData<IntervalId>> =>
  effect("cancelInterval", { intervalId })

export const restartInterval = <IntervalId extends string = string>(
  intervalId: IntervalId,
  delay: number,
): Effect<RestartIntervalEffectData<IntervalId>> =>
  effect("restartInterval", { intervalId, delay })

export const startFrame = (): Effect<undefined> => effect("startFrame")

export const cancelFrame = (): Effect<undefined> => effect("cancelFrame")

export const timeout = <A extends Action<string, unknown>>(
  ms: number,
  action: A,
): Promise<A> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(action)
    }, ms)
  })
