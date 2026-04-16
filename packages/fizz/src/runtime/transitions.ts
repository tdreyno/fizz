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
  context: Context
  notifyContextDidChange: () => void
  prepareForTransition: (targetState: RuntimeState) => void
  runtime: Runtime<AM, OAM>
  targetState: RuntimeState
}

type GoBackOptions<
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
> = CommandFactory<Command> & {
  context: Context
  prepareForGoBack: () => void
  runtime: Runtime<AM, OAM>
}

export const buildStateTransitionCommands = <
  Command,
  AM extends RuntimeActionMap,
  OAM extends RuntimeActionMap,
>({
  actionCommand,
  context,
  effectCommand,
  notifyContextDidChange,
  prepareForTransition,
  runtime,
  targetState,
}: TransitionOptions<Command, AM, OAM>): Command[] => {
  prepareForTransition(targetState)

  const exitState = context.currentState

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
  context,
  effectCommand,
  prepareForGoBack,
  runtime,
}: GoBackOptions<Command, AM, OAM>): Command[] => {
  prepareForGoBack()

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
  context,
  effectCommand,
  runtime,
  targetState,
}: {
  actionCommand: (action: Action<string, unknown>) => Command
  context: Context
  effectCommand: (effect: Effect<unknown>) => Command
  runtime: Runtime<AM, OAM>
  targetState: RuntimeState
}): Command[] => {
  const exitState = context.currentState

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
