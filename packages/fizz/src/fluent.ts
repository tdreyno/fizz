import type {
  Action,
  ActionCreator,
  ActionCreatorType,
  ActionPayload,
  Enter,
  Exit,
  GetActionCreatorType,
  IntervalPayload,
  IntervalTriggered,
  TimerCompleted,
  TimerPayload,
} from "./action.js"
import {
  action,
  enter,
  exit,
  intervalTriggered,
  timerCompleted,
} from "./action.js"
import type { RetryPolicy } from "./effect.js"
import { retryAsync } from "./effect.js"
import type {
  BoundStateFn,
  GetStateData,
  HandlerReturn,
  StateTransition,
} from "./state.js"
import { debounce, state as createObjectState, throttle } from "./state.js"

type FluentConfigErrorCode =
  | "DUPLICATE_ACTION_HANDLER"
  | "DUPLICATE_TIMEOUT_HANDLER"
  | "DUPLICATE_INTERVAL_HANDLER"
  | "MISSING_PREVIOUS_HANDLER"
  | "UNSUPPORTED_GUARD_TARGET"
  | "CONFLICTING_SCHEDULED_ROUTING"

export type FluentActionCreator<
  T extends string = string,
  P = unknown,
> = ActionCreator<T, P> & GetActionCreatorType<T>

type AnyFluentActionCreator = ((...args: never[]) => Action<string, unknown>) &
  GetActionCreatorType<string>

let fluentActionCounter = 0

const createFluentActionType = (debugLabel?: string) => {
  const trimmedLabel = debugLabel?.trim()
  const normalizedLabel =
    trimmedLabel && trimmedLabel.length > 0 ? trimmedLabel : "action"

  fluentActionCounter += 1

  return `FluentAction:${normalizedLabel}:${fluentActionCounter}`
}

export const fluentAction = <P = undefined>(
  debugLabel?: string,
): FluentActionCreator<string, P> => {
  const type = createFluentActionType(debugLabel)

  return action(type).withPayload<P>() as FluentActionCreator<string, P>
}

type AnyHandler = (
  data: unknown,
  payload: unknown,
  utils: unknown,
) => HandlerReturn

type HandlerLike = AnyHandler | ReturnType<typeof debounce>

type FluentStateUtils<
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
    Actions | TimerCompleted<TimeoutId> | IntervalTriggered<IntervalId>,
    Data
  >
  trigger: (
    action: Actions | TimerCompleted<TimeoutId> | IntervalTriggered<IntervalId>,
  ) => void
  cancelAsync: (asyncId: string) => unknown
  startAsync: (...args: unknown[]) => unknown
  startTimer: (timeoutId: TimeoutId, delay: number) => unknown
  cancelTimer: (timeoutId: TimeoutId) => unknown
  restartTimer: (timeoutId: TimeoutId, delay: number) => unknown
  startInterval: (intervalId: IntervalId, delay: number) => unknown
  cancelInterval: (intervalId: IntervalId) => unknown
  restartInterval: (intervalId: IntervalId, delay: number) => unknown
  startFrame: () => unknown
  cancelFrame: () => unknown
  parentRuntime?: unknown
}

type FluentHandler<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  A extends Action<string, unknown>,
> = (
  data: Data,
  payload: ActionPayload<A>,
  utils: FluentStateUtils<Name, Actions, Data, TimeoutId, IntervalId>,
) => HandlerReturn

export type FluentStateDescription = {
  name: string
  actionTypes: string[]
  timeoutIds: string[]
  intervalIds: string[]
}

type FluentStateBase<Name extends string, Data> = BoundStateFn<
  Name,
  Action<string, unknown>,
  Data
>

export interface FluentState<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string = string,
  IntervalId extends string = string,
> extends FluentStateBase<Name, Data> {
  on<C extends AnyFluentActionCreator>(
    actionCreator: C,
    handler: FluentHandler<
      Name,
      Actions,
      Data,
      TimeoutId,
      IntervalId,
      ActionCreatorType<C>
    >,
  ): FluentState<
    Name,
    Actions | ActionCreatorType<C>,
    Data,
    TimeoutId,
    IntervalId
  >

  onDebounce<C extends AnyFluentActionCreator>(
    actionCreator: C,
    options: Parameters<typeof debounce>[1],
    handler: FluentHandler<
      Name,
      Actions,
      Data,
      TimeoutId,
      IntervalId,
      ActionCreatorType<C>
    >,
  ): FluentState<
    Name,
    Actions | ActionCreatorType<C>,
    Data,
    TimeoutId,
    IntervalId
  >

  onThrottle<C extends AnyFluentActionCreator>(
    actionCreator: C,
    options: Parameters<typeof throttle>[1],
    handler: FluentHandler<
      Name,
      Actions,
      Data,
      TimeoutId,
      IntervalId,
      ActionCreatorType<C>
    >,
  ): FluentState<
    Name,
    Actions | ActionCreatorType<C>,
    Data,
    TimeoutId,
    IntervalId
  >

  onEnter(
    handler: FluentHandler<Name, Actions, Data, TimeoutId, IntervalId, Enter>,
  ): FluentState<Name, Actions | Enter, Data, TimeoutId, IntervalId>

  onExit(
    handler: FluentHandler<Name, Actions, Data, TimeoutId, IntervalId, Exit>,
  ): FluentState<Name, Actions | Exit, Data, TimeoutId, IntervalId>

  onTimeout<Id extends string>(
    timeoutId: Id,
    handler: FluentHandler<
      Name,
      Actions,
      Data,
      TimeoutId | Id,
      IntervalId,
      TimerCompleted<Id>
    >,
  ): FluentState<Name, Actions, Data, TimeoutId | Id, IntervalId>

  onInterval<Id extends string>(
    intervalId: Id,
    handler: FluentHandler<
      Name,
      Actions,
      Data,
      TimeoutId,
      IntervalId | Id,
      IntervalTriggered<Id>
    >,
  ): FluentState<Name, Actions, Data, TimeoutId, IntervalId | Id>

  when(predicate: (data: Data) => boolean): FluentState<Name, Actions, Data>
  unless(predicate: (data: Data) => boolean): FluentState<Name, Actions, Data>
  describe(): FluentStateDescription
}

type FluentConfigError = Error & {
  code: FluentConfigErrorCode
  stateName: string
  metadata?: Record<string, unknown>
}

const createFluentConfigError = (
  code: FluentConfigErrorCode,
  stateName: string,
  message: string,
  metadata?: Record<string, unknown>,
): FluentConfigError => {
  const error = new Error(`[${stateName}] ${message}`) as FluentConfigError

  error.name = "FluentStateDefinitionError"
  error.code = code
  error.stateName = stateName

  if (metadata !== undefined) {
    error.metadata = metadata
  }

  return error
}

const timeoutRoutingSymbol = Symbol("fluent timeout routing")
const intervalRoutingSymbol = Symbol("fluent interval routing")

const isPlainHandler = (
  handler: HandlerLike | undefined,
): handler is AnyHandler => typeof handler === "function"

export const state = <Data = undefined, Name extends string = string>(
  name: Name,
): FluentState<Name, never, Data> => {
  const handlers: Record<string, HandlerLike> = {}
  const timeoutHandlers = new Map<string, AnyHandler>()
  const intervalHandlers = new Map<string, AnyHandler>()
  let previousActionType: string | undefined

  const stateFn = createObjectState<Action<string, unknown>, Data>(
    handlers as never,
    { name },
  ) as unknown as FluentState<Name, never, Data>

  const registerHandler = (
    actionType: string,
    handler: HandlerLike,
    source: string,
  ) => {
    if (actionType in handlers) {
      throw createFluentConfigError(
        "DUPLICATE_ACTION_HANDLER",
        name,
        `Received duplicate handler registration for action "${actionType}" from ${source}.`,
        { actionType, source },
      )
    }

    handlers[actionType] = handler
    previousActionType = actionType

    return stateFn
  }

  const applyGuard = (predicate: (data: Data) => boolean, invert: boolean) => {
    if (!previousActionType) {
      throw createFluentConfigError(
        "MISSING_PREVIOUS_HANDLER",
        name,
        "Cannot apply when/unless without a previously registered action handler.",
      )
    }

    const previousHandler = handlers[previousActionType]

    if (!isPlainHandler(previousHandler)) {
      throw createFluentConfigError(
        "UNSUPPORTED_GUARD_TARGET",
        name,
        `Cannot apply when/unless to non-function handler "${previousActionType}".`,
        { actionType: previousActionType },
      )
    }

    handlers[previousActionType] = ((data, payload, utils) => {
      const shouldRun = invert
        ? !predicate(data as Data)
        : predicate(data as Data)

      if (!shouldRun) {
        return
      }

      return previousHandler(data, payload, utils)
    }) as AnyHandler

    return stateFn
  }

  const ensureTimeoutRouting = () => {
    const currentTimerHandler = handlers[timerCompleted.type] as
      | (AnyHandler & { [timeoutRoutingSymbol]?: true })
      | undefined

    if (
      currentTimerHandler &&
      currentTimerHandler[timeoutRoutingSymbol] !== true
    ) {
      throw createFluentConfigError(
        "CONFLICTING_SCHEDULED_ROUTING",
        name,
        "Cannot combine on(timerCompleted, ...) with onTimeout(...). Use one timeout routing style per state.",
        { actionType: timerCompleted.type },
      )
    }

    const timeoutRoutingHandler = ((data, payload, utils) => {
      const typedPayload = payload as TimerPayload<string>
      const timeoutHandler = timeoutHandlers.get(typedPayload.timeoutId)

      if (!timeoutHandler) {
        return
      }

      return timeoutHandler(data, payload, utils)
    }) as AnyHandler & { [timeoutRoutingSymbol]?: true }

    timeoutRoutingHandler[timeoutRoutingSymbol] = true

    handlers[timerCompleted.type] = timeoutRoutingHandler
    previousActionType = timerCompleted.type

    return stateFn
  }

  const ensureIntervalRouting = () => {
    const currentIntervalHandler = handlers[intervalTriggered.type] as
      | (AnyHandler & { [intervalRoutingSymbol]?: true })
      | undefined

    if (
      currentIntervalHandler &&
      currentIntervalHandler[intervalRoutingSymbol] !== true
    ) {
      throw createFluentConfigError(
        "CONFLICTING_SCHEDULED_ROUTING",
        name,
        "Cannot combine on(intervalTriggered, ...) with onInterval(...). Use one interval routing style per state.",
        { actionType: intervalTriggered.type },
      )
    }

    const intervalRoutingHandler = ((data, payload, utils) => {
      const typedPayload = payload as IntervalPayload<string>
      const intervalHandler = intervalHandlers.get(typedPayload.intervalId)

      if (!intervalHandler) {
        return
      }

      return intervalHandler(data, payload, utils)
    }) as AnyHandler & { [intervalRoutingSymbol]?: true }

    intervalRoutingHandler[intervalRoutingSymbol] = true

    handlers[intervalTriggered.type] = intervalRoutingHandler
    previousActionType = intervalTriggered.type

    return stateFn
  }

  stateFn.on = (actionCreator, handler) =>
    registerHandler(actionCreator.type, handler as AnyHandler, "on") as never

  stateFn.onDebounce = (actionCreator, options, handler) =>
    registerHandler(
      actionCreator.type,
      debounce(handler as AnyHandler, options),
      "onDebounce",
    ) as never

  stateFn.onThrottle = (actionCreator, options, handler) =>
    registerHandler(
      actionCreator.type,
      throttle(handler as AnyHandler, options),
      "onThrottle",
    ) as never

  stateFn.onEnter = handler => stateFn.on(enter, handler as never) as never
  stateFn.onExit = handler => stateFn.on(exit, handler as never) as never

  stateFn.onTimeout = (timeoutId, handler) => {
    if (timeoutHandlers.has(timeoutId)) {
      throw createFluentConfigError(
        "DUPLICATE_TIMEOUT_HANDLER",
        name,
        `Received duplicate timeout handler for timeout id "${timeoutId}".`,
        { timeoutId },
      )
    }

    timeoutHandlers.set(timeoutId, handler as AnyHandler)

    return ensureTimeoutRouting() as never
  }

  stateFn.onInterval = (intervalId, handler) => {
    if (intervalHandlers.has(intervalId)) {
      throw createFluentConfigError(
        "DUPLICATE_INTERVAL_HANDLER",
        name,
        `Received duplicate interval handler for interval id "${intervalId}".`,
        { intervalId },
      )
    }

    intervalHandlers.set(intervalId, handler as AnyHandler)

    return ensureIntervalRouting() as never
  }

  stateFn.when = predicate => applyGuard(predicate, false) as never
  stateFn.unless = predicate => applyGuard(predicate, true) as never

  stateFn.describe = () => ({
    name,
    actionTypes: Object.keys(handlers).sort((a, b) => a.localeCompare(b)),
    timeoutIds: [...timeoutHandlers.keys()].sort((a, b) => a.localeCompare(b)),
    intervalIds: [...intervalHandlers.keys()].sort((a, b) =>
      a.localeCompare(b),
    ),
  })

  return stateFn
}

export const describeState = (stateValue: {
  describe?: () => FluentStateDescription
}): FluentStateDescription | undefined => stateValue.describe?.()

export type StateData<T extends BoundStateFn<any, any, any>> = GetStateData<T>

export type ActionFromCreator<C extends AnyFluentActionCreator> =
  ActionCreatorType<C>

export type PayloadFromCreator<C extends AnyFluentActionCreator> =
  ActionPayload<ActionCreatorType<C>>

export const withDebouncedAction = <
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  IntervalId extends string,
  C extends AnyFluentActionCreator,
>(
  stateValue: FluentState<Name, Actions, Data, TimeoutId, IntervalId>,
  actionCreator: C,
  options: Parameters<typeof debounce>[1],
  handler: FluentHandler<
    Name,
    Actions,
    Data,
    TimeoutId,
    IntervalId,
    ActionCreatorType<C>
  >,
) => stateValue.onDebounce(actionCreator, options, handler as never)

type RetryOptions = RetryPolicy

export const withRetry = <Args extends unknown[], Result>(
  run: (...args: Args) => Promise<Result>,
  options: RetryOptions = {},
) => {
  return (...args: Args): Promise<Result> =>
    retryAsync<Result>({
      retry: options,
      run: async () => run(...args),
    })
}

type OptimisticUpdateConfig<Data, Payload> = {
  apply: (data: Data, payload: Payload) => Data
  rollback: (data: Data, payload: Payload, error: unknown) => Data
}

export const withOptimisticUpdate = <Data, Payload>(
  config: OptimisticUpdateConfig<Data, Payload>,
) => config
