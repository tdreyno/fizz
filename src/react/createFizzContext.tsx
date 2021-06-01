import isFunction from "lodash.isfunction"
import React, {
  ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Action, enter } from "../action"
import { Context, createInitialContext } from "../context"
import { noop } from "../effect"
import { createRuntime, Runtime } from "../runtime"
import { BoundStateFn, stateWrapper, StateTransition } from "../state"

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
  parent: { Context: React.Context<any> }
  fallback: BoundStateFn<any, any, any>
  maxHistory: number
  restartOnInitialStateChange?: boolean
  disableLogging?: boolean
}

export function createFizzContext<
  SM extends { [key: string]: BoundStateFn<any, any, any> },
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
>(
  _states: SM,
  actions: AM,
  options: Partial<Options> = {
    maxHistory: 5,
  },
) {
  const { restartOnInitialStateChange, maxHistory, fallback, disableLogging } =
    options

  const parentContext = options.parent
    ? options.parent.Context
    : React.createContext<any>({})

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

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const possibleParentContext = useContext(parentContext)

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parentRuntime = possibleParentContext
      ? // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        possibleParentContext.runtime
      : undefined

    const runtime = useMemo(
      () =>
        createRuntime(
          createInitialContext([initialState], { maxHistory, disableLogging }),
          Object.keys(actions),
          fallback,
          parentRuntime,
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
