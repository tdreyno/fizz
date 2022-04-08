import { Action, enter } from "../action.js"
import { BoundStateFn, StateTransition, stateWrapper } from "../state.js"
import { Context, createInitialContext } from "../context.js"
import React, {
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Runtime, createRuntime } from "../runtime.js"

import isFunction from "lodash.isfunction"
import { noop } from "../effect.js"

export interface CreateProps<
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
> {
  initialState: StateTransition<any, any, any>
  children:
    | ReactNode
    | ((api: {
        actions: AM
        context: Context
        currentState: ReturnType<SM[keyof SM]>
      }) => ReactNode)
}

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

export function createFizzContext<
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
>(_states: SM, actions: AM, options: Partial<Options> = {}) {
  const {
    restartOnInitialStateChange,
    maxHistory = 5,
    fallback,
    disableLogging = false,
  } = options

  const defaultContext = createInitialContext(
    [stateWrapper("Placeholder", () => noop())()],
    { maxHistory, disableLogging },
  )

  const MachineContext = React.createContext<ContextValue<SM, AM>>({
    context: defaultContext,
    currentState: defaultContext.currentState as ReturnType<SM[keyof SM]>,
    actions,
  })

  function Provider({
    initialState: initialStateProp,
    children,
  }: CreateProps<SM, AM>) {
    const [initialState, resetState] = useState(initialStateProp)

    useEffect(() => {
      if (restartOnInitialStateChange) {
        resetState(initialStateProp)
      }
    }, [initialStateProp])

    const runtime = useMemo(
      () =>
        createRuntime(
          createInitialContext([initialState], { maxHistory, disableLogging }),
          Object.keys(actions),
          fallback,
        ),
      [initialState],
    )

    const boundActions = useMemo(() => runtime.bindActions(actions), [runtime])

    const [value, setValue] = useState<ContextValue<SM, AM>>({
      context: runtime.context,
      currentState: runtime.context.currentState as ReturnType<SM[keyof SM]>,
      actions: boundActions,
      runtime,
    })

    useEffect(() => {
      const unsub = runtime.onContextChange(context =>
        setValue({
          context,
          currentState: context.currentState as ReturnType<SM[keyof SM]>,
          actions: boundActions,
          runtime,
        }),
      )

      void runtime.run(enter())

      return unsub
    }, [])

    return (
      <MachineContext.Provider value={value}>
        {isFunction(children) ? (
          <MachineContext.Consumer>
            {currentValue =>
              children({
                actions: currentValue.actions,
                context: currentValue.context,
                currentState: currentValue.context.currentState as ReturnType<
                  SM[keyof SM]
                >,
              })
            }
          </MachineContext.Consumer>
        ) : (
          children
        )}
      </MachineContext.Provider>
    )
  }

  return {
    Context: MachineContext,
    Provider,
  }
}

export const useMachine = <
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
>(machine: {
  Context: React.Context<ContextValue<SM, AM>>
}) => {
  const { currentState, actions } = useContext(machine.Context)
  return { currentState, actions }
}
