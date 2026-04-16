import type { Action, BoundStateFn, MachineDefinition } from "@tdreyno/fizz"
import { Context, createRuntime, enter, Runtime } from "@tdreyno/fizz"
// eslint-disable-next-line import/no-duplicates
import { onMount } from "svelte"
// eslint-disable-next-line import/no-duplicates
import { readable } from "svelte/store"

type AnyBoundState = BoundStateFn<string, Action<string, unknown>, any>
type ActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}
type PromiseActions<AM extends ActionMap> = {
  [K in keyof AM]: (...args: Parameters<AM[K]>) => {
    asPromise: () => Promise<void>
  }
}

export interface ContextValue<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  PM = PromiseActions<AM>,
> {
  currentState: ReturnType<SM[keyof SM]>
  context: Context
  actions: PM
  runtime?: Runtime<AM, OAM>
}

type MachineStore<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
> = import("svelte/store").Readable<ContextValue<SM, AM, OAM>> & {
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
>(
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): MachineStore<SM, AM, OAM> => {
  const { maxHistory = 5, enableLogging = false } = options
  const actions = (machine.actions ?? {}) as AM
  const runtime = createRuntime(machine, initialState, {
    enableLogging,
    maxHistory,
  })

  const boundActions = runtime.bindActions(actions)

  const initialContext: ContextValue<SM, AM, OAM> = {
    context: runtime.context,
    currentState: runtime.context.currentState as ReturnType<SM[keyof SM]>,
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

  const store = readable(initialContext, start) as MachineStore<SM, AM, OAM>

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
    onMount(() => runtime.respondToOutput(type, handler))
  }

  return store
}
