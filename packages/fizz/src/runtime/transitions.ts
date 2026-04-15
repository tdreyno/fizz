import type { Action } from "../action.js"
import { beforeEnter, enter, exit } from "../action.js"
import type { Context } from "../context.js"
import type { Effect } from "../effect.js"
import { effect, log } from "../effect.js"
import type { Runtime } from "../runtime.js"
import type { StateTransition } from "../state.js"

type RuntimeState = StateTransition<string, Action<string, unknown>, unknown>
type RuntimeActionMap = {
  [key: string]: (...args: Array<any>) => Action<string, unknown>
}

type CommandFactory<Command> = {
  actionCommand: (action: Action<string, unknown>) => Command
  effectCommand: (effect: Effect<unknown>) => Command
}

type TransitionOptions<
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> = CommandFactory<Command> & {
  clearAsync: () => void
  clearTimers: () => void
  context: Context
  notifyContextDidChange: () => void
  runtime: Runtime<AM, OAM>
  targetState: RuntimeState
}

type GoBackOptions<
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> = CommandFactory<Command> & {
  clearAsync: () => void
  clearTimers: () => void
  context: Context
  runtime: Runtime<AM, OAM>
}

export const buildStateTransitionCommands = <
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>({
  actionCommand,
  clearAsync,
  clearTimers,
  context,
  effectCommand,
  notifyContextDidChange,
  runtime,
  targetState,
}: TransitionOptions<Command, AM, OAM>): Command[] => {
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

export const buildGoBackCommands = <
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>({
  actionCommand,
  clearAsync,
  clearTimers,
  context,
  effectCommand,
  runtime,
}: GoBackOptions<Command, AM, OAM>): Command[] => {
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
}: {
  context: Context
  effectCommand: (effect: Effect<unknown>) => Command
  notifyContextDidChange: () => void
  targetState: RuntimeState
}): Command[] => {
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

const buildEnterStateCommands = <
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>({
  actionCommand,
  clearTimers,
  context,
  effectCommand,
  runtime,
  targetState,
}: {
  actionCommand: (action: Action<string, unknown>) => Command
  clearTimers: () => void
  context: Context
  effectCommand: (effect: Effect<unknown>) => Command
  runtime: Runtime<AM, OAM>
  targetState: RuntimeState
}): Command[] => {
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
