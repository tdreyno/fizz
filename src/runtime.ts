import { Action, enter, exit, isAction } from "./action.js"
import { Effect, __internalEffect, isEffect, log } from "./effect.js"
import {
  MissingCurrentState,
  NoStatesRespondToAction,
  StateDidNotRespondToAction,
  UnknownStateReturnType,
} from "./errors.js"
import { StateReturn, StateTransition, isStateTransition } from "./state.js"
import { arraySingleton, externalPromise } from "./util.js"

import type { Context } from "./context.js"
import { LinkedList } from "./LinkedList.js"

type ContextChangeSubscriber = (context: Context) => void

type QueueItem = {
  onComplete: () => void
  item: Action<any, any> | StateTransition<any, any, any> | Effect<any>
}

export class Runtime {
  contextChangeSubscribers_: Set<ContextChangeSubscriber> = new Set()
  validActions_: Set<string>
  queue_ = LinkedList.empty<QueueItem>()
  isRunning = false

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
    const promise = new Promise<void>(resolve => {
      this.queue_.push({
        onComplete: resolve,
        item: action,
      })
    })

    if (!this.isRunning) {
      this.processQueueHead_()
    }

    return promise
  }

  processQueueHead_(): void {
    const head = this.queue_.shift()

    if (!head) {
      this.isRunning = false
      return
    }

    const { item, onComplete } = head

    // Make sure we're in a valid state.
    this.validateCurrentState_()

    try {
      let results: StateReturn[] = []

      if (isAction(item)) {
        results = this.executeAction_(item)
        // What if handler is async?
      } else if (isStateTransition(item)) {
        results = this.enterState_(item)
      } else if (isEffect(item)) {
        if (item.label === "reenter") {
          results = [] // go to current state
        } else if (item.label === "goBack") {
          results = [] // go to previous state
        } else {
          this.runEffect_(item)
        }
      } else {
        // Should be impossible to get here with TypeScript,
        // but could happen with plain JS.
        throw new UnknownStateReturnType(item)
      }

      const { promise, items } = this.stateReturnsToQueueItems_(results)

      // New items go to front of queue
      this.queue_.prefix(items)

      void promise.then(() => onComplete())

      setTimeout(() => {
        this.processQueueHead_()
      }, 0)
    } catch (e) {
      console.error(e)
      this.isRunning = false
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

  runEffect_(e: Effect<any>) {
    e.executor(this.context)
  }

  executeAction_<A extends Action<any, any>>(
    action: A,
    // exitState = this.context.history.previous,
  ): StateReturn[] {
    const targetState = this.context.currentState
    if (!targetState) {
      throw new MissingCurrentState("Must provide a current state")
    }

    // const isUpdating =
    //   exitState &&
    //   exitState.name === targetState.name &&
    //   targetState.mode === "update" &&
    //   action.type === "Enter"

    // if (isUpdating) {
    //   // TODO: Needs to be lazy
    //   this.context.history.removePrevious()

    //   return [
    //     // Add a log effect.
    //     log(`Update: ${targetState.name as string}`, targetState.data),

    //     // Add a goto effect for testing.
    //     __internalEffect("update", targetState, () => void 0),
    //   ]
    // }

    // const isReentering =
    //   exitState &&
    //   exitState.name === targetState.name &&
    //   targetState.mode === "append" &&
    //   action.type === "Enter"

    //!isUpdating && !isReentering &&
    // const isEnteringNewState = action.type === "Enter"

    // const prefix = isEnteringNewState
    //   ? this.enterState_(targetState, exitState)
    //   : []

    const result = targetState.executor(action)

    // return prefix.concat(
    return arraySingleton<StateReturn>(result)
    // )
  }

  enterState_(targetState: StateTransition<any, any, any>): StateReturn[] {
    const exitState = this.context.currentState

    const effects: StateReturn[] = [
      // Update history
      __internalEffect("nextState", targetState, () =>
        this.context.history.push(targetState),
      ),

      // Add a log effect.
      log(`Enter: ${targetState.name as string}`, targetState.data),

      // Run enter on next state
      enter(),

      // Notify listeners of change
      // __internalEffect("contextChange", undefined, () => {
      //   // Only state changes (and updates) can change context
      //   this.onContextChange_()
      // }),
    ]

    // Run exit on prior state first
    if (exitState) {
      effects.unshift(exit())
    }

    return effects
  }
}

export const createRuntime = (
  context: Context,
  validActionNames: Array<string> = [],
) => new Runtime(context, validActionNames)
