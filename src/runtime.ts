import { type Action, enter, exit, isAction, beforeEnter } from "./action.js"
import { type Effect, effect, isEffect, log } from "./effect.js"
import { MissingCurrentState, UnknownStateReturnType } from "./errors.js"
import {
  type StateReturn,
  type StateTransition,
  isStateTransition,
} from "./state.js"
import { arraySingleton, externalPromise } from "./util.js"

import type { Context } from "./context.js"

type ContextChangeSubscriber = (context: Context) => void
type OutputSubscriber<
  OAM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
> = (action: ReturnType<OAM[keyof OAM]>) => void | Promise<void>

type QueueItem = {
  onComplete: () => void
  onError: (e: unknown) => void
  item: Action<any, any> | StateTransition<any, any, any> | Effect<any>
}

export class Runtime<
  AM extends {
    [key: string]: (...args: Array<any>) => Action<any, any>
  },
  OAM extends {
    [key: string]: (...args: Array<any>) => Action<any, any>
  },
> {
  #contextChangeSubscribers: Set<ContextChangeSubscriber> = new Set()
  #outputSubscribers: Set<OutputSubscriber<OAM>> = new Set()
  #validActions: Set<string>
  #queue: QueueItem[] = []
  #isRunning = false

  constructor(
    public context: Context,
    public internalActions: AM,
    public outputActions: OAM,
  ) {
    this.#validActions = Object.keys(internalActions).reduce(
      (sum, action) => sum.add(action.toLowerCase()),
      new Set<string>(),
    )
  }

  currentState(): StateTransition<string, any, unknown> {
    return this.context.currentState as StateTransition<string, any, unknown>
  }

  currentHistory() {
    return this.context.history
  }

  onContextChange(fn: ContextChangeSubscriber): () => void {
    this.#contextChangeSubscribers.add(fn)

    return () => this.#contextChangeSubscribers.delete(fn)
  }

  onOutput(fn: OutputSubscriber<OAM>): () => void {
    this.#outputSubscribers.add(fn)

    return () => this.#outputSubscribers.delete(fn)
  }

  respondToOutput<
    T extends OAM["type"],
    P extends Extract<OAM, { type: T }>["payload"],
    A extends ReturnType<AM[keyof AM]>,
  >(type: T, handler: (payload: P) => Promise<A> | A | void): () => void {
    return this.onOutput(async output => {
      if (output.type === type) {
        const maybeAction = await handler(output.payload as P)

        if (maybeAction) {
          await this.run(maybeAction)
        }
      }
    })
  }

  disconnect(): void {
    this.#contextChangeSubscribers.clear()
  }

  canHandle(action: Action<any, any>): boolean {
    return this.#validActions.has((action.type as string).toLowerCase())
  }

  bindActions<
    AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
    PM = {
      [K in keyof AM]: (...args: Parameters<AM[K]>) => {
        asPromise: () => Promise<void>
      }
    },
  >(actions: AM): PM {
    return Object.keys(actions).reduce((sum, key) => {
      sum[key] = (...args: Array<any>) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-non-null-assertion
        const promise = this.run(actions[key]!(...args))

        return {
          asPromise: () => promise,
        }
      }

      return sum
    }, {} as Record<string, any>) as PM
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
        } else if (item.label === "output") {
          this.#outputSubscribers.forEach(sub => {
            void sub(item.data as ReturnType<OAM[keyof OAM]>)
          })
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

    const result = await targetState.executor(action, this)

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
        this.#contextDidChange()
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
      beforeEnter(this),

      // Run enter on next state
      enter(),
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

      beforeEnter(this),

      enter(),
    ]
  }
}

export const createRuntime = <
  AM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
  OAM extends { [key: string]: (...args: Array<any>) => Action<any, any> },
>(
  context: Context,
  internalActions: AM = {} as AM,
  outputActions: OAM = {} as OAM,
) => new Runtime(context, internalActions, outputActions)
