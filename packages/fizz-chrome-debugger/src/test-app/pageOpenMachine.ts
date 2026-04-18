import type { ActionCreatorType, BoundStateFn, Enter } from "@tdreyno/fizz"
import { action, createMachine, state } from "@tdreyno/fizz"
import { useMachine } from "@tdreyno/fizz-react"

import { registerFizzDebuggerMachineGraph } from "../index.js"

type IntervalId = "page-open"

const reset = action("Reset")
type RunningActions = Enter | ActionCreatorType<typeof reset>

export type PageOpenData = {
  secondsOpen: number
}

const initialPageOpenData = (): PageOpenData => ({
  secondsOpen: 0,
})

type RunningState = BoundStateFn<"Running", RunningActions, PageOpenData>

const Running = state<RunningActions, PageOpenData, never, IntervalId>(
  {
    Enter: (_, __, { startInterval }) => startInterval("page-open", 1000),

    Reset: () => Running(initialPageOpenData()),

    IntervalTriggered: (data, _, { update }) =>
      update({
        secondsOpen: data.secondsOpen + 1,
      }),
  },
  { name: "Running" },
) as RunningState

const PageOpenStates = {
  Running,
}

const PageOpenActions = {
  reset,
}

export const PageOpenMachine = createMachine(
  {
    actions: PageOpenActions,
    states: PageOpenStates,
  },
  "PageOpenMachine",
)

registerFizzDebuggerMachineGraph({
  graph: {
    entryState: "Running",
    name: "PageOpenMachine",
    nodes: [{ id: "Running", x: 0, y: 0 }],
    transitions: [{ action: "Reset", from: "Running", to: "Running" }],
  },
  label: "PageOpenMachine",
})

export type PageOpenRuntimeState = ReturnType<typeof Running>

export type PageOpenMachineValue = {
  actions: {
    reset: () => {
      asPromise: () => Promise<void>
    }
  }
  currentState: PageOpenRuntimeState
}

export const usePageOpenMachine = (): PageOpenMachineValue =>
  useMachine(
    PageOpenMachine,
    PageOpenMachine.states.Running(initialPageOpenData()),
  ) as PageOpenMachineValue

export { reset, Running }
