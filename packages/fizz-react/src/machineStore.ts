import type { Action, BoundStateFn, MachineDefinition } from "@tdreyno/fizz"
import { Context, createRuntime, enter, Runtime } from "@tdreyno/fizz"
import { useEffect, useMemo, useState } from "react"

export type AnyBoundState = {
  (
    ...data: Array<unknown>
  ): ReturnType<BoundStateFn<string, Action<string, unknown>, unknown>>
  name: string
}

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
  states: SM
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
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: ReturnType<SM[keyof SM]>,
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
  states: SM,
  context: Context,
  runtime: Runtime<AM, OAM>,
  actions: PromiseActions<AM>,
): ContextValue<SM, AM, OAM> => ({
  states,
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
    createMachineValue<SM, AM, OAM>(
      machine.states,
      defaultContext,
      runtime,
      boundActions,
    ),
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
