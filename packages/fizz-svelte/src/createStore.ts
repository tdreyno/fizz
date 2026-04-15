import type { Action, BoundStateFn } from "@tdreyno/fizz"
import {
  Context,
  createInitialContext,
  createRuntime,
  enter,
  Runtime,
} from "@tdreyno/fizz"
// eslint-disable-next-line import/no-duplicates
import { onMount } from "svelte"
// eslint-disable-next-line import/no-duplicates
import { readable } from "svelte/store"

type AnyBoundState = BoundStateFn<any, any, any>
type ActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

export interface ContextValue<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
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
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  R extends import("svelte/store").Readable<ContextValue<SM, AM, OAM>> & {
    respondOnMount: <
      OA extends ReturnType<OAM[keyof OAM]>,
      T extends OA["type"],
      A extends ReturnType<AM[keyof AM]>,
    >(
      type: T,
      handler: (
        payload: Extract<OA, { type: T }>["payload"],
      ) => Promise<A> | A | void,
    ) => void
  },
>(
  _states: SM,
  actions: AM,
  initialState: ReturnType<SM[keyof SM]>,
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

  const start = (set: (value: ContextValue<SM, AM, OAM>) => void) => {
    const unsub = runtime.onContextChange(context =>
      set({
        context,
        currentState: context.currentState as ReturnType<SM[keyof SM]>,
        actions: boundActions,
        runtime,
      }),
    )

    void runtime.run(enter())

    return unsub
  }

  const store = readable(initialContext, start) as R

  store.respondOnMount = <
    OA extends ReturnType<OAM[keyof OAM]>,
    T extends OA["type"],
    A extends ReturnType<AM[keyof AM]>,
  >(
    type: T,
    handler: (
      payload: Extract<OA, { type: T }>["payload"],
    ) => Promise<A> | A | void,
  ) => {
    type RuntimeRespondType = Parameters<typeof runtime.respondToOutput>[0]
    type RuntimeRespondHandler = Parameters<typeof runtime.respondToOutput>[1]

    onMount(() =>
      runtime.respondToOutput(
        type as unknown as RuntimeRespondType,
        handler as RuntimeRespondHandler,
      ),
    )
  }

  return store
}
