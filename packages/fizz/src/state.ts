import type {
  Action,
  ActionCreator,
  ActionCreatorType,
  ActionName,
  ActionPayload,
  BeforeEnter,
  Enter,
  GetActionCreatorType,
  IntervalCancelled,
  IntervalStarted,
  IntervalTriggered,
  TimerCancelled,
  TimerCompleted,
  TimerPayload,
  TimerStarted,
} from "./action.js"
import { createAction, enter } from "./action.js"
import { createInitialContext } from "./context.js"
import {
  cancelFrame as cancelFrameEffect,
  cancelInterval as cancelIntervalEffect,
  cancelTimer as cancelTimerEffect,
  Effect,
  noop,
  output,
  restartInterval as restartIntervalEffect,
  restartTimer as restartTimerEffect,
  startFrame as startFrameEffect,
  startInterval as startIntervalEffect,
  startTimer as startTimerEffect,
} from "./effect.js"
import { createRuntime, Runtime } from "./runtime.js"

/**
 * States can return either:
 *
 * - An effect to run async
 * - An action to run async
 * - The next state to enter
 */
export type StateReturn =
  | Effect
  | Action<any, any>
  | StateTransition<any, any, any>

type TimerActions<TimeoutId extends string> =
  | TimerStarted<TimeoutId>
  | TimerCompleted<TimeoutId>
  | TimerCancelled<TimeoutId>

type IntervalActions<IntervalId extends string> =
  | IntervalStarted<IntervalId>
  | IntervalTriggered<IntervalId>
  | IntervalCancelled<IntervalId>

type ScheduledActions<TimeoutId extends string, IntervalId extends string> =
  | TimerActions<TimeoutId>
  | IntervalActions<IntervalId>

type WithScheduledActions<
  Actions extends Action<string, unknown>,
  TimeoutId extends string,
  IntervalId extends string,
> = Actions | ScheduledActions<TimeoutId, IntervalId>

type StateUtils<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
> = {
  update: (
    data: Data,
  ) => StateTransition<
    Name,
    WithScheduledActions<Actions, TimeoutId, IntervalId>,
    Data
  >
  parentRuntime?: Runtime<any, any>
  trigger: (
    action: WithScheduledActions<Actions, TimeoutId, IntervalId>,
  ) => void
  startTimer: (timeoutId: TimeoutId, delay: number) => Effect
  cancelTimer: (timeoutId: TimeoutId) => Effect
  restartTimer: (timeoutId: TimeoutId, delay: number) => Effect
  startInterval: (intervalId: IntervalId, delay: number) => Effect
  cancelInterval: (intervalId: IntervalId) => Effect
  restartInterval: (intervalId: IntervalId, delay: number) => Effect
  startFrame: () => Effect
  cancelFrame: () => Effect
}

type Handler<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  A extends WithScheduledActions<Actions, TimeoutId, IntervalId>,
> = (
  data: Data,
  payload: ActionPayload<A>,
  utils: StateUtils<Name, Actions, Data, TimeoutId, IntervalId>,
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

type WrappedHandlerRuntimeState = {
  active: boolean
  hasPendingPayload: boolean
  pendingPayload: unknown
}

const wrappedHandlerSymbol = Symbol("wrapped handler")
const scheduledMatcherSymbol = Symbol("scheduled matcher")

type WrappedHandler<T extends (...args: any[]) => HandlerReturn> = {
  kind: "wrapped-handler"
  handler: T
  mode: WrappedHandlerMode
  options: NormalizedWrappedHandlerOptions
  [wrappedHandlerSymbol]: {
    id: number
    runtimeStates: WeakMap<Runtime<any, any>, WrappedHandlerRuntimeState>
  }
}

type AnyWrappedHandler = WrappedHandler<(...args: any[]) => HandlerReturn>

type AnyHandler = (...args: any[]) => HandlerReturn

type AnyHandlerValue = AnyHandler | AnyWrappedHandler

type HandlerValue<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  A extends WithScheduledActions<Actions, TimeoutId, IntervalId>,
> =
  | Handler<Name, Actions, Data, TimeoutId, IntervalId, A>
  | WrappedHandler<
      Handler<Name, Actions, Data, TimeoutId, IntervalId, A> &
        ((...args: any[]) => HandlerReturn)
    >

type StateHandlers<
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
> = {
  [A in Actions as ActionName<A>]: HandlerValue<
    string,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    A
  >
} & {
  [A in ScheduledActions<
    TimeoutId,
    IntervalId
  > as ActionName<A>]?: HandlerValue<
    string,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    A
  >
}

type ScheduledPayload<
  TimeoutId extends string,
  K extends TimeoutId = TimeoutId,
> = TimerPayload<K>

type ScheduledBranch<
  Id extends string,
  TimeoutId extends string,
  IntervalId extends string,
  K extends Id,
> = (
  data: any,
  payload: ScheduledPayload<Id, K>,
  utils: StateUtils<string, any, any, TimeoutId, IntervalId>,
) => HandlerReturn

type ScheduledBranchValue<
  Id extends string,
  TimeoutId extends string,
  IntervalId extends string,
  K extends Id,
> =
  | ScheduledBranch<Id, TimeoutId, IntervalId, K>
  | WrappedHandler<
      ScheduledBranch<Id, TimeoutId, IntervalId, K> &
        ((...args: any[]) => HandlerReturn)
    >

type ScheduledBranchMap<
  Id extends string,
  TimeoutId extends string,
  IntervalId extends string,
> = {
  [K in Id]: ScheduledBranchValue<Id, TimeoutId, IntervalId, K>
}

type ScheduledHandler<
  Id extends string,
  TimeoutId extends string,
  IntervalId extends string,
> = (
  data: any,
  payload: ScheduledPayload<Id>,
  utils: StateUtils<string, any, any, TimeoutId, IntervalId>,
) => HandlerReturn

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

const createWrappedHandler = <T extends (...args: any[]) => HandlerReturn>(
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
    runtimeStates: new WeakMap<Runtime<any, any>, WrappedHandlerRuntimeState>(),
  },
})

export const debounce = <T extends (...args: any[]) => HandlerReturn>(
  handler: T,
  options: number | DebounceHandlerOptions,
): WrappedHandler<T> =>
  createWrappedHandler(handler, "debounce", normalizeDebounceOptions(options))

export const throttle = <T extends (...args: any[]) => HandlerReturn>(
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

type ScheduledMatcher<
  Id extends string,
  TimeoutId extends string,
  IntervalId extends string,
> = ScheduledHandler<Id, TimeoutId, IntervalId> & {
  [scheduledMatcherSymbol]?: ScheduledMatcherMetadata
}

type AnyScheduledMatcher = ScheduledMatcher<string, string, string>

const isScheduledMatcher = (
  handler: AnyHandlerValue,
): handler is ScheduledMatcher<string, string, string> =>
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

const getWrappedHandlerRuntimeState = (
  handler: AnyWrappedHandler,
  runtime: Runtime<any, any>,
): WrappedHandlerRuntimeState => {
  const current = handler[wrappedHandlerSymbol].runtimeStates.get(runtime)

  if (current) {
    return current
  }

  const created: WrappedHandlerRuntimeState = {
    active: false,
    hasPendingPayload: false,
    pendingPayload: undefined,
  }

  handler[wrappedHandlerSymbol].runtimeStates.set(runtime, created)

  return created
}

const resetWrappedHandlerRuntimeState = (
  handler: AnyWrappedHandler,
  runtime: Runtime<any, any>,
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

const runWrappedHandler = (
  handler: AnyWrappedHandler,
  data: unknown,
  payload: unknown,
  utils: StateUtils<string, Action<string, unknown>, unknown, string, string>,
  runtime?: Runtime<any, any>,
): HandlerReturn => {
  if (!runtime) {
    return handler.handler(data, payload, utils)
  }

  const runtimeState = getWrappedHandlerRuntimeState(handler, runtime)
  const timerId = getWrappedHandlerTimeoutId(handler)

  if (handler.mode === "debounce") {
    runtimeState.active = true
    runtimeState.hasPendingPayload = true
    runtimeState.pendingPayload = payload

    return restartTimerEffect(timerId, handler.options.delay)
  }

  if (!runtimeState.active) {
    runtimeState.active = true

    if (handler.options.leading) {
      runtimeState.hasPendingPayload = false
      runtimeState.pendingPayload = undefined

      return prependStateReturns(
        handler.handler(data, payload, utils),
        startTimerEffect(timerId, handler.options.delay),
      )
    }

    if (handler.options.trailing) {
      runtimeState.hasPendingPayload = true
      runtimeState.pendingPayload = payload
    }

    return startTimerEffect(timerId, handler.options.delay)
  }

  if (handler.options.trailing) {
    runtimeState.hasPendingPayload = true
    runtimeState.pendingPayload = payload
  }

  return undefined
}

const runWrappedHandlerTimerAction = (
  handler: AnyWrappedHandler,
  actionType: string,
  data: unknown,
  utils: StateUtils<string, Action<string, unknown>, unknown, string, string>,
  runtime?: Runtime<any, any>,
): HandlerReturn => {
  if (actionType !== "TimerCompleted" || !runtime) {
    return undefined
  }

  const runtimeState = getWrappedHandlerRuntimeState(handler, runtime)

  if (handler.mode === "debounce") {
    if (!runtimeState.hasPendingPayload) {
      runtimeState.active = false
      return undefined
    }

    runtimeState.active = false
    runtimeState.hasPendingPayload = false

    return handler.handler(data, runtimeState.pendingPayload, utils)
  }

  if (!runtimeState.hasPendingPayload) {
    runtimeState.active = false
    runtimeState.pendingPayload = undefined
    return undefined
  }

  const pendingPayload = runtimeState.pendingPayload

  runtimeState.active = true
  runtimeState.hasPendingPayload = false
  runtimeState.pendingPayload = undefined

  return prependStateReturns(
    handler.handler(data, pendingPayload, utils),
    startTimerEffect(
      getWrappedHandlerTimeoutId(handler),
      handler.options.delay,
    ),
  )
}

const runHandlerValue = (
  handler: AnyHandlerValue,
  data: unknown,
  payload: unknown,
  utils: StateUtils<string, Action<string, unknown>, unknown, string, string>,
  runtime?: Runtime<any, any>,
): HandlerReturn => {
  if (isWrappedHandler(handler)) {
    return runWrappedHandler(handler, data, payload, utils, runtime)
  }

  return handler(data, payload, utils, runtime)
}

/**
 * State handlers are objects which contain a serializable list of bound
 * arguments and an executor function which is curried to contain those
 * args locked in. The executor can return 1 or more value StateReturn
 * value and can do so synchronously or async.
 */
export interface StateTransition<
  Name extends string,
  A extends Action<any, any>,
  Data,
> {
  name: Name
  data: Data
  isStateTransition: true
  mode: "append" | "update"
  executor: (action: A, runtime?: Runtime<any, any>) => HandlerReturn
  state: BoundStateFn<Name, A, Data>
  isNamed(name: string): boolean
}

export type StateTransitionToBoundStateFn<
  S extends StateTransition<string, any, any>,
  // N = S extends StateTransition<infer N, any, any> ? N : never,
  // A = S extends StateTransition<any, infer A, any> ? A : never,
  D = S extends StateTransition<any, any, infer D> ? D : never,
> = BoundStateFn<any, any, D>

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
): current is ReturnType<T> => current.state === state

/**
 * A State function as written by the user. It accepts
 * the action to run and an arbitrary number of serializable
 * arguments.
 */
export type State<
  Name extends string,
  Actions extends Action<any, any>,
  Data,
  TimeoutId extends string = string,
  IntervalId extends string = TimeoutId,
> = (
  action: WithScheduledActions<Actions, TimeoutId, IntervalId>,
  data: Data,
  utils: StateUtils<Name, Actions, Data, TimeoutId, IntervalId>,
) => HandlerReturn

export interface BoundStateFn<
  Name extends string,
  A extends Action<any, any>,
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
  A extends Action<any, any>,
  Data = undefined,
  TimeoutId extends string = string,
  IntervalId extends string = TimeoutId,
>(
  name: Name,
  executor: (
    action: A,
    data: Data,
    utils: {
      update: (data: Data) => StateTransition<Name, A, Data>
      parentRuntime?: Runtime<any, any>
      trigger: (action: A) => void
      startTimer: (timeoutId: TimeoutId, delay: number) => Effect
      cancelTimer: (timeoutId: TimeoutId) => Effect
      restartTimer: (timeoutId: TimeoutId, delay: number) => Effect
      startInterval: (intervalId: IntervalId, delay: number) => Effect
      cancelInterval: (intervalId: IntervalId) => Effect
      restartInterval: (intervalId: IntervalId, delay: number) => Effect
      startFrame: () => Effect
      cancelFrame: () => Effect
    },
    runtime?: Runtime<any, any>,
  ) => HandlerReturn,
): BoundStateFn<Name, A, Data> => {
  const fn = (data: Data) => ({
    name,
    data,
    isStateTransition: true,
    mode: "append",

    executor: (action: A, runtime?: Runtime<any, any>) => {
      const parentRuntime =
        typeof data === "object" && data !== null && PARENT_RUNTIME in data
          ? (data as { [PARENT_RUNTIME]?: ActionPayload<BeforeEnter> })[
              PARENT_RUNTIME
            ]
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
          ...(parentRuntime ? { parentRuntime } : {}),
        },
        runtime,
      )
    },

    state: fn,
    isNamed: (testName: string): boolean => testName === name,
  })

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
  >(
    handlers: StateHandlers<Actions, Data, TimeoutId, IntervalId>,
  ) =>
  (
    action: WithScheduledActions<Actions, TimeoutId, IntervalId>,
    data: Data,
    utils: StateUtils<string, Actions, Data, TimeoutId, IntervalId>,
    runtime?: Runtime<any, any>,
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
>(
  handlers: StateHandlers<Actions, Data, TimeoutId, IntervalId>,
  options?: { name?: string },
): BoundStateFn<
  string,
  WithScheduledActions<Actions, TimeoutId, IntervalId>,
  Data
> =>
  stateWrapper(
    options?.name ?? `AnonymousState${counter++}`,
    matchAction(handlers),
  )

export const NESTED = Symbol("Nested runtime")

export const stateWithNested = <
  Actions extends Action<string, unknown>,
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
  nestedActions: { [key: string]: ActionCreator<string, unknown> },
  options?: { name?: string },
) => {
  const beforeEnter = async (
    data: Data,
    parentRuntime: ActionPayload<BeforeEnter>,
    {
      update,
    }: {
      update: (data: Data) => StateTransition<string, Actions, Data>
    },
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

    const runtime = createRuntime(
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
      acc[key] = async (
        data: Data,
        payload: unknown,
        {
          update,
        }: {
          update: (data: Data) => StateTransition<string, Actions, Data>
        },
      ) => {
        const nestedRuntime =
          typeof data === "object" && data !== null && NESTED in data
            ? (data as { [NESTED]?: { run: (a: Actions) => Promise<void> } })[
                NESTED
              ]
            : undefined

        if (nestedRuntime) {
          await nestedRuntime.run(action(payload as never) as Actions)
        }

        // Force update
        return update({ ...data })
      }

      return acc
    },
    {} as {
      [K in keyof typeof nestedActions]?: (
        data: Data,
        payload: unknown,
        utils: {
          update: (data: Data) => StateTransition<string, Actions, Data>
        },
      ) => HandlerReturn
    },
  )

  return state<Actions, Data>(
    { ...handlers, ...forwarders, BeforeEnter: beforeEnter },
    options,
  )
}

class Matcher<S extends StateTransition<string, any, any>, T> {
  private readonly handlers = new Map<
    BoundStateFn<any, any, any>,
    (data: any) => T
  >()

  constructor(private readonly state: S) {}

  case_<S2 extends StateTransitionToBoundStateFn<S>>(
    state: S2,
    handler: (data: GetStateData<S2>) => T,
  ) {
    this.handlers.set(state, handler)
    return this
  }

  run(): T | undefined {
    const handler = this.handlers.get(this.state.state)

    if (!handler) {
      return
    }

    return handler(this.state.data)
  }
}

export const switch_ = <T>(state: StateTransition<string, any, any>) =>
  new Matcher<typeof state, T>(state)

const createScheduledMatcher = <
  Id extends string,
  TimeoutId extends string,
  IntervalId extends string,
>(
  handlers: ScheduledBranchMap<Id, TimeoutId, IntervalId>,
): ScheduledMatcher<Id, TimeoutId, IntervalId> => {
  const matcher = ((
    data: unknown,
    payload: ScheduledPayload<Id>,
    utils: StateUtils<
      string,
      Action<string, unknown>,
      unknown,
      TimeoutId,
      IntervalId
    >,
    runtime?: Runtime<any, any>,
  ) => {
    const handler = handlers[payload.timeoutId] as AnyHandlerValue

    return runHandlerValue(handler, data, payload, utils as never, runtime)
  }) as ScheduledMatcher<Id, TimeoutId, IntervalId>

  matcher[scheduledMatcherSymbol] = {
    wrappedHandlers: collectWrappedHandlers(
      handlers as Record<string, AnyHandlerValue>,
    ),
  }

  return matcher
}

export const whichTimeout = <TimeoutId extends string>(
  handlers: ScheduledBranchMap<TimeoutId, TimeoutId, any>,
): (<Actions extends Action<string, unknown>, Data, IntervalId extends string>(
  data: Data,
  payload: ScheduledPayload<TimeoutId>,
  utils: StateUtils<string, Actions, Data, TimeoutId, IntervalId>,
) => HandlerReturn) => createScheduledMatcher(handlers as never) as never

export const whichInterval = <IntervalId extends string>(
  handlers: ScheduledBranchMap<IntervalId, any, IntervalId>,
): (<Actions extends Action<string, unknown>, Data, TimeoutId extends string>(
  data: Data,
  payload: ScheduledPayload<IntervalId>,
  utils: StateUtils<string, Actions, Data, TimeoutId, IntervalId>,
) => HandlerReturn) => createScheduledMatcher(handlers as never) as never

const timedOut = createAction("TimedOut")
type TimedOut = ActionCreatorType<typeof timedOut>

export const waitState = <
  Data,
  ReqAC extends ActionCreator<any, any>,
  ReqA extends ActionCreatorType<ReqAC>,
  RespAC extends ActionCreator<any, any> & GetActionCreatorType<any>,
  RespA extends ActionCreatorType<RespAC>,
>(
  requestAction: ReqAC,
  responseActionCreator: RespAC,
  transition: (data: Data, payload: RespA["payload"]) => HandlerReturn,
  options?: {
    name?: string
    timeout?: number
    onTimeout?: (data: Data) => HandlerReturn
  },
) => {
  const name = options?.name

  return state<Enter | TimedOut, [Data, ReqA["payload"]]>(
    {
      Enter: ([, payload], _, { trigger }) => {
        if (options?.timeout) {
          setTimeout(() => {
            trigger(timedOut())
          }, options.timeout)
        }

        return output(requestAction(payload))
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
