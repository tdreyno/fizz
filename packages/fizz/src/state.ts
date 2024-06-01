import {
  type Action,
  type ActionCreator,
  type ActionName,
  type ActionPayload,
  type BeforeEnter,
  enter,
  type Enter,
  type ActionCreatorType,
  type GetActionCreatorType,
  createAction,
} from "./action.js"
import { createInitialContext } from "./context.js"
import { Effect, noop, output } from "./effect.js"
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

type SyncHandlerReturn = void | StateReturn | Array<StateReturn>
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
    parentRuntime?: Runtime<any, any>
    trigger: (action: A) => void
  },
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
>(
  name: Name,
  executor: State<Name, A, Data>,
): BoundStateFn<Name, A, Data> => {
  const fn = (data: Data) => ({
    name,
    data,
    isStateTransition: true,
    mode: "append",

    executor: (action: A, runtime?: Runtime<any, any>) => {
      // Run state executor
      return executor(action, data, {
        update,
        trigger: (a: A) => {
          void runtime?.run(a)
        },
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        parentRuntime: data ? (data as any)[PARENT_RUNTIME] : undefined,
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
        parentRuntime?: Runtime<any, any>
        trigger: (action: Actions) => void
      },
    ) => HandlerReturn
  }) =>
  (
    action: Actions,
    data: Data,
    utils: {
      update: (data: Data) => StateTransition<string, Actions, Data>
      parentRuntime?: Runtime<any, any>
      trigger: (action: Actions) => void
    },
  ): HandlerReturn => {
    const handler = (handlers as never)[action.type] as (
      data: Data,
      payload: ActionPayload<Actions>,
      utils: {
        update: (data: Data) => StateTransition<string, Actions, Data>
        parentRuntime?: Runtime<any, any>
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
        parentRuntime?: Runtime<any, any>
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

export const NESTED = Symbol("Nested runtime")

export const stateWithNested = <
  Actions extends Action<string, any>,
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
  initialNestedState: StateTransition<any, any, any>,
  nestedActions: { [key: string]: ActionCreator<any, any> },
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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    initialNestedState.data[PARENT_RUNTIME] = parentRuntime

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

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const forwarders = Object.entries(nestedActions).reduce(
    (acc, [key, action]) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      acc[key] = async (data: any, payload: any, { update }: any) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        await data[NESTED]?.run(action(payload))

        // Force update
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-call
        return update({ ...data })
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return acc
    },
    {} as any,
  )

  return state<Actions, Data>(
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    { ...handlers, ...forwarders, BeforeEnter: beforeEnter },
    options,
  )
}

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
