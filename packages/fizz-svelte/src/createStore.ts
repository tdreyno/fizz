/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import type { Action, BoundStateFn, StateTransition } from "@tdreyno/fizz"
import {
  beforeEnter,
  Context,
  createInitialContext,
  createRuntime,
  enter,
  Runtime,
} from "@tdreyno/fizz"
import { onMount } from "svelte"
import { readable } from "svelte/store"
import type { Readable } from "svelte/store"

export interface ContextValue<
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  OAM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  PM = {
    [K in keyof AM]: (...args: Parameters<AM[K]>) => {
      asPromise: () => Promise<void>
    }
  },
> {
  currentState: ReturnType<SM[keyof SM]>
  context: Context
  actions: PM
  runtime?: Runtime<AM, OAM>
}

interface Options {
  maxHistory: number
  restartOnInitialStateChange?: boolean
  enableLogging?: boolean
}

export const createStore = <
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  OAM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  R extends Readable<ContextValue<SM, AM, OAM>> & {
    respondOnMount: <
      T extends OAM["type"],
      P extends Extract<OAM, { type: T }>["payload"],
      A extends ReturnType<AM[keyof AM]>,
    >(
      type: T,
      handler: (payload: P) => Promise<A> | A | void,
    ) => void
  },
>(
  _states: SM,
  actions: AM,
  initialState: StateTransition<any, any, any>,
  outputActions: OAM = {} as OAM,
  options: Partial<Options> = {},
): R => {
  const { maxHistory = 5, enableLogging = false } = options

  const defaultContext = createInitialContext([initialState], {
    maxHistory,
    enableLogging,
  })

  const runtime = createRuntime(defaultContext, actions, outputActions)

  const boundActions = runtime.bindActions(actions)

  const initialContext: ContextValue<SM, AM, OAM> = {
    context: defaultContext,
    currentState: defaultContext.currentState as ReturnType<SM[keyof SM]>,
    actions: boundActions,
    runtime,
  }

  const store = readable(initialContext, (set: any) => {
    const unsub = runtime.onContextChange(context =>
      set({
        context,
        currentState: context.currentState as ReturnType<SM[keyof SM]>,
        actions: boundActions,
        runtime,
      }),
    )

    void runtime.run(beforeEnter(runtime))
    void runtime.run(enter())

    return unsub
  }) as R

  store.respondOnMount = <
    T extends OAM["type"],
    P extends Extract<OAM, { type: T }>["payload"],
    A extends ReturnType<AM[keyof AM]>,
  >(
    type: T,
    handler: (payload: P) => Promise<A> | A | void,
  ) => {
    onMount(() => runtime.respondToOutput(type, handler))
  }

  return store
}
