import { isAction } from "../action.js"
import type { Effect } from "../effect.js"
import { isEffect } from "../effect.js"
import { UnknownStateReturnType } from "../errors.js"
import type { StateReturn } from "../state.js"
import { isStateTransition } from "../state.js"
import type {
  RuntimeAction,
  RuntimeDebugCommand,
  RuntimeState,
} from "./runtimeContracts.js"

const isRuntimeState = (item: unknown): item is RuntimeState => {
  return isStateTransition(item)
}

export const actionCommand = (action: RuntimeAction): RuntimeDebugCommand => {
  return {
    action,
    kind: "action",
  }
}

export const stateCommand = (state: RuntimeState): RuntimeDebugCommand => {
  return {
    kind: "state",
    state,
  }
}

export const effectCommand = (
  effectValue: Effect<unknown>,
): RuntimeDebugCommand => {
  return {
    effect: effectValue,
    kind: "effect",
  }
}

export const toRuntimeCommand = (
  item: RuntimeAction | RuntimeState | Effect<unknown>,
): RuntimeDebugCommand => {
  if (isAction(item)) {
    return actionCommand(item)
  }

  if (isRuntimeState(item)) {
    return stateCommand(item)
  }

  if (isEffect(item)) {
    return effectCommand(item)
  }

  throw new UnknownStateReturnType(item)
}

export const commandsFromStateReturns = (
  stateReturns: StateReturn[],
): RuntimeDebugCommand[] => {
  return stateReturns.map(item => toRuntimeCommand(item))
}
