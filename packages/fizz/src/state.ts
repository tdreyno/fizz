import type {
  Action,
  ActionCreator,
  ActionCreatorType,
  ActionName,
  ActionPayload,
  AsyncCancelled,
  BeforeEnter,
  ConfirmAccepted,
  ConfirmRejected,
  Enter,
  GetActionCreatorType,
  IntervalCancelled,
  IntervalPayload,
  IntervalStarted,
  IntervalTriggered,
  PromptCancelled,
  PromptSubmitted,
  TimerCancelled,
  TimerCompleted,
  TimerPayload,
  TimerStarted,
} from "./action.js"
import { action, enter } from "./action.js"
import { createInitialContext } from "./context.js"
import type { StartAsyncEffectCreator } from "./effect.js"
import {
  cancelAsync as cancelAsyncEffect,
  cancelFrame as cancelFrameEffect,
  cancelInterval as cancelIntervalEffect,
  cancelTimer as cancelTimerEffect,
  Effect,
  noop,
  output,
  restartInterval as restartIntervalEffect,
  restartTimer as restartTimerEffect,
  startAsync as startAsyncEffect,
  startFrame as startFrameEffect,
  startInterval as startIntervalEffect,
  startTimer as startTimerEffect,
} from "./effect.js"
import { Runtime } from "./runtime.js"
import type { WrappedHandlerMachine } from "./runtime/wrappedHandlerMachine.js"
import {
  activateWrappedHandler,
  createWrappedHandlerMachine,
  fireAndResetWrappedHandler,
  fireAndRestartWrappedHandler,
  isWrappedHandlerIdle,
  isWrappedHandlerPending,
  resetWrappedHandler,
  setPendingWrappedHandler,
} from "./runtime/wrappedHandlerMachine.js"
import { getStateResources } from "./stateResources.js"

/**
 * States can return either:
 *
 * - An effect to run async
 * - An action to run async
 * - The next state to enter
 */
export type StateReturn =
  | Effect
  | Action<string, unknown>
  | StateTransition<any, any, any>

type TimerActions<TimeoutId extends string> =
  | TimerStarted<TimeoutId>
  | TimerCompleted<TimeoutId>
  | TimerCancelled<TimeoutId>

type IntervalActions<IntervalId extends string> =
  | IntervalStarted<IntervalId>
  | IntervalTriggered<IntervalId>
  | IntervalCancelled<IntervalId>

type AsyncActions<AsyncId extends string> = AsyncCancelled<AsyncId>

type BrowserResolutionActions =
  | ConfirmAccepted
  | ConfirmRejected
  | PromptSubmitted
  | PromptCancelled

type ScheduledActions<
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> =
  | TimerActions<TimeoutId>
  | IntervalActions<IntervalId>
  | AsyncActions<AsyncId>
  | BrowserResolutionActions

type WithScheduledActions<
  Actions extends Action<string, unknown>,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = Actions | ScheduledActions<TimeoutId, IntervalId, AsyncId>

type StateUtils<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
> = {
  update: (
    data: Data,
  ) => StateTransition<
    Name,
    WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
    Data
  >
  parentRuntime?: InternalRuntime
  trigger: (
    action: WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
  ) => void
  cancelAsync: (asyncId: AsyncId) => Effect
  startAsync: StartAsyncEffectCreator<AsyncId>
  startTimer: (timeoutId: TimeoutId, delay: number) => Effect
  cancelTimer: (timeoutId: TimeoutId) => Effect
  restartTimer: (timeoutId: TimeoutId, delay: number) => Effect
  startInterval: (intervalId: IntervalId, delay: number) => Effect
  cancelInterval: (intervalId: IntervalId) => Effect
  restartInterval: (intervalId: IntervalId, delay: number) => Effect
  startFrame: () => Effect
  cancelFrame: () => Effect
  clients: Clients
  resources: Resources
}

type Handler<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
  A extends WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId> =
    WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
> = (
  data: Data,
  payload: ActionPayload<A>,
  utils: StateUtils<
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    Resources,
    Clients
  >,
) => HandlerReturn

type WrappedHandlerMode = "debounce" | "throttle"

type DebounceHandlerOptions = {
  delay: number
}

type ThrottleHandlerOptions = {
  delay: number
  leading?: boolean
  trailing?: boolean
}

type NormalizedWrappedHandlerOptions = {
  delay: number
  leading: boolean
  trailing: boolean
}

type InternalRuntime = Runtime<any, any>

type LooseHandler = (
  data: any,
  payload: any,
  utils: any,
  runtime?: InternalRuntime,
) => HandlerReturn

// WrappedHandlerRuntimeState is now WrappedHandlerMachine<Payload> from wrappedHandlerMachine.ts

const wrappedHandlerSymbol = Symbol("wrapped handler")
const scheduledMatcherSymbol = Symbol("scheduled matcher")

type WrappedHandler<T extends LooseHandler> = {
  kind: "wrapped-handler"
  handler: T
  mode: WrappedHandlerMode
  options: NormalizedWrappedHandlerOptions
  [wrappedHandlerSymbol]: {
    id: number
    runtimeStates: WeakMap<
      InternalRuntime,
      WrappedHandlerMachine<Parameters<T>[1]>
    >
  }
}

type AnyWrappedHandler = WrappedHandler<LooseHandler>

type AnyHandlerValue = LooseHandler | AnyWrappedHandler

type HandlerValue<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
  A extends WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId> =
    WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
> =
  | Handler<
      Name,
      Actions,
      Data,
      TimeoutId,
      IntervalId,
      AsyncId,
      Resources,
      Clients,
      A
    >
  | WrappedHandler<
      Handler<
        Name,
        Actions,
        Data,
        TimeoutId,
        IntervalId,
        AsyncId,
        Resources,
        Clients,
        A
      > &
        LooseHandler
    >

type StateHandlers<
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
> = {
  [A in Actions as ActionName<A>]: HandlerValue<
    string,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    Resources,
    Clients,
    A
  >
} & {
  [A in ScheduledActions<
    TimeoutId,
    IntervalId,
    AsyncId
  > as ActionName<A>]?: HandlerValue<
    string,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    Resources,
    Clients,
    A
  >
}

type TimeoutScheduledPayload<
  TimeoutId extends string,
  K extends TimeoutId = TimeoutId,
> = TimerPayload<K>

type IntervalScheduledPayload<
  IntervalId extends string,
  K extends IntervalId = IntervalId,
> = IntervalPayload<K>

type ScheduledBranch<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  Payload,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = (
  data: Data,
  payload: Payload,
  utils: StateUtils<Name, Actions, Data, TimeoutId, IntervalId, AsyncId>,
) => HandlerReturn

type TimeoutScheduledBranchValue<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
  K extends Id,
> =
  | ScheduledBranch<
      Name,
      Actions,
      Data,
      TimeoutScheduledPayload<Id, K>,
      TimeoutId,
      IntervalId,
      AsyncId
    >
  | WrappedHandler<
      ScheduledBranch<
        Name,
        Actions,
        Data,
        TimeoutScheduledPayload<Id, K>,
        TimeoutId,
        IntervalId,
        AsyncId
      > &
        LooseHandler
    >

type TimeoutScheduledBranchMap<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = {
  [K in Id]: TimeoutScheduledBranchValue<
    Id,
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    K
  >
}

type IntervalScheduledBranchValue<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
  K extends Id,
> =
  | ScheduledBranch<
      Name,
      Actions,
      Data,
      IntervalScheduledPayload<Id, K>,
      TimeoutId,
      IntervalId,
      AsyncId
    >
  | WrappedHandler<
      ScheduledBranch<
        Name,
        Actions,
        Data,
        IntervalScheduledPayload<Id, K>,
        TimeoutId,
        IntervalId,
        AsyncId
      > &
        LooseHandler
    >

type IntervalScheduledBranchMap<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = {
  [K in Id]: IntervalScheduledBranchValue<
    Id,
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    K
  >
}

type TimeoutScheduledHandler<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = ScheduledBranch<
  Name,
  Actions,
  Data,
  TimeoutScheduledPayload<Id>,
  TimeoutId,
  IntervalId,
  AsyncId
>

type IntervalScheduledHandler<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = ScheduledBranch<
  Name,
  Actions,
  Data,
  IntervalScheduledPayload<Id>,
  TimeoutId,
  IntervalId,
  AsyncId
>

type SyncHandlerReturn = void | StateReturn | Array<StateReturn>
export type HandlerReturn = SyncHandlerReturn | Promise<SyncHandlerReturn>

let wrappedHandlerCounter = 1

const normalizeDebounceOptions = (
  options: number | DebounceHandlerOptions,
): NormalizedWrappedHandlerOptions => ({
  delay: typeof options === "number" ? options : options.delay,
  leading: false,
  trailing: true,
})

const normalizeThrottleOptions = (
  options: number | ThrottleHandlerOptions,
): NormalizedWrappedHandlerOptions => {
  if (typeof options === "number") {
    return {
      delay: options,
      leading: true,
      trailing: true,
    }
  }

  return {
    delay: options.delay,
    leading: options.leading ?? true,
    trailing: options.trailing ?? true,
  }
}

const createWrappedHandler = <T extends LooseHandler>(
  handler: T,
  mode: WrappedHandlerMode,
  options: NormalizedWrappedHandlerOptions,
): WrappedHandler<T> => ({
  kind: "wrapped-handler",
  handler,
  mode,
  options,
  [wrappedHandlerSymbol]: {
    id: wrappedHandlerCounter++,
    runtimeStates: new WeakMap<
      InternalRuntime,
      WrappedHandlerMachine<Parameters<T>[1]>
    >(),
  },
})

export const debounce = <T extends LooseHandler>(
  handler: T,
  options: number | DebounceHandlerOptions,
): WrappedHandler<T> =>
  createWrappedHandler(handler, "debounce", normalizeDebounceOptions(options))

export const throttle = <T extends LooseHandler>(
  handler: T,
  options: number | ThrottleHandlerOptions,
): WrappedHandler<T> =>
  createWrappedHandler(handler, "throttle", normalizeThrottleOptions(options))

const isWrappedHandler = (
  handler: AnyHandlerValue,
): handler is AnyWrappedHandler =>
  typeof handler === "object" &&
  handler !== null &&
  "kind" in handler &&
  handler.kind === "wrapped-handler"

type ScheduledMatcherMetadata = {
  wrappedHandlers: AnyWrappedHandler[]
}

type TimeoutScheduledMatcher<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = TimeoutScheduledHandler<
  Id,
  Name,
  Actions,
  Data,
  TimeoutId,
  IntervalId,
  AsyncId
> & {
  [scheduledMatcherSymbol]?: ScheduledMatcherMetadata
}

type IntervalScheduledMatcher<
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
> = IntervalScheduledHandler<
  Id,
  Name,
  Actions,
  Data,
  TimeoutId,
  IntervalId,
  AsyncId
> & {
  [scheduledMatcherSymbol]?: ScheduledMatcherMetadata
}

type AnyScheduledMatcher =
  | TimeoutScheduledMatcher<
      string,
      string,
      Action<string, unknown>,
      unknown,
      string,
      string,
      string
    >
  | IntervalScheduledMatcher<
      string,
      string,
      Action<string, unknown>,
      unknown,
      string,
      string,
      string
    >

const isScheduledMatcher = (
  handler: AnyHandlerValue,
): handler is AnyScheduledMatcher =>
  typeof handler === "function" && scheduledMatcherSymbol in handler

const hasWrappedTimerPayload = (
  payload: unknown,
): payload is { timeoutId: string } =>
  typeof payload === "object" && payload !== null && "timeoutId" in payload

const toStateReturns = (result: SyncHandlerReturn): StateReturn[] => {
  if (!result) {
    return []
  }

  return Array.isArray(result) ? result : [result]
}

const prependStateReturns = (
  result: HandlerReturn,
  ...prefix: StateReturn[]
): HandlerReturn =>
  result instanceof Promise
    ? result.then(resolved => [...prefix, ...toStateReturns(resolved)])
    : [...prefix, ...toStateReturns(result)]

const getWrappedHandlerTimeoutId = (handler: AnyWrappedHandler) =>
  `__fizz_wrapped_handler__${handler[wrappedHandlerSymbol].id}`

const getWrappedHandlerRuntimeState = <T extends LooseHandler>(
  handler: WrappedHandler<T>,
  runtime: InternalRuntime,
): WrappedHandlerMachine<Parameters<T>[1]> => {
  const current = handler[wrappedHandlerSymbol].runtimeStates.get(runtime)

  if (current) {
    return current
  }

  const created = createWrappedHandlerMachine<Parameters<T>[1]>()

  handler[wrappedHandlerSymbol].runtimeStates.set(runtime, created)

  return created
}

const resetWrappedHandlerRuntimeState = (
  handler: AnyWrappedHandler,
  runtime: InternalRuntime,
) => {
  handler[wrappedHandlerSymbol].runtimeStates.delete(runtime)
}

const collectWrappedHandlers = (
  handlers: Record<string, AnyHandlerValue>,
): AnyWrappedHandler[] =>
  Object.values(handlers).reduce<AnyWrappedHandler[]>((wrapped, handler) => {
    if (isWrappedHandler(handler)) {
      return [...wrapped, handler]
    }

    if (typeof handler === "function" && isScheduledMatcher(handler)) {
      const scheduledMatcher = handler as AnyScheduledMatcher

      return [
        ...wrapped,
        ...(scheduledMatcher[scheduledMatcherSymbol]?.wrappedHandlers ?? []),
      ]
    }

    return wrapped
  }, [])

const runWrappedHandler = <T extends LooseHandler>(
  handler: WrappedHandler<T>,
  data: Parameters<T>[0],
  payload: Parameters<T>[1],
  utils: Parameters<T>[2],
  runtime?: InternalRuntime,
): HandlerReturn => {
  if (!runtime) {
    return handler.handler(data, payload, utils)
  }

  const machine = getWrappedHandlerRuntimeState(handler, runtime)
  const timerId = getWrappedHandlerTimeoutId(handler)
  const runtimeStates = handler[wrappedHandlerSymbol].runtimeStates

  if (handler.mode === "debounce") {
    runtimeStates.set(runtime, setPendingWrappedHandler(machine, payload))

    return restartTimerEffect(timerId, handler.options.delay)
  }

  if (isWrappedHandlerIdle(machine)) {
    if (handler.options.leading) {
      runtimeStates.set(runtime, activateWrappedHandler(machine))

      return prependStateReturns(
        handler.handler(data, payload, utils),
        startTimerEffect(timerId, handler.options.delay),
      )
    }

    if (handler.options.trailing) {
      runtimeStates.set(runtime, setPendingWrappedHandler(machine, payload))
    } else {
      runtimeStates.set(runtime, activateWrappedHandler(machine))
    }

    return startTimerEffect(timerId, handler.options.delay)
  }

  if (handler.options.trailing) {
    runtimeStates.set(runtime, setPendingWrappedHandler(machine, payload))
  }

  return undefined
}

const runWrappedHandlerTimerAction = <T extends LooseHandler>(
  handler: WrappedHandler<T>,
  actionType: string,
  data: Parameters<T>[0],
  utils: Parameters<T>[2],
  runtime?: InternalRuntime,
): HandlerReturn => {
  if (actionType !== "TimerCompleted" || !runtime) {
    return undefined
  }

  const machine = getWrappedHandlerRuntimeState(handler, runtime)
  const runtimeStates = handler[wrappedHandlerSymbol].runtimeStates

  if (handler.mode === "debounce") {
    if (!isWrappedHandlerPending(machine)) {
      runtimeStates.set(runtime, resetWrappedHandler(machine))
      return undefined
    }

    const [nextMachine, pendingPayload] = fireAndResetWrappedHandler(machine)
    runtimeStates.set(runtime, nextMachine)

    return handler.handler(data, pendingPayload, utils)
  }

  if (!isWrappedHandlerPending(machine)) {
    runtimeStates.set(runtime, resetWrappedHandler(machine))
    return undefined
  }

  const [nextMachine, pendingPayload] = fireAndRestartWrappedHandler(machine)
  runtimeStates.set(runtime, nextMachine)

  return prependStateReturns(
    handler.handler(data, pendingPayload, utils),
    startTimerEffect(
      getWrappedHandlerTimeoutId(handler),
      handler.options.delay,
    ),
  )
}

const runHandlerValue = <T extends LooseHandler>(
  handler: T | WrappedHandler<T>,
  data: Parameters<T>[0],
  payload: Parameters<T>[1],
  utils: Parameters<T>[2],
  runtime?: InternalRuntime,
): HandlerReturn => {
  if (isWrappedHandler(handler as AnyHandlerValue)) {
    return runWrappedHandler(
      handler as WrappedHandler<T>,
      data,
      payload,
      utils,
      runtime,
    )
  }

  return (handler as T)(data, payload, utils, runtime)
}

/**
 * State handlers are objects which contain a serializable list of bound
 * arguments and an executor function which is curried to contain those
 * args locked in. The executor can return 1 or more value StateReturn
 * value and can do so synchronously or async.
 */
export interface StateTransition<
  Name extends string,
  A extends Action<string, unknown>,
  Data,
> {
  name: Name
  data: Data
  isStateTransition: true
  mode: "append" | "update"
  executor: (action: A, runtime?: InternalRuntime) => HandlerReturn
  is<T extends BoundStateFn<any, A, any>>(state: T): this is ReturnType<T>
  isNamed(name: string): boolean
}

export type StateTransitionToBoundStateFn<
  S extends StateTransition<string, any, any>,
  N = S extends StateTransition<infer N, any, any> ? N : never,
  A = S extends StateTransition<any, infer A, any> ? A : never,
  D = S extends StateTransition<any, any, infer D> ? D : never,
> = BoundStateFn<N & string, A & Action<string, unknown>, D>

export const isStateTransition = (
  a: unknown,
): a is StateTransition<any, any, any> =>
  typeof a === "object" &&
  a !== null &&
  "isStateTransition" in a &&
  (a as { isStateTransition?: unknown }).isStateTransition === true

export const isState = <T extends BoundStateFn<any, any, any>>(
  current: StateTransition<any, any, any>,
  state: T,
): current is ReturnType<T> => current.is(state)

/**
 * A State function as written by the user. It accepts
 * the action to run and an arbitrary number of serializable
 * arguments.
 */
export type State<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string = string,
  IntervalId extends string = TimeoutId,
  AsyncId extends string = string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
> = (
  action: WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
  data: Data,
  utils: StateUtils<
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    Resources,
    Clients
  >,
) => HandlerReturn

export interface BoundStateFn<
  Name extends string,
  A extends Action<string, unknown>,
  Data = undefined,
> {
  (
    ...data: Data extends undefined ? [] : [Data]
  ): StateTransition<Name, A, Data>
  name: Name
}

export type GetStateData<
  S extends BoundStateFn<any, any, any>,
  D = S extends BoundStateFn<any, any, infer D> ? D : never,
> = D

export const PARENT_RUNTIME = Symbol("Parent runtime")

export const stateWrapper = <
  Name extends string,
  A extends Action<string, unknown>,
  Data = undefined,
  TimeoutId extends string = string,
  IntervalId extends string = TimeoutId,
  AsyncId extends string = string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
>(
  name: Name,
  executor: (
    action: A,
    data: Data,
    utils: {
      update: (data: Data) => StateTransition<Name, A, Data>
      parentRuntime?: InternalRuntime
      trigger: (action: A) => void
      cancelAsync: (asyncId: AsyncId) => Effect
      startAsync: StartAsyncEffectCreator<AsyncId>
      startTimer: (timeoutId: TimeoutId, delay: number) => Effect
      cancelTimer: (timeoutId: TimeoutId) => Effect
      restartTimer: (timeoutId: TimeoutId, delay: number) => Effect
      startInterval: (intervalId: IntervalId, delay: number) => Effect
      cancelInterval: (intervalId: IntervalId) => Effect
      restartInterval: (intervalId: IntervalId, delay: number) => Effect
      startFrame: () => Effect
      cancelFrame: () => Effect
      clients: Clients
      resources: Resources
    },
    runtime?: InternalRuntime,
  ) => HandlerReturn,
): BoundStateFn<Name, A, Data> => {
  const fn = (data: Data) => {
    const transition: StateTransition<Name, A, Data> = {
      name,
      data,
      isStateTransition: true,
      mode: "append",

      is<T extends BoundStateFn<any, A, any>>(
        testState: T,
      ): this is ReturnType<T> {
        return testState === fn
      },

      executor: (action: A, runtime?: InternalRuntime) => {
        const parentRuntime: InternalRuntime | undefined =
          typeof data === "object" && data !== null && PARENT_RUNTIME in data
            ? ((data as { [PARENT_RUNTIME]?: ActionPayload<BeforeEnter> })[
                PARENT_RUNTIME
              ] as InternalRuntime | undefined)
            : undefined

        // Run state executor
        return executor(
          action,
          data,
          {
            update,
            trigger: (a: A) => {
              void runtime?.run(a)
            },
            cancelAsync: (asyncId: AsyncId) => cancelAsyncEffect(asyncId),
            startAsync: (run, asyncId) => startAsyncEffect(run, asyncId),
            startTimer: (timeoutId: TimeoutId, delay: number) =>
              startTimerEffect(timeoutId, delay),
            cancelTimer: (timeoutId: TimeoutId) => cancelTimerEffect(timeoutId),
            restartTimer: (timeoutId: TimeoutId, delay: number) =>
              restartTimerEffect(timeoutId, delay),
            startInterval: (intervalId: IntervalId, delay: number) =>
              startIntervalEffect(intervalId, delay),
            cancelInterval: (intervalId: IntervalId) =>
              cancelIntervalEffect(intervalId),
            restartInterval: (intervalId: IntervalId, delay: number) =>
              restartIntervalEffect(intervalId, delay),
            startFrame: () => startFrameEffect(),
            cancelFrame: () => cancelFrameEffect(),
            clients: (runtime?.clients ?? {}) as Clients,
            resources: getStateResources(
              transition as unknown as StateTransition<
                string,
                Action<string, unknown>,
                unknown
              >,
            ) as Resources,
            ...(parentRuntime ? { parentRuntime } : {}),
          },
          runtime,
        )
      },

      isNamed: (testName: string): boolean => testName === name,
    }

    return transition
  }

  Object.defineProperty(fn, "name", { value: name })

  const update = (data: Data): StateTransition<Name, A, Data> => {
    const bound = fn(data)
    bound.mode = "update"
    return bound as unknown as StateTransition<Name, A, Data>
  }

  return fn as unknown as BoundStateFn<Name, A, Data>
}

const matchAction =
  <
    Actions extends Action<string, unknown>,
    Data,
    TimeoutId extends string,
    IntervalId extends string,
    AsyncId extends string,
    Resources extends Record<string, unknown> = Record<string, unknown>,
    Clients extends Record<string, unknown> = Record<string, unknown>,
  >(
    handlers: StateHandlers<
      Actions,
      Data,
      TimeoutId,
      IntervalId,
      AsyncId,
      Resources,
      Clients
    >,
  ) =>
  (
    action: WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
    data: Data,
    utils: StateUtils<
      string,
      Actions,
      Data,
      TimeoutId,
      IntervalId,
      AsyncId,
      Resources,
      Clients
    >,
    runtime?: InternalRuntime,
  ): HandlerReturn => {
    const wrappedHandlers = collectWrappedHandlers(
      handlers as Record<string, AnyHandlerValue>,
    )
    const wrappedTimerPayload = hasWrappedTimerPayload(action.payload)
      ? action.payload
      : undefined

    if (runtime && (action.type === "Enter" || action.type === "BeforeEnter")) {
      wrappedHandlers.forEach(handler => {
        resetWrappedHandlerRuntimeState(handler, runtime)
      })
    }

    if (
      (action.type === "TimerStarted" ||
        action.type === "TimerCancelled" ||
        action.type === "TimerCompleted") &&
      wrappedTimerPayload
    ) {
      const wrappedHandler = wrappedHandlers.find(
        handler =>
          getWrappedHandlerTimeoutId(handler) === wrappedTimerPayload.timeoutId,
      )

      if (wrappedHandler) {
        return runWrappedHandlerTimerAction(
          wrappedHandler,
          action.type,
          data,
          utils as never,
          runtime,
        )
      }
    }

    const handler = (handlers as never)[action.type] as
      | AnyHandlerValue
      | undefined

    if (!handler) {
      return undefined
    }

    return runHandlerValue(
      handler,
      data,
      action.payload as never,
      utils as never,
      runtime,
    )
  }

let counter = 1

export const state = <
  Actions extends Action<string, unknown>,
  Data = undefined,
  TimeoutId extends string = string,
  IntervalId extends string = TimeoutId,
  AsyncId extends string = string,
  Resources extends Record<string, unknown> = Record<string, unknown>,
  Clients extends Record<string, unknown> = Record<string, unknown>,
>(
  handlers: StateHandlers<
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    Resources,
    Clients
  >,
  options?: { name?: string },
): BoundStateFn<
  string,
  WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
  Data
> =>
  stateWrapper<
    string,
    WithScheduledActions<Actions, TimeoutId, IntervalId, AsyncId>,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId,
    Resources,
    Clients
  >(options?.name ?? `AnonymousState${counter++}`, matchAction(handlers))

export const NESTED = Symbol("Nested runtime")

type NestedActionMap = {
  [key: string]: ActionCreator<string, unknown>
}

type NestedRuntimeHandle<Actions extends Action<string, unknown>> = {
  run: (action: Actions) => Promise<void>
}

type NestedRuntimeData<Actions extends Action<string, unknown>> = {
  [NESTED]?: NestedRuntimeHandle<Actions>
}

type NestedUpdateUtils<Actions extends Action<string, unknown>, Data> = {
  update: (data: Data) => StateTransition<string, Actions, Data>
}

type NestedForwarder<
  Actions extends Action<string, unknown>,
  Data,
  A extends Action<string, unknown>,
> = (
  data: Data,
  payload: ActionPayload<A>,
  utils: NestedUpdateUtils<Actions, Data>,
) => HandlerReturn

type NestedForwarders<
  Actions extends Action<string, unknown>,
  Data,
  NAM extends NestedActionMap,
> = {
  [K in keyof NAM]?: NestedForwarder<Actions, Data, ActionCreatorType<NAM[K]>>
}

export const stateWithNested = <
  Actions extends Action<string, unknown>,
  NAM extends NestedActionMap,
  Data = undefined,
>(
  handlers: {
    [A in Actions as ActionName<A>]: (
      data: Data,
      payload: ActionPayload<A>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => HandlerReturn
  },
  initialNestedState: StateTransition<string, Action<string, unknown>, unknown>,
  nestedActions: NAM,
  options?: { name?: string },
) => {
  const beforeEnter = async (
    data: Data,
    parentRuntime: ActionPayload<BeforeEnter>,
    { update }: NestedUpdateUtils<Actions, Data>,
  ): Promise<SyncHandlerReturn> => {
    if (!parentRuntime) {
      return noop()
    }

    if (
      typeof initialNestedState.data === "object" &&
      initialNestedState.data !== null
    ) {
      ;(
        initialNestedState.data as {
          [PARENT_RUNTIME]?: ActionPayload<BeforeEnter>
        }
      )[PARENT_RUNTIME] = parentRuntime
    }

    const runtime = new Runtime(
      createInitialContext([initialNestedState]),
      nestedActions,
    )

    await runtime.run(enter())

    return update({
      ...data,
      [NESTED]: runtime,
    })
  }

  const forwarders = Object.entries(nestedActions).reduce(
    (acc, [key, action]) => {
      const typedKey = key as keyof NAM
      const typedAction = action as NAM[typeof typedKey]

      acc[typedKey] = (async (data, payload, { update }) => {
        const nestedRuntime =
          typeof data === "object" && data !== null && NESTED in data
            ? (data as NestedRuntimeData<Actions>)[NESTED]
            : undefined

        if (nestedRuntime) {
          await nestedRuntime.run(
            typedAction(payload) as ActionCreatorType<
              NAM[typeof typedKey]
            > as Actions,
          )
        }

        // Force update
        return update({ ...data })
      }) as NestedForwarders<Actions, Data, NAM>[typeof typedKey]

      return acc
    },
    {} as NestedForwarders<Actions, Data, NAM>,
  )

  return state<Actions, Data>(
    { ...handlers, ...forwarders, BeforeEnter: beforeEnter },
    options,
  )
}

type AnyStateTransition = StateTransition<string, any, any>
type MatcherStateKey = BoundStateFn<any, any, any>
type MatcherStoredHandler<T> = (data: unknown) => T

class Matcher<S extends AnyStateTransition, T> {
  private readonly handlers = new Map<
    MatcherStateKey,
    MatcherStoredHandler<T>
  >()

  constructor(private readonly state: S) {}

  case_<S2 extends StateTransitionToBoundStateFn<S>>(
    state: S2,
    handler: (data: GetStateData<S2>) => T,
  ) {
    this.handlers.set(
      state as MatcherStateKey,
      handler as MatcherStoredHandler<T>,
    )
    return this
  }

  run(): T | undefined {
    const entry = [...this.handlers.entries()].find(([state]) =>
      this.state.is(state),
    )

    if (!entry) {
      return
    }

    const [, handler] = entry

    return handler(this.state.data)
  }
}

export const switch_ = <T, S extends AnyStateTransition>(state: S) =>
  new Matcher<S, T>(state)

const createTimeoutMatcher = <
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
>(
  handlers: TimeoutScheduledBranchMap<
    Id,
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId
  >,
): TimeoutScheduledMatcher<
  Id,
  Name,
  Actions,
  Data,
  TimeoutId,
  IntervalId,
  AsyncId
> => {
  const matcher = ((
    data: Data,
    payload: TimeoutScheduledPayload<Id>,
    utils: StateUtils<Name, Actions, Data, TimeoutId, IntervalId, AsyncId>,
    runtime?: InternalRuntime,
  ) => {
    const handler = handlers[payload.timeoutId]

    return runHandlerValue(handler, data, payload, utils, runtime)
  }) as TimeoutScheduledMatcher<
    Id,
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId
  >

  matcher[scheduledMatcherSymbol] = {
    wrappedHandlers: collectWrappedHandlers(
      handlers as Record<string, AnyHandlerValue>,
    ),
  }

  return matcher
}

const createIntervalMatcher = <
  Id extends string,
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  AsyncId extends string,
>(
  handlers: IntervalScheduledBranchMap<
    Id,
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId
  >,
): IntervalScheduledMatcher<
  Id,
  Name,
  Actions,
  Data,
  TimeoutId,
  IntervalId,
  AsyncId
> => {
  const matcher = ((
    data: Data,
    payload: IntervalScheduledPayload<Id>,
    utils: StateUtils<Name, Actions, Data, TimeoutId, IntervalId, AsyncId>,
    runtime?: InternalRuntime,
  ) => {
    const handler = handlers[payload.intervalId]

    return runHandlerValue(handler, data, payload, utils, runtime)
  }) as IntervalScheduledMatcher<
    Id,
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    AsyncId
  >

  matcher[scheduledMatcherSymbol] = {
    wrappedHandlers: collectWrappedHandlers(
      handlers as Record<string, AnyHandlerValue>,
    ),
  }

  return matcher
}

export const whichTimeout = <TimeoutId extends string>(
  handlers: TimeoutScheduledBranchMap<
    TimeoutId,
    string,
    any,
    any,
    TimeoutId,
    any,
    any
  >,
): (<
  Actions extends Action<string, unknown>,
  Data,
  IntervalId extends string,
  AsyncId extends string,
>(
  data: Data,
  payload: TimeoutScheduledPayload<TimeoutId>,
  utils: StateUtils<string, Actions, Data, TimeoutId, IntervalId, AsyncId>,
) => HandlerReturn) => createTimeoutMatcher(handlers as never) as never

export const whichInterval = <IntervalId extends string>(
  handlers: IntervalScheduledBranchMap<
    IntervalId,
    string,
    any,
    any,
    any,
    IntervalId,
    any
  >,
): (<
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  AsyncId extends string,
>(
  data: Data,
  payload: IntervalScheduledPayload<IntervalId>,
  utils: StateUtils<string, Actions, Data, TimeoutId, IntervalId, AsyncId>,
) => HandlerReturn) => createIntervalMatcher(handlers as never) as never

const timedOut = action("TimedOut")
type TimedOut = ActionCreatorType<typeof timedOut>

export type WaitStateTimeout =
  | number
  | {
      delay: number
      id?: string
    }

export const waitState = <
  Data,
  ReqAC extends ActionCreator<string, any>,
  ReqA extends ActionCreatorType<ReqAC>,
  RespAC extends ActionCreator<string, any> & GetActionCreatorType<string>,
  RespA extends ActionCreatorType<RespAC>,
>(
  requestAction: ReqAC,
  responseActionCreator: RespAC,
  transition: (data: Data, payload: RespA["payload"]) => HandlerReturn,
  options?: {
    name?: string
    timeout?: WaitStateTimeout
    onTimeout?: (data: Data) => HandlerReturn
  },
) => {
  const name = options?.name
  const timeoutOption = options?.timeout
  let schedulerTimeout: Exclude<WaitStateTimeout, number> | undefined

  if (timeoutOption && typeof timeoutOption === "object") {
    schedulerTimeout = timeoutOption
  }

  const schedulerTimeoutId = schedulerTimeout
    ? (schedulerTimeout.id ??
      `wait-state:${name ?? responseActionCreator.type}`)
    : undefined

  return state<Enter | TimedOut, [Data, ReqA["payload"]]>(
    {
      Enter: ([, payload], _, { trigger, startTimer }) => {
        if (typeof timeoutOption === "number" && timeoutOption > 0) {
          setTimeout(() => {
            trigger(timedOut())
          }, timeoutOption)
        }

        if (schedulerTimeout && schedulerTimeoutId) {
          return [
            startTimer(schedulerTimeoutId, schedulerTimeout.delay),
            output(requestAction(payload)),
          ]
        }

        return output(requestAction(payload))
      },

      TimerCompleted: ([data], payload: TimerPayload<string>) => {
        if (!schedulerTimeoutId || payload.timeoutId !== schedulerTimeoutId) {
          return noop()
        }

        if (options?.onTimeout) {
          return options.onTimeout(data)
        }

        return noop()
      },

      TimedOut: ([data]) => {
        if (options?.onTimeout) {
          return options?.onTimeout(data)
        }

        return noop()
      },

      [responseActionCreator.type]: (
        [data]: [Data],
        payload: RespA["payload"],
      ) => {
        return transition(data, payload)
      },
    },
    name ? { name } : {},
  )
}
