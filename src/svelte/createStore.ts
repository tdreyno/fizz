import { type Action, enter, beforeEnter } from "../action.js"
import type { BoundStateFn, StateTransition } from "../state.js"
import { Context, createInitialContext } from "../context.js"
import { Readable, readable } from "svelte/store"
import { Runtime, createRuntime } from "../runtime.js"

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
  maxHistory: number
  restartOnInitialStateChange?: boolean
  enableLogging?: boolean
}

export const createStore = <
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  R extends Readable<ContextValue<SM, AM>>,
>(
  _states: SM,
  actions: AM,
  initialState: StateTransition<any, any, any>,
  options: Partial<Options> = {},
): R => {
  const { maxHistory = 5, enableLogging = false } = options

  const defaultContext = createInitialContext([initialState], {
    maxHistory,
    enableLogging,
  })

  const runtime = createRuntime(defaultContext, Object.keys(actions))

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

    void runtime.run(beforeEnter(runtime))
    void runtime.run(enter())

    return unsub
  }) as R
}
