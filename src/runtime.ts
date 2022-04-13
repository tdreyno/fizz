import { Action, enter, exit, isAction } from "./action.js"
import { Effect, __internalEffect, isEffect, log } from "./effect.js"
import {
  MissingCurrentState,
  NoStatesRespondToAction,
  UnknownStateReturnType,
} from "./errors.js"
import { StateReturn, StateTransition, isStateTransition } from "./state.js"
import { arraySingleton, externalPromise } from "./util.js"

import type { Context } from "./context.js"

type ContextChangeSubscriber = (context: Context) => void

type QueueItem = {
  onComplete: () => void
  onError: (e: unknown) => void
  item: Action<any, any> | StateTransition<any, any, any> | Effect<any>
}

export class Runtime {
  contextChangeSubscribers_: Set<ContextChangeSubscriber> = new Set()
  validActions_: Set<string>
  queue_: QueueItem[] = []
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

  async run(action: Action<any, any>): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.queue_.push({
        onComplete: resolve,
        onError: reject,
        item: action,
      })
    })

    if (!this.isRunning) {
      this.isRunning = true
      void this.processQueueHead_()
    }

    await promise

    this.contextDidChange_()
  }

  async processQueueHead_(): Promise<void> {
    const head = this.queue_.shift()

    if (!head) {
      this.isRunning = false
      return
    }

    const { item, onComplete, onError } = head

    // Make sure we're in a valid state.
    this.validateCurrentState_()

    try {
      let results: StateReturn[] = []

      if (isAction(item)) {
        results = await this.executeAction_(item)
      } else if (isStateTransition(item)) {
        results = this.handleState_(item)
      } else if (isEffect(item)) {
        if (item.label === "goBack") {
          results = this.handleGoBack_()
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
      this.queue_ = [...items, ...this.queue_]

      void promise.then(() => onComplete()).catch(e => onError(e))

      setTimeout(() => {
        void this.processQueueHead_()
      }, 0)
    } catch (e) {
      onError(e)
      this.isRunning = false
      this.queue_.length = 0
    }
  }

  stateReturnsToQueueItems_(stateReturns: StateReturn[]): {
    promise: Promise<void[]>
    items: QueueItem[]
  } {
    const { promises, items } = stateReturns.reduce(
      (acc, item) => {
        const { promise, resolve, reject } = externalPromise<void>()

        acc.promises.push(promise)

        acc.items.push({
          onComplete: resolve,
          onError: reject,
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

  contextDidChange_() {
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
            } else if (this.context.enableLogging) {
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

  async executeAction_<A extends Action<any, any>>(
    action: A,
  ): Promise<StateReturn[]> {
    const targetState = this.context.currentState

    if (!targetState) {
      throw new MissingCurrentState("Must provide a current state")
    }

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

    const result = await targetState.executor(action)

    return arraySingleton(result)
  }

  handleState_(targetState: StateTransition<any, any, any>): StateReturn[] {
    const exitState = this.context.currentState

    const isUpdating =
      exitState &&
      exitState.name === targetState.name &&
      targetState.mode === "update"

    return isUpdating
      ? this.updateState_(targetState)
      : this.enterState_(targetState)
  }

  updateState_(targetState: StateTransition<any, any, any>): StateReturn[] {
    return [
      // Update history
      __internalEffect("nextState", targetState, () => {
        this.context.history.removePrevious()
        this.context.history.push(targetState)
      }),

      // Add a log effect.
      log(`Update: ${targetState.name as string}`, targetState.data),
    ]
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

  handleGoBack_(): StateReturn[] {
    return [
      // Update history
      __internalEffect("updateHistory", undefined, () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.context.history.push(this.context.history.previous!)
      }),

      enter(),
    ]
  }
}

export const createRuntime = (
  context: Context,
  validActionNames: Array<string> = [],
) => new Runtime(context, validActionNames)
