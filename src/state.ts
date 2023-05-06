import type { Action, ActionName, ActionPayload } from "./action.js"
import type {
  State,
  BoundStateFn,
  StateTransition,
  HandlerReturn,
} from "./core.js"
import type { Runtime } from "./runtime.js"

export const PARENT_RUNTIME = Symbol("Parent runtime")

export const stateWrapper = <
  Name extends string,
  A extends Action<any, any>,
  Data = undefined,
>(
  name: Name,
  executor: State<Name, A, Data>,
): BoundStateFn<Name, A, Data> => {
  const fn = (data: Data) => ({
    name,
    data,
    isStateTransition: true,
    mode: "append",

    executor: (action: A, runtime?: Runtime<any, any, any>) => {
      // Run state executor
      return executor(action, data, {
        update,
        trigger: (a: A) => {
          void runtime?.run(a)
        },
      })
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
  <Actions extends Action<string, any>, Data>(handlers: {
    [A in Actions as ActionName<A>]: (
      data: Data,
      payload: ActionPayload<A>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        trigger: (action: Actions) => void
      },
    ) => HandlerReturn
  }) =>
  (
    action: Actions,
    data: Data,
    utils: {
      update: (data: Data) => StateTransition<string, Actions, Data>
      trigger: (action: Actions) => void
    },
  ): HandlerReturn => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const handler = (handlers as never)[action.type] as (
      data: Data,
      payload: ActionPayload<Actions>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        trigger: (action: Actions) => void
      },
    ) => HandlerReturn

    if (!handler) {
      return undefined
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
        trigger: (action: Actions) => void
      },
    ) => HandlerReturn
  },
  options?: { name?: string },
): BoundStateFn<string, Actions, Data> =>
  stateWrapper(
    options?.name ?? `AnonymousState${counter++}`,
    matchAction(handlers),
  )
