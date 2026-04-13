import type { Runtime } from "./runtime.js"

export class Action<T extends string, P> {
  constructor(
    public type: T,
    public payload: P,
  ) {}
}

export const action = <T extends string, P>(type: T, payload: P) =>
  new Action(type, payload)

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

export type ActionCreator<T extends string, P> = P extends undefined
  ? () => Action<T, undefined>
  : P extends Optional<infer Z>
    ? (payload?: Z) => Action<T, Z | undefined>
    : (payload: P) => Action<T, P>

export type ActionCreatorType<
  F extends (...args: never[]) => Action<string, unknown>,
> = ReturnType<F>

export const createAction = <T extends string, P = undefined>(
  type: T,
): ActionCreator<T, P> & MatchAction<T, P> & GetActionCreatorType<T> => {
  const fn = (payload?: P) => action(type, payload)

  fn.is = (action: Action<string, unknown>): action is Action<T, P> =>
    action.type === type

  fn.type = type

  return fn as unknown as ActionCreator<T, P> &
    MatchAction<T, P> &
    GetActionCreatorType<T>
}

export const beforeEnter = createAction<
  "BeforeEnter",
  Optional<Runtime<any, any>>
>("BeforeEnter")
export type BeforeEnter = ActionCreatorType<typeof beforeEnter>

export const enter = createAction<"Enter">("Enter")
export type Enter = ActionCreatorType<typeof enter>

export const exit = createAction("Exit")
export type Exit = ActionCreatorType<typeof exit>

export const onFrame = createAction<"OnFrame", number>("OnFrame")
export type OnFrame = ActionCreatorType<typeof onFrame>

export type TimerPayload<TimeoutId extends string = string> = {
  timeoutId: TimeoutId
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

export type IntervalPayload<IntervalId extends string = string> =
  TimerPayload<IntervalId>

export type IntervalStarted<IntervalId extends string = string> = Action<
  "IntervalStarted",
  IntervalPayload<IntervalId>
>
export const intervalStarted = createTimerAction("IntervalStarted")

export type IntervalTriggered<IntervalId extends string = string> = Action<
  "IntervalTriggered",
  IntervalPayload<IntervalId>
>
export const intervalTriggered = createTimerAction("IntervalTriggered")

export type IntervalCancelled<IntervalId extends string = string> = Action<
  "IntervalCancelled",
  IntervalPayload<IntervalId>
>
export const intervalCancelled = createTimerAction("IntervalCancelled")
