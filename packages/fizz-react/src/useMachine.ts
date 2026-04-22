import type { MachineDefinition } from "@tdreyno/fizz"

import type {
  ActionMap,
  AnyBoundState,
  ContextValue,
  Options,
  SelectorMap,
} from "./machineStore.js"
import { useMachineValue } from "./machineStore.js"

export const useMachine = <
  SM extends { [key: string]: AnyBoundState },
  AM extends ActionMap,
  OAM extends ActionMap,
  SEL extends SelectorMap<SM> = Record<string, never>,
>(
  machine: MachineDefinition<SM, AM, OAM, unknown, SEL>,
  initialState: ReturnType<SM[keyof SM]>,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM, SEL> =>
  useMachineValue<SM, AM, OAM, SEL>(machine, initialState, options)
