import { type Action } from "./action.js"
import { Effect } from "./effect.js"
import { Runtime } from "./runtime.js"

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

export type SyncHandlerReturn = void | StateReturn | Array<StateReturn>
export type HandlerReturn = SyncHandlerReturn | Promise<SyncHandlerReturn>

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
  executor: (action: A, runtime?: Runtime<any, any, any>) => HandlerReturn
  state: BoundStateFn<Name, A, Data>
  isNamed(name: string): boolean
}

export type StateTransitionToBoundStateFn<
  S extends StateTransition<string, any, any>,
  D = S extends StateTransition<any, any, infer D> ? D : never,
> = BoundStateFn<any, any, D>

export const isStateTransition = (
  a: StateTransition<any, any, any> | unknown,
): a is StateTransition<any, any, any> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  (a as any)?.isStateTransition

export const isState = <
  T extends BoundStateFn<any, any, any>,
  Name_ = T extends BoundStateFn<infer U, any, any> ? U : never,
  A_ = T extends BoundStateFn<any, infer U, any> ? U : never,
  Data_ = T extends BoundStateFn<any, any, infer U> ? U : never,
>(
  current: StateTransition<any, any, any>,
  state: T,
): current is StateTransition<
  Name_ extends string ? Name_ : never,
  A_ extends Action<any, any> ? A_ : never,
  Data_
> => current.state === state

/**
 * A State function as written by the user. It accepts
 * the action to run and an arbitrary number of serializable
 * arguments.
 */
export type State<Name extends string, A extends Action<any, any>, Data> = (
  action: A,
  data: Data,
  utils: {
    update: (data: Data) => StateTransition<Name, A, Data>
    trigger: (action: A) => void
  },
) => HandlerReturn

export interface BoundStateFn<
  Name extends string,
  A extends Action<any, any>,
  Data = undefined,
> {
  (...data: Data extends undefined ? [] : [Data]): StateTransition<
    Name,
    A,
    Data
  >
  name: Name
}

export type GetStateData<
  S extends BoundStateFn<any, any, any>,
  D = S extends BoundStateFn<any, any, infer D> ? D : never,
> = D
