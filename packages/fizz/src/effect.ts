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

type RequestJSONMapHandler<Input, Output> = (value: Input) => Output

export type RetryJitter = {
  kind: "full"
  ratio?: number
}

export type RetryStrategy =
  | {
      delayMs: number
      jitter?: RetryJitter
      kind: "fixed"
    }
  | {
      baseDelayMs: number
      jitter?: RetryJitter
      kind: "exponential"
      maxDelayMs?: number
    }

export type RetryPolicy = {
  attempts?: number
  random?: () => number
  shouldRetry?: (error: unknown, attempt: number) => boolean
  strategy?: RetryStrategy
}

export type RequestJSONInit<AsyncId extends string = string> = RequestInit & {
  asyncId?: AsyncId
  retry?: RetryPolicy
}

export type CustomJSONInit<AsyncId extends string = string> = {
  asyncId?: AsyncId
  retry?: RetryPolicy
}

type RequestJSONChainToActionBuilder<
  Resolved,
  AsyncId extends string = string,
> = Effect<StartAsyncEffectData<Resolved, AsyncId>> & {
  map: <Mapped>(
    mapper: RequestJSONMapHandler<Resolved, Mapped>,
  ) => RequestJSONChainToActionBuilder<Mapped, AsyncId>

  chainToAction: <
    ResolvedAction extends Action<string, unknown>,
    RejectedAction extends Action<string, unknown> | void,
  >(
    resolve: RequestJSONResolveHandler<Resolved, ResolvedAction>,
    reject: RequestJSONRejectHandler<RejectedAction>,
  ) => Effect<
    StartAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
  >
}

type RequestJSONAssertHandler<Input, Output extends Input> = (
  value: Input,
) => asserts value is Output

type RequestJSONValidateMethod<Resolved, AsyncId extends string = string> = {
  <Narrowed extends Resolved>(
    validator: RequestJSONAssertHandler<Resolved, Narrowed>,
  ): RequestJSONChainToActionBuilder<Narrowed, AsyncId>

  <Mapped>(
    validator: RequestJSONMapHandler<Resolved, Mapped>,
  ): RequestJSONChainToActionBuilder<Mapped, AsyncId>
}

export type RequestJSONBuilder<
  Resolved = unknown,
  AsyncId extends string = string,
> = RequestJSONChainToActionBuilder<Resolved, AsyncId> & {
  validate: RequestJSONValidateMethod<Resolved, AsyncId>
}

type RequestJSONValidator<Input, Output> =
  | RequestJSONAssertHandler<Input, Output & Input>
  | RequestJSONMapHandler<Input, Output>

type RequestJSONValueMapper<Output> = RequestJSONMapHandler<unknown, Output>

const createJSONRequestInit = <AsyncId extends string = string>(
  signal: AbortSignal,
  init?: RequestJSONInit<AsyncId>,
): RequestInit => {
  const requestInit = init ? { ...init } : {}

  delete requestInit.asyncId
  delete requestInit.retry

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

const createAbortError = (): Error => {
  const error = new Error("Aborted")

  error.name = "AbortError"

  return error
}

const sleepWithSignal = async (
  delayMs: number,
  signal?: AbortSignal,
): Promise<void> => {
  if (delayMs <= 0) {
    return
  }

  if (signal?.aborted) {
    throw createAbortError()
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (signal) {
        signal.removeEventListener("abort", onAbort)
      }

      resolve()
    }, delayMs)

    const onAbort = () => {
      clearTimeout(timer)
      reject(createAbortError())
    }

    signal?.addEventListener("abort", onAbort, { once: true })
  })
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

const defaultRandom = (): number => {
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    const value = new Uint32Array(1)

    globalThis.crypto.getRandomValues(value)

    return value[0]! / 0xffffffff
  }

  return 0.5
}

export const resolveRetryDelayMs = (
  policy: RetryPolicy | undefined,
  attempt: number,
): number => {
  const strategy = policy?.strategy

  if (!strategy) {
    return 0
  }

  const baseDelay =
    strategy.kind === "fixed"
      ? strategy.delayMs
      : Math.min(
          strategy.maxDelayMs ?? Number.POSITIVE_INFINITY,
          strategy.baseDelayMs * Math.pow(2, Math.max(0, attempt - 1)),
        )

  const safeDelay = Math.max(0, Math.floor(baseDelay))

  if (!strategy.jitter) {
    return safeDelay
  }

  const ratio = clamp(strategy.jitter.ratio ?? 1, 0, 1)
  const random = clamp(policy?.random?.() ?? defaultRandom(), 0, 1)
  const jittered = safeDelay * (1 - ratio + random * ratio)

  return Math.max(0, Math.floor(jittered))
}

const normalizeAttempts = (attempts: number | undefined): number => {
  if (attempts === undefined) {
    return 3
  }

  if (!Number.isFinite(attempts)) {
    return 1
  }

  return Math.max(1, Math.floor(attempts))
}

export const retryAsync = async <Resolved>(options: {
  retry?: RetryPolicy
  run: (attempt: number) => Promise<Resolved>
  signal?: AbortSignal
}): Promise<Resolved> => {
  const maxAttempts = options.retry
    ? normalizeAttempts(options.retry.attempts)
    : 1
  const shouldRetry = options.retry?.shouldRetry ?? (() => true)
  let lastError: unknown = undefined

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await options.run(attempt)
    } catch (error) {
      lastError = error

      if (attempt >= maxAttempts || !shouldRetry(error, attempt)) {
        throw error
      }

      const delayMs = resolveRetryDelayMs(options.retry, attempt)

      await sleepWithSignal(delayMs, options.signal)
    }
  }

  throw lastError
}

const validateRequestJSONValue = <Input, Output extends Input>(
  value: Input,
  validator: RequestJSONValidator<Input, Output>,
): Output => {
  const result = validator(value)

  if (result === undefined) {
    return value
  }

  return result as Output
}

const createRequestJSONRun =
  <Resolved, AsyncId extends string = string>(options: {
    init?: RequestJSONInit<AsyncId>
    input: RequestInfo | URL
    mapper?: RequestJSONValueMapper<Resolved>
  }) =>
  async (signal: AbortSignal): Promise<Resolved> =>
    retryAsync<Resolved>({
      retry: options.init?.retry,
      run: async () => {
        const response = await fetch(
          options.input,
          createJSONRequestInit(signal, options.init),
        )

        if (!response.ok) {
          throw new Error(`Request failed with ${response.status}`)
        }

        const value = (await response.json()) as unknown

        return options.mapper ? options.mapper(value) : (value as Resolved)
      },
      signal,
    })

const createCustomJSONRun = <Resolved>(options: {
  retry?: RetryPolicy
  run: (signal: AbortSignal, context: Context) => Promise<unknown>
  mapper?: RequestJSONValueMapper<Resolved>
}): AsyncRun<Resolved> => {
  const run: AsyncRun<Resolved> = async (signal, context) =>
    retryAsync<Resolved>({
      retry: options.retry,
      run: async () => {
        const value = await options.run(signal, context)

        return options.mapper ? options.mapper(value) : (value as Resolved)
      },
      signal,
    })

  return run
}

const createJSONChainToActionBuilder = <
  Resolved,
  AsyncId extends string = string,
>(options: {
  asyncId?: AsyncId
  run: AsyncRun<Resolved>
}): RequestJSONChainToActionBuilder<Resolved, AsyncId> => {
  const ignoreAsyncResult = () => undefined

  const requestEffect = effect(
    "startAsync",
    options.asyncId === undefined
      ? {
          handlers: {
            reject: ignoreAsyncResult,
            resolve: ignoreAsyncResult,
          },
          run: options.run,
        }
      : {
          asyncId: options.asyncId,
          handlers: {
            reject: ignoreAsyncResult,
            resolve: ignoreAsyncResult,
          },
          run: options.run,
        },
  ) as RequestJSONChainToActionBuilder<Resolved, AsyncId>

  requestEffect.chainToAction = (resolve, reject) =>
    startAsync(options.run, { reject, resolve }, options.asyncId)

  requestEffect.map = mapper =>
    createJSONChainToActionBuilder<ReturnType<typeof mapper>, AsyncId>({
      ...(options.asyncId === undefined ? {} : { asyncId: options.asyncId }),
      run: async (signal, context) => {
        const value = await runAsync(options.run, signal, context)

        return mapper(value)
      },
    })

  return requestEffect
}

const runAsync = async <Resolved>(
  run: AsyncRun<Resolved>,
  signal: AbortSignal,
  context: Context,
): Promise<Resolved> => {
  if (typeof run === "function") {
    return run(signal, context)
  }

  return run
}

const createJSONBuilder = <AsyncId extends string = string>(options: {
  asyncId?: AsyncId
  createRun: <Resolved>(
    mapper?: RequestJSONValueMapper<Resolved>,
  ) => AsyncRun<Resolved>
}): RequestJSONBuilder<unknown, AsyncId> => {
  const createChainToActionBuilder = <Resolved>(
    mapper?: RequestJSONValueMapper<Resolved>,
  ) =>
    createJSONChainToActionBuilder<Resolved, AsyncId>(
      options.asyncId === undefined
        ? { run: options.createRun<Resolved>(mapper) }
        : {
            asyncId: options.asyncId,
            run: options.createRun<Resolved>(mapper),
          },
    )

  const chainToActionBuilder = createChainToActionBuilder<unknown>()

  return Object.assign(chainToActionBuilder, {
    validate: (<Narrowed>(validator: RequestJSONValidator<unknown, Narrowed>) =>
      createChainToActionBuilder<Narrowed>(value =>
        validateRequestJSONValue(value, validator),
      )) as RequestJSONValidateMethod<unknown, AsyncId>,
  })
}

export const requestJSONAsync = <AsyncId extends string = string>(
  input: RequestInfo | URL,
  init?: RequestJSONInit<AsyncId>,
): RequestJSONBuilder<unknown, AsyncId> =>
  createJSONBuilder<AsyncId>({
    ...(init?.asyncId === undefined ? {} : { asyncId: init.asyncId }),
    createRun: <Resolved>(mapper?: RequestJSONValueMapper<Resolved>) => {
      if (init === undefined) {
        return createRequestJSONRun<Resolved, AsyncId>(
          mapper ? { input, mapper } : { input },
        )
      }

      return createRequestJSONRun<Resolved, AsyncId>(
        mapper ? { input, init, mapper } : { input, init },
      )
    },
  })

export const customJSONAsync = <AsyncId extends string = string>(
  run: (signal: AbortSignal, context: Context) => Promise<unknown>,
  init?: CustomJSONInit<AsyncId>,
): RequestJSONBuilder<unknown, AsyncId> =>
  createJSONBuilder<AsyncId>({
    ...(init?.asyncId === undefined ? {} : { asyncId: init.asyncId }),
    createRun: <Resolved>(mapper?: RequestJSONValueMapper<Resolved>) =>
      createCustomJSONRun<Resolved>(
        mapper
          ? { retry: init?.retry, run, mapper }
          : { retry: init?.retry, run },
      ),
  })

export type AsyncRun<Resolved> =
  | Promise<Resolved>
  | ((signal: AbortSignal, context: Context) => Promise<Resolved>)

export type DebounceAsyncRun<Resolved> = (
  signal: AbortSignal,
  context: Context,
) => Promise<Resolved>

export type AsyncHandlers<
  Resolved,
  ResolvedAction extends Action<string, unknown> | void,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  reject: (reason: unknown) => RejectedAction
  resolve: (value: Resolved) => ResolvedAction
}

export type DebounceAsyncHandlers<
  Resolved,
  ResolvedAction extends Action<string, unknown> | void,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  reject?: (reason: unknown) => RejectedAction
  resolve: (value: Resolved) => ResolvedAction
}

export type DebounceAsyncAbortClassifier = (
  reason: unknown,
  signal: AbortSignal,
) => boolean

export type DebounceAsyncEffectData<
  Resolved = unknown,
  AsyncId extends string = string,
  ResolvedAction extends Action<string, unknown> | void = Action<
    string,
    unknown
  >,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  asyncId: AsyncId
  classifyAbort?: DebounceAsyncAbortClassifier
  delayMs: number
  emitCancelled?: boolean
  handlers: DebounceAsyncHandlers<Resolved, ResolvedAction, RejectedAction>
  run: DebounceAsyncRun<Resolved>
}

export type StartAsyncEffectData<
  Resolved = unknown,
  AsyncId extends string = string,
  ResolvedAction extends Action<string, unknown> | void = Action<
    string,
    unknown
  >,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  asyncId?: AsyncId
  handlers: AsyncHandlers<Resolved, ResolvedAction, RejectedAction>
  run: AsyncRun<Resolved>
}

export type CancelAsyncEffectData<AsyncId extends string = string> = {
  asyncId: AsyncId
}

export type DebounceAsyncOptions<
  Resolved,
  AsyncId extends string,
  ResolvedAction extends Action<string, unknown> | void,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  asyncId: AsyncId
  classifyAbort?: DebounceAsyncAbortClassifier
  delayMs: number
  emitCancelled?: boolean
  reject?: (reason: unknown) => RejectedAction
  resolve: (value: Resolved) => ResolvedAction
}

export type StartAsyncEffectCreator<AsyncId extends string = string> = <
  Resolved,
  ResolvedAction extends Action<string, unknown> | void,
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
  ResolvedAction extends Action<string, unknown> | void,
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

export const debounceAsync = <
  Resolved,
  ResolvedAction extends Action<string, unknown> | void,
  RejectedAction extends Action<string, unknown> | void = void,
  AsyncId extends string = string,
>(
  run: DebounceAsyncRun<Resolved>,
  options: DebounceAsyncOptions<
    Resolved,
    AsyncId,
    ResolvedAction,
    RejectedAction
  >,
): Effect<
  DebounceAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
> =>
  effect("debounceAsync", {
    asyncId: options.asyncId,
    ...(options.classifyAbort === undefined
      ? {}
      : { classifyAbort: options.classifyAbort }),
    delayMs: options.delayMs,
    ...(options.emitCancelled === undefined
      ? {}
      : { emitCancelled: options.emitCancelled }),
    handlers: {
      ...(options.reject === undefined ? {} : { reject: options.reject }),
      resolve: options.resolve,
    },
    run,
  })

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

export type ResourceEffectData<Key extends string = string, Value = unknown> = {
  key: Key
  teardown?: (value: Value) => void
  value: Value
}

export type SubscriptionEffectData<Key extends string = string> = {
  key: Key
  subscribe: () => () => void
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

export const resource = <Key extends string = string, Value = unknown>(
  key: Key,
  value: Value,
  teardown?: (value: Value) => void,
): Effect<ResourceEffectData<Key, Value>> =>
  effect(
    "resource",
    teardown === undefined ? { key, value } : { key, teardown, value },
  )

export const abortController = <Key extends string = string>(
  key: Key,
): Effect<ResourceEffectData<Key, AbortController>> =>
  resource(key, new AbortController(), controller => controller.abort())

export const subscription = <Key extends string = string>(
  key: Key,
  subscribe: () => () => void,
): Effect<SubscriptionEffectData<Key>> =>
  effect("subscription", { key, subscribe })

export type ConfirmEffectData = {
  message: string
}

export type PromptEffectData = {
  message: string
}

export type AlertEffectData = {
  message: string
}

export type CopyToClipboardEffectData = {
  text: string
}

export type OpenUrlEffectData = {
  features?: string
  target?: string
  url: string
}

export type PostMessageEffectData = {
  message: unknown
  targetOrigin: string
  transfer?: Transferable[]
}

export type HistoryGoEffectData = {
  delta: number
}

export type LocationAssignEffectData = {
  url: string
}

export type LocationReplaceEffectData = {
  url: string
}

export const confirm = (message: string): Effect<ConfirmEffectData> =>
  effect("confirm", { message })

export const prompt = (message: string): Effect<PromptEffectData> =>
  effect("prompt", { message })

export const alert = (message: string): Effect<AlertEffectData> =>
  effect("alert", { message })

export const copyToClipboard = (
  text: string,
): Effect<CopyToClipboardEffectData> => effect("copyToClipboard", { text })

export const openUrl = (
  url: string,
  target?: string,
  features?: string,
): Effect<OpenUrlEffectData> => effect("openUrl", { features, target, url })

export const printPage = (): Effect<undefined> => effect("printPage")

export const locationAssign = (url: string): Effect<LocationAssignEffectData> =>
  effect("locationAssign", { url })

export const locationReplace = (
  url: string,
): Effect<LocationReplaceEffectData> => effect("locationReplace", { url })

export const locationReload = (): Effect<undefined> => effect("locationReload")

export const historyBack = (): Effect<undefined> => effect("historyBack")

export const historyForward = (): Effect<undefined> => effect("historyForward")

export const historyGo = (delta: number): Effect<HistoryGoEffectData> =>
  effect("historyGo", { delta })

export const postMessage = (
  message: unknown,
  targetOrigin: string,
  transfer?: Transferable[],
): Effect<PostMessageEffectData> =>
  effect("postMessage", { message, targetOrigin, transfer })

export const timeout = <A extends Action<string, unknown>>(
  ms: number,
  action: A,
): Promise<A> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(action)
    }, ms)
  })
