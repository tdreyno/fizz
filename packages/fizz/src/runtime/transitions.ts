import type { Action } from "../action.js"
import { beforeEnter, enter, exit } from "../action.js"
import type { Context } from "../context.js"
import type { Effect } from "../effect.js"
import { effect, log } from "../effect.js"
import type { Runtime } from "../runtime.js"
import type { StateTransition } from "../state.js"

type RuntimeState = StateTransition<string, any, unknown>

type CommandFactory<Command> = {
  actionCommand: (action: Action<string, unknown>) => Command
  effectCommand: (effect: Effect<unknown>) => Command
}

type TransitionOptions<Command> = CommandFactory<Command> & {
  clearAsync: () => void
  clearTimers: () => void
  context: Context
  notifyContextDidChange: () => void
  runtime: Runtime<any, any>
  targetState: RuntimeState
}

type GoBackOptions<Command> = CommandFactory<Command> & {
  clearAsync: () => void
  clearTimers: () => void
  context: Context
  runtime: Runtime<any, any>
}

export const buildStateTransitionCommands = <Command>({
  actionCommand,
  clearAsync,
  clearTimers,
  context,
  effectCommand,
  notifyContextDidChange,
  runtime,
  targetState,
}: TransitionOptions<Command>): Command[] => {
  const exitState = context.currentState

  if (exitState) {
    clearAsync()
  }

  const isUpdating =
    exitState?.name === targetState.name && targetState.mode === "update"

  return isUpdating
    ? buildUpdateStateCommands({
        context,
        effectCommand,
        notifyContextDidChange,
        targetState,
      })
    : buildEnterStateCommands({
        actionCommand,
        clearTimers,
        context,
        effectCommand,
        runtime,
        targetState,
      })
}

export const buildGoBackCommands = <Command>({
  actionCommand,
  clearAsync,
  clearTimers,
  context,
  effectCommand,
  runtime,
}: GoBackOptions<Command>): Command[] => {
  clearAsync()
  clearTimers()

  return [
    effectCommand(
      effect("updateHistory", undefined, () => {
        context.history.pop()
      }),
    ),
    actionCommand(beforeEnter(runtime)),
    actionCommand(enter()),
  ]
}

const buildUpdateStateCommands = <Command>({
  context,
  effectCommand,
  notifyContextDidChange,
  targetState,
}: Pick<
  TransitionOptions<Command>,
  "context" | "effectCommand" | "notifyContextDidChange" | "targetState"
>): Command[] => {
  return [
    effectCommand(
      effect("nextState", targetState, () => {
        context.history.pop()
        context.history.push(targetState as typeof context.currentState)
        notifyContextDidChange()
      }),
    ),
    effectCommand(log(`Update: ${targetState.name}`, targetState.data)),
  ]
}

const buildEnterStateCommands = <Command>({
  actionCommand,
  clearTimers,
  context,
  effectCommand,
  runtime,
  targetState,
}: Pick<
  TransitionOptions<Command>,
  | "actionCommand"
  | "clearTimers"
  | "context"
  | "effectCommand"
  | "runtime"
  | "targetState"
>): Command[] => {
  const exitState = context.currentState

  if (exitState && exitState.name !== targetState.name) {
    clearTimers()
  }

  const commands = [
    effectCommand(
      effect("nextState", targetState, () =>
        context.history.push(targetState as typeof context.currentState),
      ),
    ),
    effectCommand(log(`Enter: ${targetState.name}`, targetState.data)),
    actionCommand(beforeEnter(runtime)),
    actionCommand(enter()),
  ]

  if (!exitState) {
    return commands
  }

  return [actionCommand(exit()), ...commands]
}
