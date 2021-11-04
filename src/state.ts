import { Task } from "@tdreyno/pretty-please"
import isPlainObject from "lodash.isplainobject"
import mapValues from "lodash.mapvalues"
import { Action, ActionName, ActionPayload } from "./action"
import { Effect } from "./effect"

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
  | Promise<any>
  | Task<any, any>

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
  reenter: (data: Data) => StateTransition<Name, A, Data>
  executor: (action: A) => void | StateReturn | Array<StateReturn>
  state: BoundStateFn<Name, A, Data>
  is(state: BoundStateFn<any, any, any>): boolean
}

export type StateTransitionToBoundStateFn<
  S extends StateTransition<string, any, any>,
  // N = S extends StateTransition<infer N, any, any> ? N : never,
  // A = S extends StateTransition<any, infer A, any> ? A : never,
  D = S extends StateTransition<any, any, infer D> ? D : never,
> = BoundStateFn<any, any, D>

export const isStateTransition = (
  a: StateTransition<any, any, any> | unknown,
): a is StateTransition<any, any, any> =>
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access
  a && (a as any).isStateTransition

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
    reenter: (data: Data) => StateTransition<Name, A, Data>
  },
) => StateReturn | Array<StateReturn> | undefined

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

interface Options {
  mutable: boolean
}

const cloneDeep = (value: any): any => {
  if (Array.isArray(value)) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return value.map(cloneDeep)
  }

  if (isPlainObject(value)) {
    return mapValues(value, cloneDeep)
  }

  if (value instanceof Set) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return new Set(cloneDeep(Array.from(value)))
  }

  if (value instanceof Map) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return new Map(cloneDeep(Array.from(value)))
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value
}

export const stateWrapper = <
  Name extends string,
  A extends Action<any, any>,
  Data = undefined,
>(
  name: Name,
  executor: State<Name, A, Data>,
  options?: Partial<Options>,
): BoundStateFn<Name, A, Data> => {
  const immutable = !options || !options.mutable

  const fn = (data: Data) => ({
    name,
    data,
    isStateTransition: true,
    mode: "append",

    reenter: (reenterData: Data) => {
      const bound = fn(reenterData)
      bound.mode = "append"
      return bound
    },

    executor: (action: A) => {
      // Clones arguments
      const clonedData = immutable ? (cloneDeep(data) as Data) : data

      // Run state execturoe
      return executor(action, clonedData, { reenter, update })
    },

    state: fn,
    is: (state: BoundStateFn<any, any, any>): boolean => state === fn,
  })

  Object.defineProperty(fn, "name", { value: name })

  const reenter = (data: Data): StateTransition<Name, A, Data> => {
    const bound = fn(data)
    bound.mode = "append"
    return bound as unknown as StateTransition<Name, A, Data>
  }

  const update = (data: Data): StateTransition<Name, A, Data> => {
    const bound = fn(data)
    bound.mode = "update"
    return bound as unknown as StateTransition<Name, A, Data>
  }

  return fn as unknown as BoundStateFn<Name, A, Data>
}

const matchAction =
  <Actions extends Action<string, any>, Data>(
    handlers: {
      [A in Actions as ActionName<A>]: (
        data: Data,
        payload: ActionPayload<A>,
        utils: {
          update: (data: Data) => StateTransition<string, Actions, Data>
          reenter: (data: Data) => StateTransition<string, Actions, Data>
        },
      ) => StateReturn | Array<StateReturn>
    },
    fallback?: (
      data: Data,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | Array<StateReturn>,
  ) =>
  (
    action: Actions,
    data: Data,
    utils: {
      update: (data: Data) => StateTransition<string, Actions, Data>
      reenter: (data: Data) => StateTransition<string, Actions, Data>
    },
  ): StateReturn | Array<StateReturn> | undefined => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const handler = (handlers as never)[action.type] as (
      data: Data,
      payload: ActionPayload<Actions>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | Array<StateReturn>

    if (!handler) {
      return fallback ? fallback(data, utils) : undefined
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return handler(data, action.payload, utils)
  }

let counter = 1

export const state = <Actions extends Action<string, any>, Data = undefined>(
  handlers: {
    [A in Actions as ActionName<A>]: (
      data: Data,
      payload: ActionPayload<A>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | Array<StateReturn>
  } & {
    fallback?: (
      data: Data,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | Array<StateReturn>
  },
  options?: Partial<Options> & { debugName?: string },
): BoundStateFn<string, Actions, Data> =>
  stateWrapper(
    options && options.debugName
      ? options.debugName
      : `AnonymousState${counter++}`,
    matchAction(handlers, handlers.fallback),
    options,
  )

class Matcher<S extends StateTransition<string, any, any>, T> {
  private handlers = new Map<
    StateTransitionToBoundStateFn<S>,
    (data: any) => T
  >()

  constructor(private state: S) {}

  case_<S2 extends StateTransitionToBoundStateFn<S>>(
    state: S2,
    handler: (data: GetStateData<S2>) => T,
  ) {
    this.handlers.set(state, handler)
    return this
  }

  run(): T | undefined {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const handler = this.handlers.get(this.state.state)

    if (!handler) {
      return
    }

    return handler(this.state.data)
  }
}

export const switch_ = <T>(state: StateTransition<string, any, any>) =>
  new Matcher<typeof state, T>(state)
