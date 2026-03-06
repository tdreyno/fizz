import type { Action, BoundStateFn } from "@tdreyno/fizz"
import {
  beforeEnter,
  Context,
  createInitialContext,
  createRuntime,
  enter,
  Runtime,
} from "@tdreyno/fizz"
import { useEffect, useMemo, useState } from "react"

type AnyBoundState = BoundStateFn<any, any, any>
type ActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

interface ContextValue<
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

export const useMachine = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  R extends ContextValue<SM, AM, OAM>,
>(
  _states: SM,
  actions: AM,
  initialState: ReturnType<SM[keyof SM]>,
  outputActions: OAM = {} as OAM,
  options: Partial<Options> = {},
): R => {
  const { defaultContext, runtime, boundActions } = useMemo(() => {
    const { maxHistory = 5, enableLogging = false } = options

    const defaultContext = createInitialContext([initialState], {
      maxHistory,
      enableLogging,
    })

    const runtime = createRuntime(defaultContext, actions, outputActions)

    const boundActions = runtime.bindActions(actions)

    return {
      defaultContext,
      runtime,
      boundActions,
    }
  }, [])

  const [context, setContext] = useState<R>({
    context: defaultContext,
    currentState: defaultContext.currentState as ReturnType<SM[keyof SM]>,
    actions: boundActions,
    runtime,
  } as R)

  useEffect(() => {
    const unsub = runtime.onContextChange(context => {
      setContext(r => ({
        ...r,
        context,
        currentState: context.currentState as ReturnType<SM[keyof SM]>,
      }))
    })

    void runtime.run(beforeEnter(runtime))
    void runtime.run(enter())

    return unsub
  }, [])

  return context
}
