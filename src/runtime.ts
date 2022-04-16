import { type Action, enter, exit, isAction } from "./action.js"
import { type Effect, effect, isEffect, log } from "./effect.js"
import { MissingCurrentState, UnknownStateReturnType } from "./errors.js"
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
  context: Context
  #contextChangeSubscribers: Set<ContextChangeSubscriber> = new Set()
  #validActions: Set<string>
  #queue: QueueItem[] = []
  #isRunning = false

  constructor(context: Context, validActionNames: Array<string> = []) {
    this.context = context
    this.#validActions = validActionNames.reduce(
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
    this.#contextChangeSubscribers.add(fn)

    return () => this.#contextChangeSubscribers.delete(fn)
  }

  disconnect(): void {
    this.#contextChangeSubscribers.clear()
  }

  canHandle(action: Action<any, any>): boolean {
    return this.#validActions.has((action.type as string).toLowerCase())
  }

  bindActions<
    AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  >(actions: AM): AM {
    return Object.keys(actions).reduce((sum, key) => {
      sum[key] = (...args: Array<any>) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion
        return this.run(actions[key]!(...args))
      }

      return sum
    }, {} as Record<string, any>) as AM
  }

  async run(action: Action<any, any>): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      this.#queue.push({
        onComplete: resolve,
        onError: reject,
        item: action,
      })
    })

    if (!this.#isRunning) {
      this.#isRunning = true
      void this.#processQueueHead()
    }

    await promise

    this.#contextDidChange()
  }

  async #processQueueHead(): Promise<void> {
    const head = this.#queue.shift()

    if (!head) {
      this.#isRunning = false
      return
    }

    const { item, onComplete, onError } = head

    // Make sure we're in a valid state.
    this.#validateCurrentState()

    try {
      let results: StateReturn[] = []

      if (isAction(item)) {
        results = await this.#executeAction(item)
      } else if (isStateTransition(item)) {
        results = this.#handleState(item)
      } else if (isEffect(item)) {
        if (item.label === "goBack") {
          results = this.#handleGoBack()
        } else {
          this.#runEffect(item)
        }
      } else {
        // Should be impossible to get here with TypeScript,
        // but could happen with plain JS.
        throw new UnknownStateReturnType(item)
      }

      const { promise, items } = this.#stateReturnsToQueueItems(results)

      // New items go to front of queue
      this.#queue = [...items, ...this.#queue]

      void promise.then(() => onComplete()).catch(e => onError(e))

      setTimeout(() => {
        void this.#processQueueHead()
      }, 0)
    } catch (e) {
      onError(e)
      this.#isRunning = false
      this.#queue.length = 0
    }
  }

  #stateReturnsToQueueItems(stateReturns: StateReturn[]): {
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

  #contextDidChange() {
    this.#contextChangeSubscribers.forEach(sub => sub(this.context))
  }

  #validateCurrentState() {
    const runCurrentState = this.currentState()

    if (!runCurrentState) {
      throw new Error(
        `Fizz could not find current state to run action on. History: ${JSON.stringify(
          this.currentHistory()
            .toArray()
            .map(({ name }) => name as string)
            .join(" -> "),
        )}`,
      )
    }
  }

  #runEffect(e: Effect<any>) {
    e.executor(this.context)
  }

  async #executeAction<A extends Action<any, any>>(
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

  #handleState(targetState: StateTransition<any, any, any>): StateReturn[] {
    const exitState = this.context.currentState

    const isUpdating =
      exitState &&
      exitState.name === targetState.name &&
      targetState.mode === "update"

    return isUpdating
      ? this.#updateState(targetState)
      : this.#enterState(targetState)
  }

  #updateState(targetState: StateTransition<any, any, any>): StateReturn[] {
    return [
      // Update history
      effect("nextState", targetState, () => {
        this.context.history.pop()
        this.context.history.push(targetState)
      }),

      // Add a log effect.
      log(`Update: ${targetState.name as string}`, targetState.data),
    ]
  }

  #enterState(targetState: StateTransition<any, any, any>): StateReturn[] {
    const exitState = this.context.currentState

    const effects: StateReturn[] = [
      // Update history
      effect("nextState", targetState, () =>
        this.context.history.push(targetState),
      ),

      // Add a log effect.
      log(`Enter: ${targetState.name as string}`, targetState.data),

      // Run enter on next state
      enter(),

      // Notify listeners of change
      // effect("contextChange", undefined, () => {
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

  #handleGoBack(): StateReturn[] {
    return [
      // Update history
      effect("updateHistory", undefined, () => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        this.context.history.pop()
      }),

      enter(),
    ]
  }
}

export const createRuntime = (
  context: Context,
  validActionNames: Array<string> = [],
) => new Runtime(context, validActionNames)
