import type { Action, MachineDefinition, StateSelector } from "@tdreyno/fizz"
import {
  Context,
  createRuntime,
  enter,
  runStateSelector,
  Runtime,
} from "@tdreyno/fizz"
import { useEffect, useMemo, useState } from "react"

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
  maxHistory: number
  restartOnInitialStateChange?: boolean
  enableLogging?: boolean
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
  const { maxHistory = 5, enableLogging = false } = options

  const runtime = createRuntime(
    machine as MachineDefinition<SM, AM, OAM>,
    initialState,
    {
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
  const { defaultContext, runtime, boundActions } = useMemo(
    () =>
      createMachineRuntime<SM, AM, OAM, SEL>(machine, initialState, options),
    [],
  )

  const selectorDefinitions = (machine.selectors ?? {}) as SEL

  const [value, setValue] = useState<ContextValue<SM, AM, OAM, SEL>>(() =>
    createMachineValue<SM, AM, OAM, SEL>(
      machine.states,
      defaultContext,
      runtime,
      boundActions,
      bindSelectors<SM, SEL>(selectorDefinitions, defaultContext),
    ),
  )

  useEffect(() => {
    const unsub = runtime.onContextChange(context => {
      setValue(current => ({
        ...current,
        context,
        currentState: context.currentState as ReturnType<SM[keyof SM]>,
        selectors: bindSelectors<SM, SEL>(
          selectorDefinitions,
          context,
          current.selectors,
        ),
      }))
    })

    void runtime.run(enter())

    return unsub
  }, [])

  return value
}
