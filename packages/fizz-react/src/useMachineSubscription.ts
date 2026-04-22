import { useEffect, useRef, useSyncExternalStore } from "react"

import type {
  ActionMap,
  AnyBoundState,
  ContextValue,
  MachineHandle,
} from "./machineStore.js"

export type MachineSubscriptionOptions = {
  emitCurrent?: boolean
}

export type MachineSubscriptionListener<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
> = (
  state: ReturnType<SM[keyof SM]>,
  context: ContextValue<SM, AM, OAM>["context"],
) => void

export type StateExitListener<
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
> = (
  state: ReturnType<SM[keyof SM]>,
  context: ContextValue<SM, AM, OAM>["context"],
) => void

export const useStateMatch = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  S extends SM[keyof SM],
>(
  machine: ContextValue<SM, AM, OAM>,
  targetState: S,
): boolean => machine.currentState.name === targetState.name

export const useMachineSubscription = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  machine: ContextValue<SM, AM, OAM>,
  listener: MachineSubscriptionListener<SM, AM, OAM>,
  options: MachineSubscriptionOptions = {},
): void => {
  const { emitCurrent = false } = options
  const listenerRef = useRef(listener)

  useEffect(() => {
    listenerRef.current = listener
  }, [listener])

  useEffect(() => {
    const runtime = machine.runtime

    if (!runtime) {
      return
    }

    const notify = (context: ContextValue<SM, AM, OAM>["context"]) => {
      listenerRef.current(
        context.currentState as ReturnType<SM[keyof SM]>,
        context,
      )
    }

    if (emitCurrent) {
      notify(runtime.context)
    }

    return runtime.onContextChange(context => {
      notify(context)
    })
  }, [machine.runtime, emitCurrent])
}

export const useOnStateExit = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  S extends SM[keyof SM],
>(
  machine: ContextValue<SM, AM, OAM>,
  targetState: S,
  listener: StateExitListener<SM, AM, OAM>,
  options: MachineSubscriptionOptions = {},
): void => {
  const listenerRef = useRef(listener)
  const wasInStateRef = useRef(machine.currentState.name === targetState.name)

  useEffect(() => {
    listenerRef.current = listener
  }, [listener])

  useEffect(() => {
    wasInStateRef.current = machine.currentState.name === targetState.name
  }, [machine.currentState, targetState])

  useMachineSubscription(
    machine,
    (currentState, context) => {
      const isInTargetState = currentState.name === targetState.name

      if (wasInStateRef.current && !isInTargetState) {
        listenerRef.current(currentState, context)
      }

      wasInStateRef.current = isInTargetState
    },
    options,
  )
}

export const useSelector = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  Selected,
>(
  machine: MachineHandle<SM, AM, OAM>,
  selector: (snapshot: ContextValue<SM, AM, OAM>) => Selected,
  equalityFn: (a: Selected, b: Selected) => boolean = Object.is,
): Selected => {
  const selectedRef = useRef<Selected | undefined>(undefined)
  const hasValueRef = useRef(false)

  const getSelectedSnapshot = () => {
    const next = selector(machine.getSnapshot())

    if (
      hasValueRef.current &&
      equalityFn(selectedRef.current as Selected, next)
    ) {
      return selectedRef.current as Selected
    }

    selectedRef.current = next
    hasValueRef.current = true

    return next
  }

  return useSyncExternalStore(
    machine.__store.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot,
  )
}
