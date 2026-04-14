import type { Runtime } from "./runtime.js"

export class Action<T extends string, P> {
  constructor(
    public type: T,
    public payload: P,
  ) {}
}

export type ActionName<
  A extends Action<string, unknown>,
  T = A["type"],
> = T extends string ? T : never

export type ActionPayload<A extends Action<string, unknown>> = A["payload"]

export const isAction = <T extends string>(
  a: unknown,
): a is Action<T, unknown> => a instanceof Action

export interface MatchAction<T extends string, P> {
  is(action: Action<string, unknown>): action is Action<T, P>
}

export interface GetActionCreatorType<T extends string> {
  type: T
}

type Optional<T> = [T]

type NamedActionCreator<T extends string, P> = ActionCreator<T, P> &
  MatchAction<T, P> &
  GetActionCreatorType<T>

export type ActionBuilder<T extends string> = NamedActionCreator<
  T,
  undefined
> & {
  withPayload<P>(): NamedActionCreator<T, P>
}

export type ActionCreator<T extends string, P> = P extends undefined
  ? () => Action<T, undefined>
  : P extends Optional<infer Z>
    ? (payload?: Z) => Action<T, Z | undefined>
    : (payload: P) => Action<T, P>

export type ActionCreatorType<
  F extends (...args: never[]) => Action<string, unknown>,
> = ReturnType<F>

const createActionValue = <T extends string, P>(type: T, payload: P) =>
  new Action(type, payload)

const createNamedAction = <T extends string, P = undefined>(
  type: T,
): NamedActionCreator<T, P> => {
  const fn = (payload?: P) => createActionValue(type, payload as P)

  fn.is = (action: Action<string, unknown>): action is Action<T, P> =>
    action.type === type

  fn.type = type

  return fn as unknown as NamedActionCreator<T, P>
}

const createActionBuilder = <T extends string>(type: T): ActionBuilder<T> => {
  const fn = createNamedAction(type) as ActionBuilder<T>

  fn.withPayload = <P>() => createNamedAction<T, P>(type)

  return fn
}

export function action<T extends string>(type: T): ActionBuilder<T>
export function action<T extends string, P>(type: T, payload: P): Action<T, P>
export function action<T extends string, P>(
  type: T,
  payload?: P,
): ActionBuilder<T> | Action<T, P> {
  if (arguments.length === 1) {
    return createActionBuilder(type)
  }

  return createActionValue(type, payload as P)
}

/**
 * @deprecated Use `action("Type")` for no-payload actions or
 * `action("Type").withPayload<Payload>()` for payload-bearing actions.
 */
export const createAction = <T extends string, P = undefined>(
  type: T,
): NamedActionCreator<T, P> => createNamedAction<T, P>(type)

export const beforeEnter = createNamedAction<
  "BeforeEnter",
  Optional<Runtime<any, any>>
>("BeforeEnter")
export type BeforeEnter = ActionCreatorType<typeof beforeEnter>

export const enter = action("Enter")
export type Enter = ActionCreatorType<typeof enter>

export const exit = action("Exit")
export type Exit = ActionCreatorType<typeof exit>

export const onFrame = action("OnFrame").withPayload<number>()
export type OnFrame = ActionCreatorType<typeof onFrame>

export type TimerPayload<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
  delay: number
}

export type IntervalPayload<IntervalId extends string = string> = {
  intervalId: IntervalId
  delay: number
}

type GenericTimerActionCreator<T extends string> = MatchAction<
  T,
  TimerPayload<string>
> & {
  <TimeoutId extends string = string>(
    payload: TimerPayload<TimeoutId>,
  ): Action<T, TimerPayload<TimeoutId>>
  type: T
}

const createTimerAction = <T extends string>(
  type: T,
): GenericTimerActionCreator<T> => {
  const fn = <TimeoutId extends string = string>(
    payload: TimerPayload<TimeoutId>,
  ) => action(type, payload)

  fn.is = (
    action: Action<string, unknown>,
  ): action is Action<T, TimerPayload<string>> => action.type === type

  fn.type = type

  return fn as GenericTimerActionCreator<T>
}

export type TimerStarted<TimeoutId extends string = string> = Action<
  "TimerStarted",
  TimerPayload<TimeoutId>
>
export const timerStarted = createTimerAction("TimerStarted")

export type TimerCompleted<TimeoutId extends string = string> = Action<
  "TimerCompleted",
  TimerPayload<TimeoutId>
>
export const timerCompleted = createTimerAction("TimerCompleted")

export type TimerCancelled<TimeoutId extends string = string> = Action<
  "TimerCancelled",
  TimerPayload<TimeoutId>
>
export const timerCancelled = createTimerAction("TimerCancelled")

type GenericIntervalActionCreator<T extends string> = MatchAction<
  T,
  IntervalPayload<string>
> & {
  <IntervalId extends string = string>(
    payload: IntervalPayload<IntervalId>,
  ): Action<T, IntervalPayload<IntervalId>>
  type: T
}

const createIntervalAction = <T extends string>(
  type: T,
): GenericIntervalActionCreator<T> => {
  const fn = <IntervalId extends string = string>(
    payload: IntervalPayload<IntervalId>,
  ) => action(type, payload)

  fn.is = (
    action: Action<string, unknown>,
  ): action is Action<T, IntervalPayload<string>> => action.type === type

  fn.type = type

  return fn as GenericIntervalActionCreator<T>
}

export type IntervalStarted<IntervalId extends string = string> = Action<
  "IntervalStarted",
  IntervalPayload<IntervalId>
>
export const intervalStarted = createIntervalAction("IntervalStarted")

export type IntervalTriggered<IntervalId extends string = string> = Action<
  "IntervalTriggered",
  IntervalPayload<IntervalId>
>
export const intervalTriggered = createIntervalAction("IntervalTriggered")

export type IntervalCancelled<IntervalId extends string = string> = Action<
  "IntervalCancelled",
  IntervalPayload<IntervalId>
>
export const intervalCancelled = createIntervalAction("IntervalCancelled")

export type AsyncPayload<AsyncId extends string = string> = {
  asyncId: AsyncId
}

type GenericAsyncActionCreator<T extends string> = MatchAction<
  T,
  AsyncPayload<string>
> & {
  <AsyncId extends string = string>(
    payload: AsyncPayload<AsyncId>,
  ): Action<T, AsyncPayload<AsyncId>>
  type: T
}

const createAsyncAction = <T extends string>(
  type: T,
): GenericAsyncActionCreator<T> => {
  const fn = <AsyncId extends string = string>(
    payload: AsyncPayload<AsyncId>,
  ) => action(type, payload)

  fn.is = (
    action: Action<string, unknown>,
  ): action is Action<T, AsyncPayload<string>> => action.type === type

  fn.type = type

  return fn as GenericAsyncActionCreator<T>
}

export type AsyncCancelled<AsyncId extends string = string> = Action<
  "AsyncCancelled",
  AsyncPayload<AsyncId>
>
export const asyncCancelled = createAsyncAction("AsyncCancelled")
