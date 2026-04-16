import type {
  Action,
  BoundStateFn,
  MachineDefinition,
  StateTransition,
} from "@tdreyno/fizz"
import { Context, createRuntime, enter, Runtime } from "@tdreyno/fizz"
import { useEffect, useMemo, useState } from "react"

export type AnyBoundState = BoundStateFn<string, Action<string, unknown>, any>

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
  SM extends { [key: string]: AnyBoundState },
  S extends StateTransition<string, Action<string, unknown>, unknown>,
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: S,
  options: Partial<Options>,
) => {
  const { maxHistory = 5, enableLogging = false } = options

  const runtime = createRuntime(machine, initialState, {
    enableLogging,
    maxHistory,
  })

  return {
    defaultContext: runtime.context,
    runtime,
    boundActions: runtime.bindActions((machine.actions ?? {}) as AM),
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
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM> => {
  const { defaultContext, runtime, boundActions } = useMemo(
    () => createMachineRuntime(machine, initialState, options),
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
