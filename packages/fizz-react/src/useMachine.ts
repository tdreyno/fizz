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
  _states: SM,
  actions: AM,
  initialState: ReturnType<SM[keyof SM]>,
  outputActions: OAM = {} as OAM,
  options: Partial<Options> = {},
): ContextValue<SM, AM, OAM> =>
  useMachineValue<SM, AM, OAM>(actions, initialState, outputActions, options)
