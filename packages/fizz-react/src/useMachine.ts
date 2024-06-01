import { useEffect, useState } from "react"
import {
  type Action,
  enter,
  beforeEnter,
  type BoundStateFn,
  type StateTransition,
  Context,
  createInitialContext,
  Runtime,
  createRuntime,
} from "@tdreyno/fizz"

interface ContextValue<
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  OAM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
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
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  OAM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  R extends ContextValue<SM, AM, OAM>,
>(
  _states: SM,
  actions: AM,
  initialState: StateTransition<any, any, any>,
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

  const [context, setContext] = useState<R>({
    context: defaultContext,
    currentState: defaultContext.currentState as ReturnType<SM[keyof SM]>,
    actions: boundActions,
    runtime,
  } as R)

  useEffect(() => {
    const unsub = runtime.onContextChange(context =>
      setContext(r => ({
        ...r,
        context,
        currentState: context.currentState as ReturnType<SM[keyof SM]>,
      })),
    )

    void runtime.run(beforeEnter(runtime))
    void runtime.run(enter())

    return unsub
  }, [])

  return context
}
