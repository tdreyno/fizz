/* eslint-disable @typescript-eslint/no-use-before-define, @typescript-eslint/no-misused-promises */
import { Action, enter, exit, isAction } from "./action.js"
import { Effect, __internalEffect, isEffect, log } from "./effect.js"
import { ExecuteResult, executeResultfromTask } from "./execute-result.js"
import {
  MissingCurrentState,
  StateDidNotRespondToAction,
  UnknownStateReturnType,
} from "./errors"
import { StateReturn, StateTransition, isStateTransition } from "./state.js"

import { Context } from "./context.js"
import { Task } from "@tdreyno/pretty-please"
import { arraySingleton } from "./util.js"

const enterState = (
  context: Context,
  targetState: StateTransition<any, any, any>,
  exitState?: StateTransition<any, any, any>,
): ExecuteResult => {
  let exitEffects: Array<Effect> = []
  let exitTasks: Array<Task<any, void | StateReturn | Array<StateReturn>>> = []

  if (exitState) {
    exitEffects.push(__internalEffect("exited", exitState, Task.empty))

    try {
      const result = execute(exit(), context, exitState)

      exitEffects = exitEffects.concat(result.effects)
      exitTasks = result.tasks
    } catch (e) {
      if (!(e instanceof StateDidNotRespondToAction)) {
        throw e
      }
    }
  }

  return ExecuteResult(
    [
      ...exitEffects,

      // Add a log effect.
      log(`Enter: ${targetState.name as string}`, targetState.data),

      // Add a goto effect for testing.
      __internalEffect("entered", targetState, Task.empty),
    ],

    exitTasks,
  )
}

export const execute = <A extends Action<any, any>>(
  action: A,
  context: Context,
  targetState = context.currentState,
  exitState = context.history.previous,
): ExecuteResult => {
  if (!targetState) {
    throw new MissingCurrentState("Must provide a current state")
  }

  const isUpdating =
    exitState &&
    exitState.name === targetState.name &&
    targetState.mode === "update" &&
    action.type === "Enter"

  if (isUpdating) {
    // TODO: Needs to be lazy
    context.history.removePrevious()

    return ExecuteResult([
      // Add a log effect.
      log(`Update: ${targetState.name as string}`, targetState.data),

      // Add a goto effect for testing.
      __internalEffect("update", targetState, Task.empty),
    ])
  }

  const isReentering =
    exitState &&
    exitState.name === targetState.name &&
    targetState.mode === "append" &&
    action.type === "Enter"

  const isEnteringNewState =
    !isUpdating && !isReentering && action.type === "Enter"

  const prefix = isEnteringNewState
    ? enterState(context, targetState, exitState)
    : ExecuteResult()

  const result = targetState.executor(action)

  // State transition produced no side-effects
  if (!result) {
    if (context.allowUnhandled) {
      return ExecuteResult()
    }

    throw new StateDidNotRespondToAction(targetState, action)
  }

  return processStateReturn(context, prefix, result)
}

export const processStateReturn = (
  context: Context,
  prefix: ExecuteResult,
  result: void | StateReturn | Array<StateReturn>,
): ExecuteResult =>
  arraySingleton<StateReturn>(result).reduce(
    (sum, item) => sum.concat(processIndividualStateReturn(context, item)),
    prefix,
  )

const processIndividualStateReturn = (
  context: Context,
  item: StateReturn,
): ExecuteResult => {
  const targetState = context.currentState

  if (isEffect(item)) {
    if (item.label === "reenter") {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!item.data.replaceHistory) {
        // Insert onto front of history array.
        context.history.push(targetState)
      }

      return execute(enter(), context, targetState, targetState).prependEffect(
        item,
      )
    }

    if (item.label === "goBack") {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const previousState = context.history.previous!

      // Insert onto front of history array.
      context.history.push(previousState)

      return execute(enter(), context, previousState).prependEffect(item)
    }

    return ExecuteResult(item)
  }

  // If we get a state handler, transition to it.
  if (isStateTransition(item)) {
    // TODO: Make async.
    // Insert onto front of history array.
    context.history.push(item)

    return execute(enter(), context)
  }

  // If we get an action, convert to task.
  if (isAction(item)) {
    return executeResultfromTask(Task.of(item))
  }

  // If we get a promise, convert it to a Task
  if (item instanceof Promise) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return executeResultfromTask(Task.fromPromise(item))
  }

  // If we get a task, hold on to it.
  if (item instanceof Task) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    return executeResultfromTask(item)
  }

  // Should be impossible to get here with TypeScript,
  // but could happen with plain JS.
  throw new UnknownStateReturnType(item)
}

export const runEffects = (context: Context, effects: Effect[]): void =>
  effects.forEach(e => e.executor(context))
