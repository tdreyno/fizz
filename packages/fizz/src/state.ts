import type {
  Action,
  ActionCreator,
  ActionCreatorType,
  ActionName,
  ActionPayload,
  BeforeEnter,
  Enter,
  GetActionCreatorType,
  TimerCancelled,
  TimerCompleted,
  TimerStarted,
} from "./action.js"
import { createAction, enter } from "./action.js"
import { createInitialContext } from "./context.js"
import {
  cancelTimer as cancelTimerEffect,
  Effect,
  noop,
  output,
  restartTimer as restartTimerEffect,
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

type WithTimerActions<
  Actions extends Action<string, unknown>,
  TimeoutId extends string,
> = Actions | TimerActions<TimeoutId>

type StateUtils<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
> = {
  update: (
    data: Data,
  ) => StateTransition<Name, WithTimerActions<Actions, TimeoutId>, Data>
  parentRuntime?: Runtime<any, any>
  trigger: (action: WithTimerActions<Actions, TimeoutId>) => void
  startTimer: (timeoutId: TimeoutId, delay: number) => Effect
  cancelTimer: (timeoutId: TimeoutId) => Effect
  restartTimer: (timeoutId: TimeoutId, delay: number) => Effect
}

type Handler<
  Name extends string,
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
  A extends WithTimerActions<Actions, TimeoutId>,
> = (
  data: Data,
  payload: ActionPayload<A>,
  utils: StateUtils<Name, Actions, Data, TimeoutId>,
) => HandlerReturn

type StateHandlers<
  Actions extends Action<string, unknown>,
  Data,
  TimeoutId extends string,
> = {
  [A in Actions as ActionName<A>]: Handler<string, Actions, Data, TimeoutId, A>
} & {
  [A in TimerActions<TimeoutId> as ActionName<A>]?: Handler<
    string,
    Actions,
    Data,
    TimeoutId,
    A
  >
}

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
> = (
  action: WithTimerActions<Actions, TimeoutId>,
  data: Data,
  utils: StateUtils<Name, Actions, Data, TimeoutId>,
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
    },
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
      return executor(action, data, {
        update,
        trigger: (a: A) => {
          void runtime?.run(a)
        },
        startTimer: (timeoutId: TimeoutId, delay: number) =>
          startTimerEffect(timeoutId, delay),
        cancelTimer: (timeoutId: TimeoutId) => cancelTimerEffect(timeoutId),
        restartTimer: (timeoutId: TimeoutId, delay: number) =>
          restartTimerEffect(timeoutId, delay),
        ...(parentRuntime ? { parentRuntime } : {}),
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
  <Actions extends Action<string, unknown>, Data, TimeoutId extends string>(
    handlers: StateHandlers<Actions, Data, TimeoutId>,
  ) =>
  (
    action: WithTimerActions<Actions, TimeoutId>,
    data: Data,
    utils: StateUtils<string, Actions, Data, TimeoutId>,
  ): HandlerReturn => {
    const handler = (handlers as never)[action.type] as
      | Handler<
          string,
          Actions,
          Data,
          TimeoutId,
          WithTimerActions<Actions, TimeoutId>
        >
      | undefined

    if (!handler) {
      return undefined
    }

    return handler(data, action.payload as never, utils)
  }

let counter = 1

export const state = <
  Actions extends Action<string, unknown>,
  Data = undefined,
  TimeoutId extends string = string,
>(
  handlers: StateHandlers<Actions, Data, TimeoutId>,
  options?: { name?: string },
): BoundStateFn<string, WithTimerActions<Actions, TimeoutId>, Data> =>
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
