import type { MachineDefinition } from "@tdreyno/fizz"

import type {
  ActionMap,
  AnyBoundState,
  ContextValue,
  Options,
} from "./machineStore.js"
import { useMachineValue } from "./machineStore.js"

export const useMachine = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
>(
  machine: MachineDefinition<SM, AM, OAM>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM> =>
  useMachineValue<SM, AM, OAM>(machine, initialState, options)
