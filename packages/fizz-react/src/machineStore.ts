import type { Action, BoundStateFn, StateTransition } from "@tdreyno/fizz"
import {
  Context,
  createInitialContext,
  createRuntime,
  enter,
  Runtime,
} from "@tdreyno/fizz"
import { useEffect, useMemo, useState } from "react"

export type AnyBoundState = BoundStateFn<any, any, any>

export type ActionMap = {
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

export interface Options {
  maxHistory: number
  restartOnInitialStateChange?: boolean
  enableLogging?: boolean
}

const createMachineRuntime = <
  S extends StateTransition<string, any, any>,
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  actions: AM,
  initialState: S,
  outputActions: OAM,
  options: Partial<Options>,
) => {
  const { maxHistory = 5, enableLogging = false } = options

  const defaultContext = createInitialContext([initialState], {
    maxHistory,
    enableLogging,
  })

  const runtime = createRuntime(defaultContext, actions, outputActions)

  return {
    defaultContext,
    runtime,
    boundActions: runtime.bindActions(actions),
  }
}

const createMachineValue = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  context: Context,
  runtime: Runtime<AM, OAM>,
  actions: PromiseActions<AM>,
): ContextValue<SM, AM, OAM> => ({
  context,
  currentState: context.currentState as ReturnType<SM[keyof SM]>,
  actions,
  runtime,
})

export const useMachineValue = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  actions: AM,
  initialState: ReturnType<SM[keyof SM]>,
  outputActions: OAM = {} as OAM,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM> => {
  const { defaultContext, runtime, boundActions } = useMemo(
    () => createMachineRuntime(actions, initialState, outputActions, options),
    [],
  )

  const [value, setValue] = useState<ContextValue<SM, AM, OAM>>(() =>
    createMachineValue<SM, AM, OAM>(defaultContext, runtime, boundActions),
  )

  useEffect(() => {
    const unsub = runtime.onContextChange(context => {
      setValue(current => ({
        ...current,
        context,
        currentState: context.currentState as ReturnType<SM[keyof SM]>,
      }))
    })

    void runtime.run(enter())

    return unsub
  }, [])

  return value
}
