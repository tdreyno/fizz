import { Action, enter, exit, isAction } from "./action.js"
import { Effect, isEffect, log, __internalEffect } from "./effect.js"
import {
  MissingCurrentState,
  NoStatesRespondToAction,
  StateDidNotRespondToAction,
  UnknownStateReturnType,
} from "./errors.js"
import { StateReturn, StateTransition, isStateTransition } from "./state.js"

import type { Context } from "./context.js"
import { LinkedList } from "./LinkedList.js"
import { execute } from "./core.js"
import { arraySingleton, externalPromise } from "./util.js"

type ContextChangeSubscriber = (context: Context) => void

// bindActions: <
// AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
// >(
// actions: AM,
// ) => AM

type QueueItem = {
  onComplete: () => void
  item: Action<any, any> | StateTransition<any, any, any> | Effect<any>
}

export class Runtime {
  contextChangeSubscribers_: Set<ContextChangeSubscriber> = new Set()
  validActions_: Set<string>
  queue_ = LinkedList.empty<QueueItem>()

  constructor(
    public context: Context,
    public validActionNames: Array<string> = [],
  ) {
    this.validActions_ = validActionNames.reduce(
      (sum, action) => sum.add(action.toLowerCase()),
      new Set<string>(),
    )
  }

  currentState(): StateTransition<any, any, any> {
    return this.context.currentState
  }

  currentHistory() {
    return this.context.history
  }

  onContextChange(fn: ContextChangeSubscriber): () => void {
    this.contextChangeSubscribers_.add(fn)

    return () => this.contextChangeSubscribers_.delete(fn)
  }

  disconnect(): void {
    this.contextChangeSubscribers_.clear()
  }

  canHandle(action: Action<any, any>): boolean {
    return this.validActions_.has((action.type as string).toLowerCase())
  }

  run(action: Action<any, any>): Promise<void> {
    return new Promise<void>(resolve => {
      this.queue_.push({
        onComplete: resolve,
        item: action,
      })
    })
  }

  async processQueueHead_() {
    const head = this.queue_.shift()

    if (!head) {
      return
    }

    const { item, onComplete } = head

    // Make sure we're in a valid state.
    this.validateCurrentState_()

    try {
      let results: StateReturn[] = []

      if (isAction(item)) {
        results = this.executeAction_(item)
      } else if (isStateTransition(item)) {
        // this.currentState().executor(exit())
        // item.executor(enter())
        results = execute(enter(), this.context)

        // Only state changes (and updates) can change context
        this.onContextChange_()
      } else if (isEffect(item)) {
        if (item.label === "reenter") {
          results = [] // go to current state
        } else if (item.label === "goBack") {
          results = [] // go to previous state
        } else {
          // run effect
          item.executor(this.context)
        }
      } else {
        // Should be impossible to get here with TypeScript,
        // but could happen with plain JS.
        throw new UnknownStateReturnType(item)
      }

      const { promise, items } = this.stateReturnsToQueueItems_(results)

      // New items go to front of queue
      this.queue_.prefix(items)

      await promise

      onComplete()
    } catch (e) {
      console.error(e)
      this.queue_.clear()
    }
  }

  stateReturnsToQueueItems_(stateReturns: StateReturn[]): {
    promise: Promise<void[]>
    items: QueueItem[]
  } {
    const { promises, items } = stateReturns.reduce(
      (acc, item) => {
        const { promise, resolve } = externalPromise<void>()

        acc.promises.push(promise)

        acc.items.push({
          onComplete: resolve,
          item,
        })

        return acc
      },
      {
        promises: [] as Promise<void>[],
        items: [] as QueueItem[],
      },
    )

    return { promise: Promise.all(promises), items }
  }

  onContextChange_() {
    this.contextChangeSubscribers_.forEach(sub => sub(this.context))
  }

  validateCurrentState_() {
    const runCurrentState = this.currentState()

    if (!runCurrentState) {
      throw new Error(
        `Fizz could not find current state to run action on. History: ${JSON.stringify(
          this.currentHistory()
            .map(({ name }) => name as string)
            .join(" -> "),
        )}`,
      )
    }
  }

  executeAction_(action: Action<any, any>): StateReturn[] {
    // Try this runtime.
    try {
      return execute(action, this.context)
    } catch (e) {
      // If it failed to handle optional actions like OnFrame, continue.
      if (!(e instanceof StateDidNotRespondToAction)) {
        throw e
      }

      throw new NoStatesRespondToAction([this.currentState()], e.action)
    }
  }

  bindActions<
    AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  >(actions: AM): AM {
    return Object.keys(actions).reduce((sum, key) => {
      sum[key] = (...args: Array<any>) => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion
          return this.run(actions[key]!(...args))
        } catch (e) {
          if (e instanceof NoStatesRespondToAction) {
            if (this.context.customLogger) {
              this.context.customLogger([e.toString()], "error")
            } else if (!this.context.disableLogging) {
              console.error(e.toString())
            }

            return
          }

          throw e
        }
      }

      return sum
    }, {} as Record<string, any>) as AM
  }
}

const enterState = (
  context: Context,
  targetState: StateTransition<any, any, any>,
  exitState?: StateTransition<any, any, any>,
): StateReturn[] => {
  let exitEffects: Array<StateReturn> = []

  if (exitState) {
    exitEffects.push(__internalEffect("exited", exitState, () => void 0))

    try {
      const result = execute(exit(), context, exitState)

      exitEffects = exitEffects.concat(result)
    } catch (e) {
      if (!(e instanceof StateDidNotRespondToAction)) {
        throw e
      }
    }
  }

  return [
    ...exitEffects,

    // Add a log effect.
    log(`Enter: ${targetState.name as string}`, targetState.data),

    // Add a goto effect for testing.
    __internalEffect("entered", targetState, () => void 0),
  ]
}

export const execute = <A extends Action<any, any>>(
  action: A,
  context: Context,
  targetState = context.currentState,
  exitState = context.history.previous,
): StateReturn[] => {
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

    return [
      // Add a log effect.
      log(`Update: ${targetState.name as string}`, targetState.data),

      // Add a goto effect for testing.
      __internalEffect("update", targetState, () => void 0),
    ]
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
    : []

  const result = targetState.executor(action)

  return prefix.concat(arraySingleton<StateReturn>(result))
}
