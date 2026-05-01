import type { Action } from "./action.js"
import { action } from "./action.js"
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

export type OutputActionMap = Record<
  string,
  Record<string, (payload: unknown) => unknown>
>

type OutputCommandChannel<Map extends OutputActionMap> = Extract<
  keyof Map,
  string
>

type OutputCommandType<
  Map extends OutputActionMap,
  Channel extends OutputCommandChannel<Map>,
> = Extract<keyof Map[Channel], string>

type OutputCommandPayload<
  Map extends OutputActionMap,
  Channel extends OutputCommandChannel<Map>,
  CommandType extends OutputCommandType<Map, Channel>,
> = Parameters<Map[Channel][CommandType]>[0]

export const defineOutputMap = <Map extends OutputActionMap>(map: Map): Map =>
  map

export function outputCommand<
  Channel extends string,
  CommandType extends string,
  Payload,
>(
  channel: Channel,
  commandType: CommandType,
  payload: Payload,
): Effect<Action<`${Channel}.${CommandType}`, Payload>>

export function outputCommand<
  Map extends OutputActionMap,
  Channel extends OutputCommandChannel<Map>,
  CommandType extends OutputCommandType<Map, Channel>,
>(
  outputMap: Map,
  channel: Channel,
  commandType: CommandType,
  payload: OutputCommandPayload<Map, Channel, CommandType>,
): Effect<
  Action<
    `${Channel}.${CommandType}`,
    OutputCommandPayload<Map, Channel, CommandType>
  >
>

export function outputCommand(
  mapOrChannel: OutputActionMap | string,
  channelOrType: string,
  commandTypeOrPayload: unknown,
  payloadMaybe?: unknown,
): Effect<Action<string, unknown>> {
  if (typeof mapOrChannel === "string") {
    return output(
      action(`${mapOrChannel}.${channelOrType}`, commandTypeOrPayload),
    )
  }

  return output(
    action(`${channelOrType}.${String(commandTypeOrPayload)}`, payloadMaybe),
  )
}

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

export type CommandSchema = Record<
  string,
  Record<
    string,
    {
      payload: unknown
      result: unknown
    }
  >
>

type CommandResolveHandler<
  Result,
  ResolvedAction extends Action<string, unknown> | void,
> = (value: Result) => ResolvedAction

type CommandRejectHandler<
  RejectedAction extends Action<string, unknown> | void,
> = (reason: unknown) => RejectedAction

type CommandChannelName<Schema extends CommandSchema> = Extract<
  keyof Schema,
  string
>

type CommandTypeName<
  Schema extends CommandSchema,
  Channel extends CommandChannelName<Schema>,
> = Extract<keyof Schema[Channel], string>

type CommandPayload<
  Schema extends CommandSchema,
  Channel extends CommandChannelName<Schema>,
  CommandType extends CommandTypeName<Schema, Channel>,
> = Schema[Channel][CommandType]["payload"]

type CommandResult<
  Schema extends CommandSchema,
  Channel extends CommandChannelName<Schema>,
  CommandType extends CommandTypeName<Schema, Channel>,
> = Schema[Channel][CommandType]["result"]

export type CommandEffectData<
  Channel extends string = string,
  CommandType extends string = string,
  Payload = unknown,
  Result = unknown,
  ResolvedAction extends Action<string, unknown> | void = Action<
    string,
    unknown
  >,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  channel: Channel
  commandType: CommandType
  handlers: {
    reject: CommandRejectHandler<RejectedAction>
    resolve: CommandResolveHandler<Result, ResolvedAction>
  }
  payload: Payload
}

export type EffectBatchOnError = "continue" | "failBatch"

type BatchResolveHandler<Resolved extends Action<string, unknown> | void> =
  () => Resolved

type BatchRejectHandler<Rejected extends Action<string, unknown> | void> = (
  reason: unknown,
) => Rejected

export type EffectBatchOptions = {
  channel?: string
  onError?: EffectBatchOnError
}

export type EffectBatchEffectData<
  ResolvedAction extends Action<string, unknown> | void = void,
  RejectedAction extends Action<string, unknown> | void = void,
  ResolvedOutput extends Action<string, unknown> | void = void,
  RejectedOutput extends Action<string, unknown> | void = void,
> = {
  channel?: string
  effects: ReadonlyArray<Effect<unknown>>
  handlers: {
    rejectAction: BatchRejectHandler<RejectedAction>
    rejectOutput: BatchRejectHandler<RejectedOutput>
    resolveAction: BatchResolveHandler<ResolvedAction>
    resolveOutput: BatchResolveHandler<ResolvedOutput>
  }
  onError: EffectBatchOnError
}

export type EffectBatchBuilder<
  ResolvedAction extends Action<string, unknown> | void = void,
  RejectedAction extends Action<string, unknown> | void = void,
  ResolvedOutput extends Action<string, unknown> | void = void,
  RejectedOutput extends Action<string, unknown> | void = void,
> = Effect<
  EffectBatchEffectData<
    ResolvedAction,
    RejectedAction,
    ResolvedOutput,
    RejectedOutput
  >
> & {
  chainToAction: <
    NextResolvedAction extends Action<string, unknown> | void,
    NextRejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: NextResolvedAction,
    reject?: BatchRejectHandler<NextRejectedAction>,
  ) => EffectBatchBuilder<
    NextResolvedAction,
    NextRejectedAction,
    ResolvedOutput,
    RejectedOutput
  >

  chainToOutput: <
    NextResolvedOutput extends Action<string, unknown> | void,
    NextRejectedOutput extends Action<string, unknown> | void = void,
  >(
    resolve: NextResolvedOutput,
    reject?: BatchRejectHandler<NextRejectedOutput>,
  ) => EffectBatchBuilder<
    ResolvedAction,
    RejectedAction,
    NextResolvedOutput,
    NextRejectedOutput
  >
}

const ignoreBatchResult = () => undefined
const ignoreBatchError = () => undefined

const createEffectBatchBuilder = <
  ResolvedAction extends Action<string, unknown> | void,
  RejectedAction extends Action<string, unknown> | void,
  ResolvedOutput extends Action<string, unknown> | void,
  RejectedOutput extends Action<string, unknown> | void,
>(
  data: EffectBatchEffectData<
    ResolvedAction,
    RejectedAction,
    ResolvedOutput,
    RejectedOutput
  >,
): EffectBatchBuilder<
  ResolvedAction,
  RejectedAction,
  ResolvedOutput,
  RejectedOutput
> => {
  const batch = effect("effectBatch", data) as EffectBatchBuilder<
    ResolvedAction,
    RejectedAction,
    ResolvedOutput,
    RejectedOutput
  >

  batch.chainToAction = <
    NextResolvedAction extends Action<string, unknown> | void,
    NextRejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: NextResolvedAction,
    reject?: BatchRejectHandler<NextRejectedAction>,
  ) =>
    createEffectBatchBuilder({
      ...data,
      handlers: {
        ...data.handlers,
        rejectAction:
          reject ??
          (ignoreBatchError as unknown as BatchRejectHandler<NextRejectedAction>),
        resolveAction: () => resolve,
      },
    })

  batch.chainToOutput = <
    NextResolvedOutput extends Action<string, unknown> | void,
    NextRejectedOutput extends Action<string, unknown> | void = void,
  >(
    resolve: NextResolvedOutput,
    reject?: BatchRejectHandler<NextRejectedOutput>,
  ) =>
    createEffectBatchBuilder({
      ...data,
      handlers: {
        ...data.handlers,
        rejectOutput:
          reject ??
          (ignoreBatchError as unknown as BatchRejectHandler<NextRejectedOutput>),
        resolveOutput: () => resolve,
      },
    })

  return batch
}

type CommandEffectChainToActionBuilder<
  Channel extends string,
  CommandType extends string,
  Payload,
  Result,
> = Effect<
  CommandEffectData<
    Channel,
    CommandType,
    Payload,
    Result,
    Action<string, unknown> | void,
    void
  >
> & {
  chainToAction: <
    ResolvedAction extends Action<string, unknown> | void,
    RejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: CommandResolveHandler<Result, ResolvedAction>,
    reject?: CommandRejectHandler<RejectedAction>,
  ) => Effect<
    CommandEffectData<
      Channel,
      CommandType,
      Payload,
      Result,
      ResolvedAction,
      RejectedAction
    >
  >
}

export type CommandChannelBuilder<
  Schema extends CommandSchema,
  Channel extends CommandChannelName<Schema>,
> = {
  readonly channel: Channel
  batch: (
    commands: ReadonlyArray<Effect<unknown>>,
    options?: Omit<EffectBatchOptions, "channel">,
  ) => EffectBatchBuilder
  command: <CommandType extends CommandTypeName<Schema, Channel>>(
    commandType: CommandType,
    payload: CommandPayload<Schema, Channel, CommandType>,
  ) => CommandEffectChainToActionBuilder<
    Channel,
    CommandType,
    CommandPayload<Schema, Channel, CommandType>,
    CommandResult<Schema, Channel, CommandType>
  >
}

export const commandEffect = <
  Schema extends CommandSchema,
  Channel extends CommandChannelName<Schema>,
  CommandType extends CommandTypeName<Schema, Channel>,
>(
  channel: Channel,
  commandType: CommandType,
  payload: CommandPayload<Schema, Channel, CommandType>,
): CommandEffectChainToActionBuilder<
  Channel,
  CommandType,
  CommandPayload<Schema, Channel, CommandType>,
  CommandResult<Schema, Channel, CommandType>
> => {
  const ignoreCommandResult = () => undefined
  const ignoreCommandError = () => undefined

  const command = effect("commandEffect", {
    channel,
    commandType,
    handlers: {
      reject: ignoreCommandError,
      resolve: ignoreCommandResult,
    },
    payload,
  }) as CommandEffectChainToActionBuilder<
    Channel,
    CommandType,
    CommandPayload<Schema, Channel, CommandType>,
    CommandResult<Schema, Channel, CommandType>
  >

  command.chainToAction = <
    ResolvedAction extends Action<string, unknown> | void,
    RejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: CommandResolveHandler<
      CommandResult<Schema, Channel, CommandType>,
      ResolvedAction
    >,
    reject?: CommandRejectHandler<RejectedAction>,
  ) => {
    const rejectHandler =
      reject ??
      (ignoreCommandError as unknown as CommandRejectHandler<RejectedAction>)

    return effect("commandEffect", {
      channel,
      commandType,
      handlers: {
        reject: rejectHandler,
        resolve,
      },
      payload,
    })
  }

  return command
}

export const effectBatch = (
  effects: ReadonlyArray<Effect<unknown>>,
  options?: EffectBatchOptions,
): EffectBatchBuilder =>
  createEffectBatchBuilder({
    ...(options?.channel === undefined ? {} : { channel: options.channel }),
    effects,
    handlers: {
      rejectAction: ignoreBatchError,
      rejectOutput: ignoreBatchError,
      resolveAction: ignoreBatchResult,
      resolveOutput: ignoreBatchResult,
    },
    onError: options?.onError ?? "failBatch",
  })

export const commandChannel = <
  Schema extends CommandSchema,
  Channel extends CommandChannelName<Schema>,
>(
  channel: Channel,
): CommandChannelBuilder<Schema, Channel> => ({
  channel,
  batch: (commands, options) =>
    effectBatch(commands, {
      ...options,
      channel,
    }),
  command: (commandType, payload) =>
    commandEffect<Schema, Channel, typeof commandType>(
      channel,
      commandType,
      payload,
    ),
})

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
  const result = (
    validator as RequestJSONMapHandler<Input, Output | undefined>
  )(value)

  if (result === undefined) {
    return value as Output
  }

  return result
}

const createRequestJSONRun =
  <Resolved, AsyncId extends string = string>(options: {
    init?: RequestJSONInit<AsyncId>
    input: RequestInfo | URL
    mapper?: RequestJSONValueMapper<Resolved>
  }) =>
  async (signal: AbortSignal): Promise<Resolved> =>
    retryAsync<Resolved>({
      ...(options.init?.retry === undefined
        ? {}
        : { retry: options.init.retry }),
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
      ...(options.retry === undefined ? {} : { retry: options.retry }),
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
  const requestEffect = effect(
    "startAsync",
    createStartAsyncEffectData(
      options.run,
      {
        reject: ignoreAsyncResult,
        resolve: ignoreAsyncResult,
      },
      options.asyncId,
    ),
  ) as RequestJSONChainToActionBuilder<Resolved, AsyncId>

  requestEffect.chainToAction = (resolve, reject) =>
    startAsync(options.run, options.asyncId).chainToAction(resolve, reject)

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
          ? {
              ...(init?.retry === undefined ? {} : { retry: init.retry }),
              mapper,
              run,
            }
          : {
              ...(init?.retry === undefined ? {} : { retry: init.retry }),
              run,
            },
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

export type DebounceAsyncOptions<AsyncId extends string = string> = {
  asyncId: AsyncId
  classifyAbort?: DebounceAsyncAbortClassifier
  delayMs: number
  emitCancelled?: boolean
}

export type StartAsyncBuilder<
  Resolved,
  AsyncId extends string = string,
> = Effect<StartAsyncEffectData<Resolved, AsyncId, void, void>> & {
  chainToAction: <
    ResolvedAction extends Action<string, unknown> | void,
    RejectedAction extends Action<string, unknown> | void,
  >(
    resolve: (value: Resolved) => ResolvedAction,
    reject: (reason: unknown) => RejectedAction,
  ) => Effect<
    StartAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
  >
}

export type DebounceAsyncBuilder<
  Resolved,
  AsyncId extends string = string,
> = Effect<DebounceAsyncEffectData<Resolved, AsyncId, void, void>> & {
  chainToAction: <
    ResolvedAction extends Action<string, unknown> | void,
    RejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: (value: Resolved) => ResolvedAction,
    reject?: (reason: unknown) => RejectedAction,
  ) => Effect<
    DebounceAsyncEffectData<Resolved, AsyncId, ResolvedAction, RejectedAction>
  >
}

const ignoreAsyncResult = () => undefined

const createStartAsyncEffectData = <
  Resolved,
  AsyncId extends string = string,
  ResolvedAction extends Action<string, unknown> | void = void,
  RejectedAction extends Action<string, unknown> | void = void,
>(
  run: AsyncRun<Resolved>,
  handlers: AsyncHandlers<Resolved, ResolvedAction, RejectedAction>,
  asyncId?: AsyncId,
) => (asyncId === undefined ? { handlers, run } : { asyncId, handlers, run })

const createDebounceAsyncEffectData = <
  Resolved,
  AsyncId extends string = string,
  ResolvedAction extends Action<string, unknown> | void = void,
  RejectedAction extends Action<string, unknown> | void = void,
>(
  run: DebounceAsyncRun<Resolved>,
  options: DebounceAsyncOptions<AsyncId>,
  handlers: DebounceAsyncHandlers<Resolved, ResolvedAction, RejectedAction>,
) => ({
  asyncId: options.asyncId,
  ...(options.classifyAbort === undefined
    ? {}
    : { classifyAbort: options.classifyAbort }),
  delayMs: options.delayMs,
  ...(options.emitCancelled === undefined
    ? {}
    : { emitCancelled: options.emitCancelled }),
  handlers,
  run,
})

const createStartAsyncBuilder = <Resolved, AsyncId extends string = string>(
  run: AsyncRun<Resolved>,
  asyncId?: AsyncId,
): StartAsyncBuilder<Resolved, AsyncId> => {
  const startAsyncEffect = effect(
    "startAsync",
    createStartAsyncEffectData(
      run,
      {
        reject: ignoreAsyncResult,
        resolve: ignoreAsyncResult,
      },
      asyncId,
    ),
  ) as StartAsyncBuilder<Resolved, AsyncId>

  startAsyncEffect.chainToAction = (resolve, reject) =>
    effect(
      "startAsync",
      createStartAsyncEffectData(run, { reject, resolve }, asyncId),
    )

  return startAsyncEffect
}

const createDebounceAsyncBuilder = <Resolved, AsyncId extends string = string>(
  run: DebounceAsyncRun<Resolved>,
  options: DebounceAsyncOptions<AsyncId>,
): DebounceAsyncBuilder<Resolved, AsyncId> => {
  const debounceEffect = effect(
    "debounceAsync",
    createDebounceAsyncEffectData(run, options, {
      resolve: ignoreAsyncResult,
    }),
  ) as DebounceAsyncBuilder<Resolved, AsyncId>

  debounceEffect.chainToAction = (resolve, reject) =>
    effect(
      "debounceAsync",
      createDebounceAsyncEffectData(
        run,
        options,
        reject === undefined ? { resolve } : { reject, resolve },
      ),
    )

  return debounceEffect
}

export type StartAsyncEffectCreator<AsyncId extends string = string> = <
  Resolved,
>(
  run: AsyncRun<Resolved>,
  asyncId?: AsyncId,
) => StartAsyncBuilder<Resolved, AsyncId>

export const startAsync = <Resolved, AsyncId extends string = string>(
  run: AsyncRun<Resolved>,
  asyncId?: AsyncId,
): StartAsyncBuilder<Resolved, AsyncId> => createStartAsyncBuilder(run, asyncId)

export const cancelAsync = <AsyncId extends string = string>(
  asyncId: AsyncId,
): Effect<CancelAsyncEffectData<AsyncId>> => effect("cancelAsync", { asyncId })

export const debounceAsync = <Resolved, AsyncId extends string = string>(
  run: DebounceAsyncRun<Resolved>,
  options: DebounceAsyncOptions<AsyncId>,
): DebounceAsyncBuilder<Resolved, AsyncId> =>
  createDebounceAsyncBuilder(run, options)

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
  bridge?: ResourceBridgeData<Value>
  key: Key
  teardown?: (value: Value) => void
  value: Value
}

export type ResourceBridgePace = "latest" | { debounceMs: number }

type ResourceBridgeFilter<Event> = (event: Event) => boolean

type ResourceBridgeRejectHandler<
  RejectedAction extends Action<string, unknown> | void,
> = (reason: unknown) => RejectedAction

type ResourceBridgeResolveHandler<
  Event,
  ResolvedAction extends Action<string, unknown> | void,
> = (event: Event) => ResolvedAction

type ResourceBridgeSubscribe<Value, Event> = (
  value: Value,
  onEvent: (event: Event) => void,
) => () => void

type ResourceBridgeOptionsBase<Value, Event> = {
  filter?: ResourceBridgeFilter<Event>
  pace?: ResourceBridgePace
  subscribe?: ResourceBridgeSubscribe<Value, Event>
}

export type ResourceBridgeOptions<Value, Event> =
  | (ResourceBridgeOptionsBase<Value, Event> & {
      filter: ResourceBridgeFilter<Event>
    })
  | (ResourceBridgeOptionsBase<Value, Event> & {
      pace: ResourceBridgePace
    })
  | (ResourceBridgeOptionsBase<Value, Event> & {
      subscribe: ResourceBridgeSubscribe<Value, Event>
    })

export type ResourceBridgeData<
  Value = unknown,
  Event = unknown,
  ResolvedAction extends Action<string, unknown> | void = Action<
    string,
    unknown
  >,
  RejectedAction extends Action<string, unknown> | void = void,
> = {
  filter?: ResourceBridgeFilter<Event>
  handlers?: {
    reject?: ResourceBridgeRejectHandler<RejectedAction>
    resolve: ResourceBridgeResolveHandler<Event, ResolvedAction>
  }
  pace?: ResourceBridgePace
  subscribe?: ResourceBridgeSubscribe<Value, Event>
}

type ResourceBridgeBuilder<
  Key extends string,
  Value,
  Event = unknown,
  ResolvedAction extends Action<string, unknown> | void = void,
  RejectedAction extends Action<string, unknown> | void = void,
> = Effect<
  ResourceEffectData<Key, Value> & {
    bridge?: ResourceBridgeData<Value, Event, ResolvedAction, RejectedAction>
  }
> & {
  bridge: (
    options: ResourceBridgeOptions<Value, Event>,
  ) => ResourceBridgeBuilder<Key, Value, Event, ResolvedAction, RejectedAction>
  chainToAction: <
    NextResolvedAction extends Action<string, unknown> | void,
    NextRejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: ResourceBridgeResolveHandler<Event, NextResolvedAction>,
    reject?: ResourceBridgeRejectHandler<NextRejectedAction>,
  ) => ResourceBridgeBuilder<
    Key,
    Value,
    Event,
    NextResolvedAction,
    NextRejectedAction
  >
}

const createResourceBridgeBuilder = <
  Key extends string,
  Value,
  Event = unknown,
  ResolvedAction extends Action<string, unknown> | void = void,
  RejectedAction extends Action<string, unknown> | void = void,
>(data: {
  bridge?: ResourceBridgeData<Value, Event, ResolvedAction, RejectedAction>
  key: Key
  teardown?: (value: Value) => void
  value: Value
}): ResourceBridgeBuilder<
  Key,
  Value,
  Event,
  ResolvedAction,
  RejectedAction
> => {
  const resourceEffect = effect("resource", data) as ResourceBridgeBuilder<
    Key,
    Value,
    Event,
    ResolvedAction,
    RejectedAction
  >

  resourceEffect.bridge = options => {
    const nextBridge: ResourceBridgeData<
      Value,
      Event,
      ResolvedAction,
      RejectedAction
    > = data.bridge ? { ...data.bridge } : {}

    if (options.filter !== undefined) {
      nextBridge.filter = options.filter
    }

    if (options.pace !== undefined) {
      nextBridge.pace = options.pace
    }

    if (options.subscribe !== undefined) {
      nextBridge.subscribe = options.subscribe
    }

    return createResourceBridgeBuilder({
      ...data,
      bridge: nextBridge,
    })
  }

  resourceEffect.chainToAction = <
    NextResolvedAction extends Action<string, unknown> | void,
    NextRejectedAction extends Action<string, unknown> | void = void,
  >(
    resolve: ResourceBridgeResolveHandler<Event, NextResolvedAction>,
    reject?: ResourceBridgeRejectHandler<NextRejectedAction>,
  ) => {
    const nextBridge: ResourceBridgeData<
      Value,
      Event,
      NextResolvedAction,
      NextRejectedAction
    > = {}

    if (data.bridge?.filter !== undefined) {
      nextBridge.filter = data.bridge.filter
    }

    if (data.bridge?.pace !== undefined) {
      nextBridge.pace = data.bridge.pace
    }

    if (data.bridge?.subscribe !== undefined) {
      nextBridge.subscribe = data.bridge.subscribe
    }

    nextBridge.handlers =
      reject === undefined ? { resolve } : { reject, resolve }

    return createResourceBridgeBuilder({
      ...data,
      bridge: nextBridge,
    })
  }

  return resourceEffect
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
): ResourceBridgeBuilder<Key, Value> =>
  createResourceBridgeBuilder(
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

export type HistoryPushStateEffectData = {
  state: unknown
  url?: string
}

export type HistoryReplaceStateEffectData = {
  state: unknown
  url?: string
}

export type HistorySetScrollRestorationEffectData = {
  value: ScrollRestoration
}

export type LocationAssignEffectData = {
  url: string
}

export type LocationReplaceEffectData = {
  url: string
}

export type LocationSetHashEffectData = { hash: string }
export type LocationSetHostEffectData = { host: string }
export type LocationSetHostnameEffectData = { hostname: string }
export type LocationSetHrefEffectData = { href: string }
export type LocationSetPathnameEffectData = { pathname: string }
export type LocationSetPortEffectData = { port: string }
export type LocationSetProtocolEffectData = { protocol: string }
export type LocationSetSearchEffectData = { search: string }

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
): Effect<OpenUrlEffectData> =>
  effect("openUrl", {
    ...(features === undefined ? {} : { features }),
    ...(target === undefined ? {} : { target }),
    url,
  })

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

export const historyPushState = (
  state: unknown,
  url?: string,
): Effect<HistoryPushStateEffectData> =>
  effect("historyPushState", {
    state,
    ...(url === undefined ? {} : { url }),
  })

export const historyReplaceState = (
  state: unknown,
  url?: string,
): Effect<HistoryReplaceStateEffectData> =>
  effect("historyReplaceState", {
    state,
    ...(url === undefined ? {} : { url }),
  })

export const historySetScrollRestoration = (
  value: ScrollRestoration,
): Effect<HistorySetScrollRestorationEffectData> =>
  effect("historySetScrollRestoration", { value })

export const locationSetHash = (
  hash: string,
): Effect<LocationSetHashEffectData> => effect("locationSetHash", { hash })

export const locationSetHost = (
  host: string,
): Effect<LocationSetHostEffectData> => effect("locationSetHost", { host })

export const locationSetHostname = (
  hostname: string,
): Effect<LocationSetHostnameEffectData> =>
  effect("locationSetHostname", { hostname })

export const locationSetHref = (
  href: string,
): Effect<LocationSetHrefEffectData> => effect("locationSetHref", { href })

export const locationSetPathname = (
  pathname: string,
): Effect<LocationSetPathnameEffectData> =>
  effect("locationSetPathname", { pathname })

export const locationSetPort = (
  port: string,
): Effect<LocationSetPortEffectData> => effect("locationSetPort", { port })

export const locationSetProtocol = (
  protocol: string,
): Effect<LocationSetProtocolEffectData> =>
  effect("locationSetProtocol", { protocol })

export const locationSetSearch = (
  search: string,
): Effect<LocationSetSearchEffectData> =>
  effect("locationSetSearch", { search })

export const postMessage = (
  message: unknown,
  targetOrigin: string,
  transfer?: Transferable[],
): Effect<PostMessageEffectData> =>
  effect("postMessage", {
    message,
    targetOrigin,
    ...(transfer === undefined ? {} : { transfer }),
  })

export const timeout = <A extends Action<string, unknown>>(
  ms: number,
  action: A,
): Promise<A> =>
  new Promise(resolve => {
    setTimeout(() => {
      resolve(action)
    }, ms)
  })
