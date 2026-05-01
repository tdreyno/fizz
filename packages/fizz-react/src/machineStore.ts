import type {
  Action,
  MachineDefinition,
  RuntimeBrowserDriver,
  StateSelector,
} from "@tdreyno/fizz"
import {
  Context,
  createRuntime,
  enter,
  runStateSelector,
  Runtime,
} from "@tdreyno/fizz"
import { useEffect, useMemo, useSyncExternalStore } from "react"

export type AnyBoundState = {
  (...data: Array<any>): any
  name: string
}

export type ActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

export type SelectorMap<SM extends { [key: string]: AnyBoundState }> = Record<
  string,
  StateSelector<SM[keyof SM] | ReadonlyArray<SM[keyof SM]>, unknown>
>

type SelectorResult<S extends StateSelector<any, any>> =
  S extends StateSelector<any, infer Result> ? Result : never

export type BoundSelectors<Selectors extends SelectorMap<any>> = {
  [K in keyof Selectors]: SelectorResult<Selectors[K]>
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
  SEL extends SelectorMap<SM> = Record<string, never>,
  PM = PromiseActions<AM>,
> {
  currentState: ReturnType<SM[keyof SM]>
  states: SM
  context: Context
  actions: PM
  selectors: BoundSelectors<SEL>
  runtime?: Runtime<AM, OAM>
}

export interface Options {
  clients?: Record<string, unknown>
  driver?: RuntimeBrowserDriver
  maxHistory: number
  restartOnInitialStateChange?: boolean
  enableLogging?: boolean
  disableAutoSelectors?: boolean
}

type MachineStore<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM>,
> = {
  getSnapshot: () => ContextValue<SM, AM, OAM, SEL>
  start: () => void
  stop: () => void
  subscribe: (listener: () => void) => () => void
}

const noopSubscribe = () => () => undefined

export interface MachineHandle<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
> {
  actions: PromiseActions<AM>
  context: ContextValue<SM, AM, OAM, SEL>["context"]
  currentState: ReturnType<SM[keyof SM]>
  getSnapshot: () => ContextValue<SM, AM, OAM, SEL>
  runtime: Runtime<AM, OAM>
  selectors: BoundSelectors<SEL>
  states: SM
  __store: MachineStore<SM, AM, OAM, SEL>
}

const createMachineRuntime = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options>,
) => {
  const { maxHistory = 5, enableLogging = false, driver, clients } = options

  const runtime = createRuntime(
    machine as MachineDefinition<SM, AM, OAM>,
    initialState,
    {
      ...(driver === undefined ? {} : { browserDriver: driver }),
      ...(clients === undefined ? {} : { clients }),
      enableLogging,
      maxHistory,
    },
  )

  return {
    defaultContext: runtime.context,
    runtime,
    boundActions: runtime.bindActions((machine.actions ?? {}) as AM),
  }
}

const bindSelectors = <
  SM extends { [key: string]: AnyBoundState },
  SEL extends SelectorMap<SM>,
>(
  selectors: SEL,
  context: Context,
  previous?: BoundSelectors<SEL>,
): BoundSelectors<SEL> => {
  const next = {} as BoundSelectors<SEL>

  for (const key of Object.keys(selectors) as Array<keyof SEL>) {
    const selector = selectors[key]

    if (!selector) {
      continue
    }

    const previousValue = previous?.[key] as SelectorResult<SEL[typeof key]>
    const nextValue = runStateSelector(
      selector,
      context.currentState as ReturnType<SM[keyof SM]>,
      context,
    ) as SelectorResult<SEL[typeof key]>

    if (
      previous !== undefined &&
      selector.equalityFn?.(previousValue, nextValue) === true
    ) {
      next[key] = previousValue as BoundSelectors<SEL>[typeof key]
      continue
    }

    next[key] = nextValue as BoundSelectors<SEL>[typeof key]
  }

  return next
}

const createMachineValue = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM>,
>(
  states: SM,
  context: Context,
  runtime: Runtime<AM, OAM>,
  actions: PromiseActions<AM>,
  selectors: BoundSelectors<SEL>,
): ContextValue<SM, AM, OAM, SEL> => ({
  states,
  context,
  currentState: context.currentState as ReturnType<SM[keyof SM]>,
  actions,
  selectors,
  runtime,
})

const createMachineStore = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options>,
): MachineStore<SM, AM, OAM, SEL> => {
  const { defaultContext, runtime, boundActions } = createMachineRuntime<
    SM,
    AM,
    OAM,
    SEL
  >(machine, initialState, options)

  const selectorDefinitions = (machine.selectors ?? {}) as SEL
  let currentSnapshot = createMachineValue<SM, AM, OAM, SEL>(
    machine.states,
    defaultContext,
    runtime,
    boundActions,
    bindSelectors<SM, SEL>(selectorDefinitions, defaultContext),
  )

  let unsubscribeRuntime: (() => void) | undefined
  const listeners = new Set<() => void>()

  const emit = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    getSnapshot: () => currentSnapshot,
    start: () => {
      if (unsubscribeRuntime) {
        return
      }

      unsubscribeRuntime = runtime.onContextChange(context => {
        currentSnapshot = {
          ...currentSnapshot,
          context,
          currentState: context.currentState as ReturnType<SM[keyof SM]>,
          selectors: bindSelectors<SM, SEL>(
            selectorDefinitions,
            context,
            currentSnapshot.selectors,
          ),
        }
        emit()
      })

      void runtime.run(enter())
    },
    stop: () => {
      unsubscribeRuntime?.()
      unsubscribeRuntime = undefined
      runtime.disconnect()
    },
    subscribe: listener => {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const useMachineStore = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): MachineStore<SM, AM, OAM, SEL> => {
  const store = useMemo(
    () => createMachineStore<SM, AM, OAM, SEL>(machine, initialState, options),
    [],
  )

  useEffect(() => {
    store.start()

    return () => {
      store.stop()
    }
  }, [])

  return store
}

export const createMachineHandleFromStore = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  store: MachineStore<SM, AM, OAM, SEL>,
): MachineHandle<SM, AM, OAM, SEL> => {
  const snapshot = store.getSnapshot()

  return {
    actions: snapshot.actions,
    get context() {
      return store.getSnapshot().context
    },
    get currentState() {
      return store.getSnapshot().currentState
    },
    getSnapshot: store.getSnapshot,
    runtime: snapshot.runtime!,
    get selectors() {
      return store.getSnapshot().selectors
    },
    states: snapshot.states,
    __store: store,
  }
}

export const useMachineValue = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM, SEL> => {
  const store = useMachineStore<SM, AM, OAM, SEL>(
    machine,
    initialState,
    options,
  )

  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  )
}

export const useMachineHandle = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): MachineHandle<SM, AM, OAM, SEL> => {
  const store = useMachineStore<SM, AM, OAM, SEL>(machine, initialState, {
    ...options,
    disableAutoSelectors: true,
  })

  return useMemo(() => createMachineHandleFromStore(store), [])
}

export const subscribeIfEnabled = (
  enabled: boolean,
  subscribe: (listener: () => void) => () => void,
) => (enabled ? subscribe : noopSubscribe)
