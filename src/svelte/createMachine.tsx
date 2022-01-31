import { Readable, readable } from "svelte/store"
import { Action, enter } from "../action"
import { Context, createInitialContext } from "../context"
import { createRuntime, Runtime } from "../runtime"
import { BoundStateFn, StateTransition } from "../state"

export interface ContextValue<
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
> {
  currentState: ReturnType<SM[keyof SM]>
  context: Context
  actions: AM
  runtime?: Runtime
}

interface Options {
  fallback: BoundStateFn<any, any, any>
  maxHistory: number
  restartOnInitialStateChange?: boolean
  disableLogging?: boolean
}

export const createMachine = <
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  R extends Readable<ContextValue<SM, AM>>,
>(
  _states: SM,
  actions: AM,
  initialState: StateTransition<any, any, any>,
  options: Partial<Options> = {
    maxHistory: 5,
  },
): R => {
  const { maxHistory, disableLogging, fallback } = options

  const defaultContext = createInitialContext([initialState], {
    maxHistory,
    disableLogging,
  })

  const runtime = createRuntime(defaultContext, Object.keys(actions), fallback)

  const boundActions = runtime.bindActions(actions)

  const initialContext: ContextValue<SM, AM> = {
    context: defaultContext,
    currentState: defaultContext.currentState as ReturnType<SM[keyof SM]>,
    actions: boundActions,
    runtime,
  }

  return readable(initialContext, set => {
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
  }) as R
}
