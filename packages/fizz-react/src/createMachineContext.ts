import type { ReactNode } from "react"
import { createContext, createElement, useContext } from "react"

import type {
  ActionMap,
  AnyBoundState,
  ContextValue,
  Options,
} from "./machineStore.js"
import { useMachineValue } from "./machineStore.js"

interface MachineProviderProps<SM extends { [key: string]: AnyBoundState }> {
  children?: ReactNode
  initialState: ReturnType<SM[keyof SM]>
  options?: Partial<Options>
}

export const createMachineContext = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  _states: SM,
  actions: AM,
  outputActions: OAM = {} as OAM,
) => {
  const MachineContext = createContext<ContextValue<SM, AM, OAM> | undefined>(
    undefined,
  )

  const Provider = ({
    children,
    initialState,
    options = {},
  }: MachineProviderProps<SM>) => {
    const value = useMachineValue<SM, AM, OAM>(
      actions,
      initialState,
      outputActions,
      options,
    )

    return createElement(MachineContext.Provider, { value }, children)
  }

  const useMachineContext = () => {
    const value = useContext(MachineContext)

    if (!value) {
      throw new Error(
        "useMachineContext must be used within the matching machine Provider",
      )
    }

    return value
  }

  return {
    Provider,
    useMachineContext,
  }
}
