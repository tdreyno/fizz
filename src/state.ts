/* eslint-disable @typescript-eslint/no-explicit-any */
import { Task } from "@tdreyno/pretty-please"
import isPlainObject from "lodash.isplainobject"
import mapValues from "lodash.mapvalues"
import { Action, ActionName, ActionPayload } from "./action"
import { Effect, noop } from "./effect"

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
  Data extends any
> {
  name: Name
  data: Data
  isStateTransition: true
  mode: "append" | "update"
  executor: (action: A) => void | StateReturn | StateReturn[]
}

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
export type State<
  Name extends string,
  A extends Action<any, any>,
  Data extends any
> = (
  action: A,
  data: Data,
  utils: {
    update: (data: Data) => StateTransition<Name, A, Data>
    reenter: (data: Data) => StateTransition<Name, A, Data>
  },
) => StateReturn | StateReturn[]

export interface BoundStateFn<
  Name extends string,
  A extends Action<any, any>,
  Data extends any
> {
  (data: Data): StateTransition<Name, A, Data>
  name: Name
}

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
    return new Set(cloneDeep(Array.from(value)))
  }

  if (value instanceof Map) {
    return new Map(cloneDeep(Array.from(value)))
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return value
}

export const stateWrapper = <
  Name extends string,
  A extends Action<any, any>,
  Data extends any
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

    executor: (action: A) => {
      // Clones arguments
      const clonedData = immutable ? (cloneDeep(data) as Data) : data

      // Run state execturoe
      return executor(action, clonedData, { reenter, update })
    },
  })

  Object.defineProperty(fn, "name", { value: name })

  const reenter = (data: Data): StateTransition<Name, A, Data> => {
    const bound = fn(data)
    bound.mode = "append"
    return bound as StateTransition<Name, A, Data>
  }

  const update = (data: Data): StateTransition<Name, A, Data> => {
    const bound = fn(data)
    bound.mode = "update"
    return bound as StateTransition<Name, A, Data>
  }

  return fn as BoundStateFn<Name, A, Data>
}

export const match = <Actions extends Action<string, any>, Data>(
  handlers: {
    [A in Actions as ActionName<A>]: (
      data: Data,
      payload: ActionPayload<A>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | StateReturn[]
  },
  fallback: (
    data: Data,
    utils: {
      update: (data: Data) => StateTransition<string, Actions, Data>
      reenter: (data: Data) => StateTransition<string, Actions, Data>
    },
  ) => StateReturn | StateReturn[] = () => noop(),
) => (
  action: Actions,
  data: Data,
  utils: {
    update: (data: Data) => StateTransition<string, Actions, Data>
    reenter: (data: Data) => StateTransition<string, Actions, Data>
  },
): StateReturn | StateReturn[] => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  const handler = (handlers as never)[action.type] as (
    data: Data,
    payload: ActionPayload<Actions>,
    utils: {
      update: (data: Data) => StateTransition<string, Actions, Data>
      reenter: (data: Data) => StateTransition<string, Actions, Data>
    },
  ) => StateReturn | StateReturn[]

  if (!handler) {
    return fallback(data, utils)
  }

  return handler(data, action.payload, utils)
}

export const state = <Actions extends Action<string, any>, Data extends any>(
  handlers: {
    [A in Actions as ActionName<A>]: (
      data: Data,
      payload: ActionPayload<A>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | StateReturn[]
  } & {
    fallback?: (
      data: Data,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        reenter: (data: Data) => StateTransition<string, Actions, Data>
      },
    ) => StateReturn | StateReturn[]
  },
  options?: Partial<Options> & { debugName?: string },
): BoundStateFn<string, Actions, Data> =>
  stateWrapper(
    options?.debugName ?? "UnnamedState",
    match(handlers, handlers.fallback || noop),
    options,
  )
