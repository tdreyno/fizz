import { useEffect, useRef } from "react"

import type { ActionMap, AnyBoundState, ContextValue } from "./machineStore.js"

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
