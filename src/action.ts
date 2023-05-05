import type { Runtime } from "./runtime"

export class Action<T extends string, P> {
  constructor(public type: T, public payload: P) {}
}

export const action = <T extends string, P>(type: T, payload: P) =>
  new Action(type, payload)

export type ActionName<
  A extends Action<any, any>,
  T = A["type"],
> = T extends string ? T : never

export type ActionPayload<A extends Action<any, any>> = A["payload"]

export const isAction = <T extends string>(a: unknown): a is Action<T, any> =>
  a instanceof Action

export interface MatchAction<T extends string, P> {
  is(action: Action<any, any>): action is Action<T, P>
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

export type ActionCreatorType<F extends ActionCreator<any, any>> = ReturnType<F>

export const createAction = <T extends string, P = undefined>(
  type: T,
): ActionCreator<T, P> & MatchAction<T, P> & GetActionCreatorType<T> => {
  const fn = (payload?: P) => action(type, payload)

  fn.is = (action: Action<any, any>): action is Action<T, P> =>
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
