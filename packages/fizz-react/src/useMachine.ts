import type { MachineDefinition } from "@tdreyno/fizz"
import { useMemo, useSyncExternalStore } from "react"

import type {
  ActionMap,
  AnyBoundState,
  ContextValue,
  MachineHandle,
  Options,
  SelectorMap,
} from "./machineStore.js"
import {
  createMachineHandleFromStore,
  subscribeIfEnabled,
  useMachineStore,
} from "./machineStore.js"

type UseMachineSimpleOptions = Partial<Options> & {
  disableAutoSelectors?: false
}

type UseMachineOptimizedOptions = Partial<Options> & {
  disableAutoSelectors: true
}

export function useMachine<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options?: UseMachineSimpleOptions,
): ContextValue<SM, AM, OAM, SEL>

export function useMachine<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: UseMachineOptimizedOptions,
): MachineHandle<SM, AM, OAM, SEL>

export function useMachine<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM, SEL> | MachineHandle<SM, AM, OAM, SEL> {
  const disableAutoSelectors = options.disableAutoSelectors === true
  const store = useMachineStore<SM, AM, OAM, SEL>(
    machine,
    initialState,
    disableAutoSelectors
      ? {
          ...options,
          disableAutoSelectors: true,
        }
      : options,
  )

  const contextValue = useSyncExternalStore(
    subscribeIfEnabled(!disableAutoSelectors, store.subscribe),
    store.getSnapshot,
    store.getSnapshot,
  )
  const machineHandle = useMemo(() => createMachineHandleFromStore(store), [])

  return disableAutoSelectors ? machineHandle : contextValue
}
